"use server";

import { audit, db, enqueueJob } from "@domus-ads/core";
import { aplicarRegras } from "@domus-ads/core/financeiro-db";
import { NATUREZAS, padrao } from "@domus-ads/core/financeiro";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";

/** Financeiro é pessoal (contas do dono da plataforma): só o admin da plataforma. */
async function admin() {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) throw new Error("Só o administrador da plataforma usa o Financeiro");
  return ctx;
}
const fim = () => revalidatePath("/financeiro", "layout");

const pessoa = z.enum(["PF", "PJ"], { message: "Escolha pessoa física ou jurídica" });
const cor = z.string().regex(/^#[0-9a-f]{6}$/i, "Cor inválida").transform((c) => c.toLowerCase());
const reais = z.number({ message: "Valor inválido" }).min(0, "Valor não pode ser negativo").max(10_000_000, "Valor alto demais");

async function filaSync(itemId: string | null, userId: string) {
  const sql = db();
  const [j] = await sql`select 1 from ads.jobs where type = 'FIN_SYNC' and status in ('PENDING', 'RUNNING')`;
  if (j) return false;
  await enqueueJob(sql, { workspaceId: null, type: "FIN_SYNC", payload: itemId ? { itemId } : {}, createdBy: userId, maxAttempts: 1 });
  return true;
}

/** Conecta um banco: o Item ID vem do painel da Pluggy (o worker usa as credenciais do .env dele). */
export async function salvarConexao(input: unknown) {
  return run(async () => {
    const ctx = await admin();
    const f = z.object({
      itemId: z.string().trim().uuid("Item ID inválido: copie do painel da Pluggy (⋮ → Copiar Item ID)"),
      pessoa,
      apelido: z.string().trim().max(60, "Apelido até 60 caracteres").optional(),
    }).parse(input);
    await db()`insert into ads.fin_conexoes (item_id, pessoa, apelido) values (${f.itemId}, ${f.pessoa}, ${f.apelido || null})
      on conflict (item_id) do update set pessoa = excluded.pessoa, apelido = excluded.apelido`;
    await filaSync(f.itemId, ctx.user.id);
    await audit(db(), { workspaceId: null, actor: ctx.actor, action: "Financeiro: banco conectado", entityType: "fin_conexao", entityId: f.itemId, entityName: f.apelido || f.itemId });
    fim();
  });
}

export async function removerConexao(itemId: string) {
  return run(async () => {
    const ctx = await admin();
    const id = z.string().uuid("Conexão inválida").parse(itemId);
    await db()`delete from ads.fin_conexoes where item_id = ${id}`;
    await audit(db(), { workspaceId: null, actor: ctx.actor, action: "Financeiro: banco removido", entityType: "fin_conexao", entityId: id, entityName: id });
    fim();
  });
}

export async function sincronizar() {
  return run(async () => {
    const ctx = await admin();
    const [w] = await db()<{ ok: boolean }[]>`select last_seen > now() - interval '90 seconds' as ok from ads.worker_status order by last_seen desc limit 1`;
    if (!w?.ok) throw new Error("O worker está offline: a sincronização roda no PC do worker.");
    if (!(await filaSync(null, ctx.user.id))) throw new Error("Já tem uma sincronização em andamento.");
    fim();
  });
}

/** PF/PJ, apelido, categoria das entradas e ocultar. Trocar PF/PJ move o histórico da conta junto. */
export async function salvarConta(input: unknown) {
  return run(async () => {
    await admin();
    const f = z.object({
      id: z.string().uuid("Conta inválida"),
      pessoa,
      apelido: z.string().trim().max(60, "Apelido até 60 caracteres").nullable(),
      categoriaRendaId: z.number().int().positive().nullable(),
      oculta: z.boolean(),
    }).parse(input);
    const sql = db();
    await sql.begin(async (tx) => {
      await tx`update ads.fin_contas set pessoa = ${f.pessoa}, apelido = ${f.apelido || null}, categoria_renda_id = ${f.categoriaRendaId}, oculta = ${f.oculta}, updated_at = now() where id = ${f.id}`;
      await tx`update ads.fin_transacoes set pessoa = ${f.pessoa} where conta_id = ${f.id} and pessoa <> ${f.pessoa}`;
      await tx`update ads.fin_assinaturas set pessoa = ${f.pessoa} where conta_id = ${f.id}`;
      // entradas desta conta sem categoria escolhida à mão seguem a nova categoria de renda
      if (f.categoriaRendaId) await tx`update ads.fin_transacoes set categoria_id = ${f.categoriaRendaId} where conta_id = ${f.id} and natureza = 'renda' and not categoria_manual`;
    });
    fim();
  });
}

const classificacao = z.object({
  id: z.string().uuid("Transação inválida"),
  categoriaId: z.number().int().positive().nullable().optional(),
  natureza: z.enum(NATUREZAS as [string, ...string[]], { message: "Tipo inválido" }).optional(),
  etiquetas: z.array(z.number().int().positive()).max(10, "Até 10 etiquetas").optional(),
  nota: z.string().trim().max(500, "Nota até 500 caracteres").nullable().optional(),
  parecidas: z.boolean().default(false),
});

/**
 * Classifica uma transação. "Aplicar às parecidas" vira regra: vale para o histórico e para o que chegar nos próximos syncs
 * (compara a descrição sem números, ex.: "UBER *TRIP 1234" = "UBER *TRIP 9876").
 */
export async function classificar(input: unknown) {
  return run(async () => {
    await admin();
    const f = classificacao.parse(input);
    const sql = db();
    const [t] = await sql<{ padrao: string; conta_id: string; etiquetas: number[] }[]>`
      select padrao, conta_id, coalesce((select array_agg(etiqueta_id) from ads.fin_transacao_etiquetas where transacao_id = t.id), '{}') as etiquetas
      from ads.fin_transacoes t where id = ${f.id}`;
    if (!t) throw new Error("Transação não encontrada");
    let afetadas = 1;
    await sql.begin(async (tx) => {
      if (f.categoriaId !== undefined) await tx`update ads.fin_transacoes set categoria_id = ${f.categoriaId}, categoria_manual = true, updated_at = now() where id = ${f.id}`;
      if (f.natureza) await tx`update ads.fin_transacoes set natureza = ${f.natureza}, natureza_manual = true, updated_at = now() where id = ${f.id}`;
      if (f.nota !== undefined) await tx`update ads.fin_transacoes set nota = ${f.nota || null}, updated_at = now() where id = ${f.id}`;
      const novas = f.etiquetas ? f.etiquetas.filter((e) => !t.etiquetas.includes(e)) : [];
      if (f.etiquetas) {
        await tx`delete from ads.fin_transacao_etiquetas where transacao_id = ${f.id} and not (etiqueta_id = any(${f.etiquetas}::int[]))`;
        for (const e of novas) await tx`insert into ads.fin_transacao_etiquetas values (${f.id}, ${e}) on conflict do nothing`;
      }
      if (f.parecidas && t.padrao.length >= 2) {
        if (f.categoriaId) await tx`insert into ads.fin_regras (padrao, categoria_id) values (${t.padrao}, ${f.categoriaId})`;
        if (f.natureza) await tx`insert into ads.fin_regras (padrao, natureza) values (${t.padrao}, ${f.natureza})`;
        for (const e of novas) await tx`insert into ads.fin_regras (padrao, etiqueta_id) values (${t.padrao}, ${e})`;
      }
    });
    if (f.parecidas) afetadas += await aplicarRegras(sql);
    fim();
    return { afetadas };
  });
}

export async function removerRegra(id: number) {
  return run(async () => {
    await admin();
    await db()`delete from ads.fin_regras where id = ${z.number().int().positive().parse(id)}`;
    fim();
  });
}

export async function salvarEtiqueta(input: unknown) {
  return run(async () => {
    await admin();
    const f = z.object({
      id: z.number().int().positive().optional(),
      nome: z.string().trim().min(1, "Dê um nome à etiqueta").max(30, "Nome até 30 caracteres"),
      cor,
      emoji: z.string().trim().max(8, "Emoji inválido").nullable(),
    }).parse(input);
    const sql = db();
    const [dup] = await sql`select 1 from ads.fin_etiquetas where lower(nome) = lower(${f.nome}) and id <> ${f.id ?? 0}`;
    if (dup) throw new Error("Já existe uma etiqueta com esse nome");
    if (f.id) await sql`update ads.fin_etiquetas set nome = ${f.nome}, cor = ${f.cor}, emoji = ${f.emoji || null} where id = ${f.id}`;
    else await sql`insert into ads.fin_etiquetas (nome, cor, emoji) values (${f.nome}, ${f.cor}, ${f.emoji || null})`;
    fim();
  });
}

export async function removerEtiqueta(id: number) {
  return run(async () => {
    await admin();
    await db()`delete from ads.fin_etiquetas where id = ${z.number().int().positive().parse(id)}`;
    fim();
  });
}

export async function salvarCategoria(input: unknown) {
  return run(async () => {
    await admin();
    const f = z.object({
      id: z.number().int().positive().optional(),
      nome: z.string().trim().min(1, "Dê um nome à categoria").max(40, "Nome até 40 caracteres"),
      tipo: z.enum(["gasto", "renda"], { message: "Tipo inválido" }),
      cor,
      orcamento: reais.nullable(),
    }).parse(input);
    const sql = db();
    const [dup] = await sql`select 1 from ads.fin_categorias where lower(nome) = lower(${f.nome}) and id <> ${f.id ?? 0}`;
    if (dup) throw new Error("Já existe uma categoria com esse nome");
    const orc = f.orcamento ? f.orcamento.toFixed(2) : null;
    if (f.id) await sql`update ads.fin_categorias set nome = ${f.nome}, cor = ${f.cor}, orcamento = ${orc} where id = ${f.id}`;
    else await sql`insert into ads.fin_categorias (nome, tipo, cor, orcamento, posicao) values (${f.nome}, ${f.tipo}, ${f.cor}, ${orc}, 50)`;
    fim();
  });
}

export async function removerCategoria(id: number) {
  return run(async () => {
    await admin();
    await db()`delete from ads.fin_categorias where id = ${z.number().int().positive().parse(id)}`;
    fim();
  });
}

/** Confirmar / ignorar uma assinatura sugerida (ignorada some dos totais e deixa de ser sugerida). */
export async function statusAssinatura(id: number, status: unknown) {
  return run(async () => {
    await admin();
    const aid = z.number().int().positive().parse(id);
    const s = z.enum(["sugerida", "confirmada", "ignorada"], { message: "Status inválido" }).parse(status);
    const sql = db();
    const [a] = await sql<{ padrao: string; pessoa: string }[]>`update ads.fin_assinaturas set status = ${s}, updated_at = now() where id = ${aid} returning padrao, pessoa`;
    if (!a) throw new Error("Assinatura não encontrada");
    await sql`update ads.fin_transacoes set assinatura_id = ${s === "ignorada" ? null : aid}
      where padrao = ${a.padrao} and pessoa = ${a.pessoa} and natureza = 'gasto' and coalesce(total_parcelas, 1) <= 1`;
    fim();
  });
}

/** Marca uma cobrança como assinatura à mão (a detecção automática pede 3 meses). */
export async function virarAssinatura(txId: string) {
  return run(async () => {
    await admin();
    const sql = db();
    const [t] = await sql<{ padrao: string; descricao: string; valor: string; data: string; conta_id: string; pessoa: string; categoria_id: number | null }[]>`
      select padrao, descricao, valor, data::text, conta_id, pessoa, categoria_id from ads.fin_transacoes where id = ${z.string().uuid("Transação inválida").parse(txId)}`;
    if (!t) throw new Error("Transação não encontrada");
    const p = t.padrao || padrao(t.descricao);
    const [a] = await sql<{ id: number }[]>`
      insert into ads.fin_assinaturas (padrao, nome, valor_medio, valor_ultimo, dia_cobranca, categoria_id, conta_id, pessoa, status, ocorrencias, primeira, ultima)
      values (${p}, ${t.descricao}, ${t.valor}, ${t.valor}, ${Number(t.data.slice(8, 10))}, ${t.categoria_id}, ${t.conta_id}, ${t.pessoa}, 'confirmada', 1, ${t.data}, ${t.data})
      on conflict (padrao) do update set status = 'confirmada', updated_at = now() returning id`;
    await sql`update ads.fin_transacoes set assinatura_id = ${a!.id} where padrao = ${p} and pessoa = ${t.pessoa} and natureza = 'gasto' and coalesce(total_parcelas, 1) <= 1`;
    fim();
  });
}

export async function analisarComIA(input: unknown) {
  return run(async () => {
    const ctx = await admin();
    const f = z.object({
      pessoa,
      mes: z.string().regex(/^\d{4}-\d{2}-01$/, "Mês inválido"),
      pergunta: z.string().trim().max(1000, "Pergunta até 1000 caracteres").optional(),
    }).parse(input);
    const sql = db();
    const [ia] = await sql`select 1 from ads.ai_accounts where status = 'ACTIVE' limit 1`;
    if (!ia) throw new Error("Nenhuma conta de IA conectada (Configurações → IA).");
    const [g] = await sql`select 1 from ads.fin_analises where status = 'gerando' and created_at > now() - interval '15 minutes'`;
    if (g) throw new Error("Já tem uma análise sendo gerada. Espere terminar.");
    const [a] = await sql<{ id: string }[]>`insert into ads.fin_analises (pessoa, mes, pergunta) values (${f.pessoa}, ${f.mes}, ${f.pergunta || null}) returning id`;
    const job = await enqueueJob(sql, { workspaceId: null, type: "AI_FINANCEIRO", payload: { analiseId: a!.id }, createdBy: ctx.user.id, maxAttempts: 1 });
    await sql`update ads.fin_analises set job_id = ${job} where id = ${a!.id}`;
    fim();
    return { id: a!.id };
  });
}

export async function removerAnalise(id: string) {
  return run(async () => {
    await admin();
    await db()`delete from ads.fin_analises where id = ${z.string().uuid("Análise inválida").parse(id)}`;
    fim();
  });
}
