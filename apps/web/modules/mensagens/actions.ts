"use server";

import {
  audit, chaveEtapa, contatoSchema, db, ETAPA_ENTRADA, etapaCrmSchema, filtroCrmSchema, enqueueJob, etapaSchema, FRIO, leadSiteSchema, MAX_TEXTO_WA, numeroSchema, temLink, templateSchema, tipoMidia, whatsappAvisos,
} from "@domus-ads/core";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";

/** O WhatsApp é o número da plataforma: tudo aqui é só do admin da plataforma. */
async function admin() {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) throw new Error("Só o administrador da plataforma usa as mensagens");
  return ctx;
}

async function workerOnline() {
  const [w] = await db()<{ ok: boolean }[]>`select last_seen > now() - interval '90 seconds' as ok from ads.worker_status order by last_seen desc limit 1`;
  if (!w?.ok) throw new Error("O worker está offline: a mensagem só sai com o PC do worker ligado.");
}

const texto = z.string().trim().max(MAX_TEXTO_WA, `Mensagem muito longa (até ${MAX_TEXTO_WA} caracteres)`);
const envioSchema = z.object({ para: numeroSchema, texto, creativeId: z.string().uuid("Arquivo inválido").nullable().default(null) })
  .refine((m) => m.texto.length > 0 || m.creativeId, { message: "Escreva a mensagem ou anexe um arquivo" });

/** Mensagem escrita na tela: fica PENDENTE e o worker manda pela Wuzapi (job na vaga rápida, não espera vídeo). */
export async function enviarMensagem(input: unknown) {
  return run(async () => {
    const ctx = await admin();
    const m = envioSchema.parse(input);
    const sql = db();
    const avisos = await whatsappAvisos();
    const [contato] = await sql`select 1 from ads.whatsapp_contatos where numero = ${m.para}`;
    if (!contato && m.para !== avisos) throw new Error("Salve o contato (nome e número) antes de mandar mensagem");
    if (m.para !== avisos) await travasPrimeiroContato(m.para, m.texto);
    // anexo: um arquivo da biblioteca deste workspace (enviado agora ou já existente); a mensagem guarda a chave
    let midia: { storage: string; r2_key: string; mime: string; name: string } | null = null;
    if (m.creativeId) {
      const [c] = await sql<{ storage: string; r2_key: string | null; mime: string | null; name: string; arquivado: boolean }[]>`
        select storage, r2_key, mime, name, arquivado from ads.creatives where id = ${m.creativeId} and workspace_id = ${ctx.workspace.id} and status = 'READY'`;
      if (!c?.r2_key || !c.mime) throw new Error("Arquivo não encontrado na biblioteca");
      if (c.arquivado) throw new Error("Este arquivo está arquivado no Drive: abra em Criativos para restaurar e tente de novo");
      midia = { storage: c.storage, r2_key: c.r2_key, mime: c.mime, name: `${c.name}.${c.r2_key.split(".").pop()}` };
    }
    await workerOnline();
    const [r] = await sql<{ id: string }[]>`insert into ads.whatsapp_envios (para, texto, status, direcao, tipo, midia_storage, midia_key, midia_mime, midia_nome, autor)
      values (${m.para}, ${m.texto}, 'PENDENTE', 'OUT', ${midia ? tipoMidia(midia.mime) : "texto"}, ${midia?.storage ?? null}, ${midia?.r2_key ?? null}, ${midia?.mime ?? null}, ${midia?.name ?? null}, ${ctx.user.email})
      returning id`;
    await enqueueJob(sql, { workspaceId: null, type: "WHATSAPP_ENVIAR", payload: { id: r!.id }, createdBy: ctx.user.id, maxAttempts: 1 });
    // lead novo que recebeu a primeira mensagem passa para "em contato"
    await sql`update ads.whatsapp_contatos set lido_em = now(), etapa = case when etapa = 'NOVO' then 'CONTATO' else etapa end where numero = ${m.para}`;
    revalidatePath("/crm", "layout");
    return r!.id;
  });
}

const agendaSchema = z.object({
  para: numeroSchema, texto: texto.min(1, "Escreva a mensagem"),
  quando: z.coerce.date({ error: "Data inválida" })
    .refine((d) => d.getTime() > Date.now() + 60_000, "Escolha um horário daqui a pelo menos 1 minuto")
    .refine((d) => d.getTime() < Date.now() + 90 * 86400_000, "Agende para no máximo 90 dias"),
});

/** Agenda uma mensagem de texto: fica PENDENTE com agendado_para e o job do worker só roda na hora (run_after). */
export async function agendarMensagem(input: unknown) {
  return run(async () => {
    const ctx = await admin();
    const m = agendaSchema.parse(input);
    const sql = db();
    const [contato] = await sql`select 1 from ads.whatsapp_contatos where numero = ${m.para}`;
    if (!contato) throw new Error("Salve o contato (nome e número) antes de agendar");
    await travasPrimeiroContato(m.para, m.texto);
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from ads.whatsapp_envios where para = ${m.para} and status = 'PENDENTE' and agendado_para > now()`;
    if ((n?.n ?? 0) >= 10) throw new Error("Já há 10 mensagens agendadas para esta conversa");
    const [r] = await sql<{ id: string }[]>`insert into ads.whatsapp_envios (para, texto, status, direcao, tipo, autor, agendado_para, created_at)
      values (${m.para}, ${m.texto}, 'PENDENTE', 'OUT', 'texto', ${ctx.user.email}, ${m.quando}, ${m.quando}) returning id`;
    await enqueueJob(sql, { workspaceId: null, type: "WHATSAPP_ENVIAR", payload: { id: r!.id }, createdBy: ctx.user.id, maxAttempts: 1, runAfter: m.quando });
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Agendar mensagem do WhatsApp", entityType: "whatsapp_contato", entityId: m.para, entityName: m.quando.toISOString() });
    revalidatePath("/crm", "layout");
    return r!.id;
  });
}

/** Cancela uma agendada que ainda não saiu (o job acha a mensagem fora da fila e não manda nada). */
export async function cancelarAgendada(id: string) {
  return run(async () => {
    await admin();
    const r = await db()`delete from ads.whatsapp_envios where id = ${z.string().uuid().parse(id)} and status = 'PENDENTE' and agendado_para > now() + interval '5 seconds'`;
    if (!r.count) throw new Error("Esta mensagem já saiu ou está saindo agora");
    revalidatePath("/crm", "layout");
  });
}

/** Modelo usado numa conversa: sobe na lista de mais usados. */
export async function usarModelo(id: string) {
  return run(async () => {
    await admin();
    await db()`update ads.whatsapp_templates set usos = usos + 1, usado_em = now() where id = ${z.string().uuid().parse(id)}`;
  });
}

/**
 * Contra ban: enquanto a pessoa nunca respondeu, a conversa é "fria". Nela: sem link, no máximo FRIO.porConversa
 * mensagens e um teto de conversas novas por hora e por dia (sem disparo em massa).
 */
async function travasPrimeiroContato(para: string, texto: string) {
  const sql = db();
  const [c] = await sql<{ ins: number; outs: number }[]>`
    select count(*) filter (where direcao = 'IN')::int as ins, count(*) filter (where direcao = 'OUT' and status <> 'FALHOU')::int as outs
    from ads.whatsapp_envios where para = ${para}`;
  if (c!.ins > 0) return;
  if (temLink(texto)) throw new Error("Sem link na primeira mensagem: é o que mais vira denúncia de spam. Mande o link depois que a pessoa responder.");
  if (c!.outs >= FRIO.porConversa) throw new Error(`Espere a pessoa responder: já foram ${c!.outs} mensagens sem resposta nesta conversa.`);
  if (c!.outs > 0) return; // conversa já começada não conta como nova
  const [n] = await sql<{ hora: number; dia: number }[]>`
    select count(distinct para) filter (where primeira > now() - interval '1 hour')::int as hora, count(distinct para)::int as dia
    from (select para, min(created_at) as primeira from ads.whatsapp_envios o where direcao = 'OUT' and autor <> 'DOMUS (automático)'
      and not exists (select 1 from ads.whatsapp_envios i where i.para = o.para and i.direcao = 'IN')
      group by para having min(created_at) > now() - interval '24 hours') x`;
  if (n!.hora >= FRIO.porHora) throw new Error(`Limite de ${FRIO.porHora} conversas novas por hora (protege o número de ban). Tente mais tarde ou espere respostas.`);
  if (n!.dia >= FRIO.porDia) throw new Error(`Limite de ${FRIO.porDia} conversas novas por dia (protege o número de ban). Amanhã libera.`);
}

/** Etapa do funil (null = deixa de ser lead). Mudar de etapa zera o "parado há". */
export async function definirEtapa(numero: string, etapa: string | null) {
  return run(async () => {
    const ctx = await admin();
    const e = etapaSchema.parse(etapa);
    const n = numeroSchema.parse(numero);
    const sql = db();
    const [et] = e ? await sql<{ nome: string }[]>`select nome from ads.crm_etapas where chave = ${e}` : [{ nome: "" }];
    if (!et) throw new Error("Essa coluna não existe mais. Atualize a página.");
    const r = await sql`update ads.whatsapp_contatos set etapa = ${e}, lead_em = coalesce(lead_em, case when ${e}::text is not null then now() end),
      etapa_em = case when etapa is distinct from ${e} then now() else etapa_em end, updated_at = now() where numero = ${n}`;
    if (!r.count) throw new Error("Salve o contato antes de pôr no funil");
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: e ? `Lead: ${et.nome}` : "Tirar do funil", entityType: "whatsapp_contato", entityId: n, entityName: n });
    revalidatePath("/crm", "layout");
  });
}

const valorSchema = z.string().trim().transform((v, c) => {
  if (!v) return null;
  const t = v.replace(/[R$\s]/g, "");
  // "1.500,00" e "1.500" usam ponto de milhar; "1500.5" é decimal
  const d = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(d)) { c.addIssue({ code: "custom", message: "Valor inválido (ex.: 1.500,00)" }); return z.NEVER; }
  return d;
});

/** Quanto vale o negócio (vazio = sem valor). Soma no pipeline e no ticket médio. */
export async function definirValor(numero: string, valor: string) {
  return run(async () => {
    await admin();
    const n = numeroSchema.parse(numero);
    const v = valorSchema.parse(valor);
    await db()`update ads.whatsapp_contatos set lead_valor = ${v}, updated_at = now() where numero = ${n} and etapa is not null`;
    revalidatePath("/crm/leads");
  });
}

// ───────────── Colunas do funil ─────────────

/** Cria (chave null) ou edita uma coluna. A entrada (Novo) fica sempre aberta. */
export async function salvarEtapa(chave: string | null, dados: z.input<typeof etapaCrmSchema>) {
  return run(async () => {
    const ctx = await admin();
    const d = etapaCrmSchema.parse(dados);
    const sql = db();
    let k = chave;
    if (chave) {
      k = etapaSchema.unwrap().parse(chave);
      if (k === ETAPA_ENTRADA && d.tipo !== "ABERTO") throw new Error("A coluna de entrada recebe os leads novos: fica como etapa aberta");
      const r = await sql`update ads.crm_etapas set nome = ${d.nome}, cor = ${d.cor}, tipo = ${d.tipo}, dica = ${d.dica} where chave = ${k}`;
      if (!r.count) throw new Error("Coluna não encontrada");
    } else {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from ads.crm_etapas`;
      if (n >= 12) throw new Error("Até 12 colunas no funil");
      const base = chaveEtapa(d.nome);
      [{ k }] = await sql<{ k: string }[]>`select ${base}::text || case when exists (select 1 from ads.crm_etapas where chave = ${base}) then '_' || upper(substr(md5(random()::text), 1, 4)) else '' end as k`;
      // coluna aberta entra antes das de fim (Fechou/Perdeu); coluna de fim vai para o final
      await sql.begin(async (tx) => {
        const [{ pos }] = await tx<{ pos: number }[]>`select coalesce(max(ordem) filter (where ${d.tipo} <> 'ABERTO' or tipo = 'ABERTO'), -1) + 1 as pos from ads.crm_etapas`;
        await tx`update ads.crm_etapas set ordem = ordem + 1 where ordem >= ${pos}`;
        await tx`insert into ads.crm_etapas (chave, nome, cor, tipo, dica, ordem) values (${k}, ${d.nome}, ${d.cor}, ${d.tipo}, ${d.dica}, ${pos})`;
      });
    }
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: chave ? "Funil: editou coluna" : "Funil: nova coluna", entityType: "crm_etapa", entityId: chave ?? d.nome, entityName: d.nome });
    revalidatePath("/crm", "layout");
    return k!;
  });
}

/** Nova ordem das colunas (todas as chaves, da esquerda para a direita). */
export async function ordenarEtapas(chaves: string[]) {
  return run(async () => {
    await admin();
    const ks = z.array(etapaSchema.unwrap()).min(1).max(12).parse(chaves);
    await db()`update ads.crm_etapas e set ordem = o.i from unnest(${ks}::text[]) with ordinality as o(chave, i) where e.chave = o.chave`;
    revalidatePath("/crm", "layout");
  });
}

/** Apaga uma coluna; os leads dela vão para `destino`. */
export async function apagarEtapa(chave: string, destino: string) {
  return run(async () => {
    const ctx = await admin();
    const k = etapaSchema.unwrap().parse(chave);
    const para = etapaSchema.unwrap().parse(destino);
    if (k === ETAPA_ENTRADA) throw new Error("A coluna de entrada não pode ser apagada (é onde os leads novos chegam)");
    if (k === para) throw new Error("Escolha outra coluna para os leads");
    const sql = db();
    await sql.begin(async (tx) => {
      const [d] = await tx`select 1 from ads.crm_etapas where chave = ${para}`;
      if (!d) throw new Error("Coluna de destino não existe");
      await tx`update ads.whatsapp_contatos set etapa = ${para}, etapa_em = now(), updated_at = now() where etapa = ${k}`;
      await tx`delete from ads.crm_etapas where chave = ${k}`;
    });
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Funil: apagou coluna", entityType: "crm_etapa", entityId: k, entityName: k });
    revalidatePath("/crm", "layout");
  });
}

// ───────────── Filtros salvos do funil ─────────────

const filtroId = z.string().uuid("Filtro inválido");

/** Guarda os filtros atuais com um nome. Devolve o id. */
export async function salvarFiltro(nome: string, filtros: unknown) {
  return run(async () => {
    await admin();
    const n = z.string().trim().min(1, "Dê um nome ao filtro").max(40, "Nome muito longo (até 40)").parse(nome);
    const f = filtroCrmSchema.parse(filtros);
    const sql = db();
    const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from ads.crm_filtros`;
    if (total >= 30) throw new Error("Até 30 filtros salvos: apague algum antes");
    const [r] = await sql<{ id: string }[]>`insert into ads.crm_filtros (nome, filtros) values (${n}, ${sql.json(f)}) returning id`;
    revalidatePath("/crm/leads");
    return r!.id;
  });
}

/** Favorito abre já aplicado (só um). id null = nenhum. */
export async function favoritarFiltro(id: string | null) {
  return run(async () => {
    await admin();
    const f = id ? filtroId.parse(id) : null;
    await db().begin(async (tx) => {
      await tx`update ads.crm_filtros set favorito = false where favorito`;
      if (f) await tx`update ads.crm_filtros set favorito = true where id = ${f}`;
    });
    revalidatePath("/crm/leads");
  });
}

export async function apagarFiltro(id: string) {
  return run(async () => {
    await admin();
    await db()`delete from ads.crm_filtros where id = ${filtroId.parse(id)}`;
    revalidatePath("/crm/leads");
  });
}

// ───────────── Sites que mandam leads ─────────────

const siteId = z.string().uuid("Site inválido");

export async function salvarSite(id: string | null, input: unknown) {
  return run(async () => {
    const ctx = await admin();
    const s = leadSiteSchema.parse(input);
    const sql = db();
    let chave: string | null = null;
    if (id) await sql`update ads.lead_sites set nome = ${s.nome}, dominios = ${s.dominios}, mensagem_inicial = ${s.mensagem_inicial} where id = ${siteId.parse(id)}`;
    else {
      const [n] = await sql<{ n: number }[]>`select count(*)::int as n from ads.lead_sites`;
      if ((n?.n ?? 0) >= 50) throw new Error("Limite de 50 sites");
      const [r] = await sql<{ chave: string }[]>`insert into ads.lead_sites (nome, chave, dominios, mensagem_inicial, created_by)
        values (${s.nome}, ${`lead_${randomBytes(12).toString("base64url")}`}, ${s.dominios}, ${s.mensagem_inicial}, ${ctx.user.id}) returning chave`;
      chave = r!.chave;
    }
    revalidatePath("/crm", "layout");
    return chave; // site novo: a tela já abre o código do formulário
  });
}

export async function alternarSite(id: string, ativo: boolean) {
  return run(async () => {
    await admin();
    await db()`update ads.lead_sites set ativo = ${ativo} where id = ${siteId.parse(id)}`;
    revalidatePath("/crm", "layout");
  });
}

/** Apaga o site: os leads continuam nas Mensagens (só perdem o nome do site). */
export async function apagarSite(id: string) {
  return run(async () => {
    await admin();
    await db()`delete from ads.lead_sites where id = ${siteId.parse(id)}`;
    revalidatePath("/crm", "layout");
  });
}

/** Tenta de novo uma mensagem que falhou (ou ficou parada na fila porque o worker reiniciou). */
export async function reenviarMensagem(id: string) {
  return run(async () => {
    const ctx = await admin();
    await workerOnline();
    const sql = db();
    const r = await sql`update ads.whatsapp_envios set status = 'PENDENTE', erro = null where id = ${z.string().uuid().parse(id)} and direcao = 'OUT'
      and (status = 'FALHOU' or (status = 'PENDENTE' and created_at < now() - interval '2 minutes' and coalesce(agendado_para, now()) <= now()))`;
    if (!r.count) throw new Error("Esta mensagem não pode ser reenviada");
    await enqueueJob(sql, { workspaceId: null, type: "WHATSAPP_ENVIAR", payload: { id }, createdBy: ctx.user.id, maxAttempts: 1 });
    revalidatePath("/crm", "layout");
  });
}

/** Nota interna na conversa: fica só aqui, nunca vai para o WhatsApp. */
export async function salvarNota(input: unknown) {
  return run(async () => {
    const ctx = await admin();
    const n = z.object({ para: numeroSchema, texto: texto.min(1, "Escreva a nota") }).parse(input);
    await db()`insert into ads.whatsapp_envios (para, texto, status, direcao, autor) values (${n.para}, ${n.texto}, 'NOTA', 'NOTA', ${ctx.user.email})`;
    revalidatePath("/crm", "layout");
  });
}

export async function apagarNota(id: string) {
  return run(async () => {
    await admin();
    await db()`delete from ads.whatsapp_envios where id = ${z.string().uuid().parse(id)} and direcao = 'NOTA'`;
    revalidatePath("/crm", "layout");
  });
}

/** Novo contato ou renomear: nome e número obrigatórios (o número vira o id da conversa). */
export async function salvarContato(input: unknown) {
  return run(async () => {
    const ctx = await admin();
    const c = contatoSchema.parse(input);
    await db()`insert into ads.whatsapp_contatos (numero, nome, salvo, created_by) values (${c.numero}, ${c.nome}, true, ${ctx.user.id})
      on conflict (numero) do update set nome = excluded.nome, salvo = true, updated_at = now()`;
    await audit(db(), { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Salvar contato do WhatsApp", entityType: "whatsapp_contato", entityId: c.numero, entityName: c.nome });
    revalidatePath("/crm", "layout");
    return c.numero;
  });
}

export async function marcarLida(numero: string) {
  return run(async () => {
    await admin();
    await db()`update ads.whatsapp_contatos set lido_em = now() where numero = ${numeroSchema.parse(numero)}`;
  });
}

export async function salvarTemplate(input: unknown) {
  return run(async () => {
    const ctx = await admin();
    const t = templateSchema.extend({ id: z.string().uuid().nullable().default(null) }).parse(input);
    const sql = db();
    if (t.id) await sql`update ads.whatsapp_templates set nome = ${t.nome}, texto = ${t.texto}, categoria = ${t.categoria}, updated_at = now() where id = ${t.id}`;
    else {
      const [n] = await sql<{ n: number }[]>`select count(*)::int as n from ads.whatsapp_templates`;
      if ((n?.n ?? 0) >= 100) throw new Error("Limite de 100 modelos");
      await sql`insert into ads.whatsapp_templates (nome, texto, categoria, created_by) values (${t.nome}, ${t.texto}, ${t.categoria}, ${ctx.user.id})`;
    }
    revalidatePath("/crm", "layout");
  });
}

export async function apagarTemplate(id: string) {
  return run(async () => {
    await admin();
    await db()`delete from ads.whatsapp_templates where id = ${z.string().uuid().parse(id)}`;
    revalidatePath("/crm", "layout");
  });
}
