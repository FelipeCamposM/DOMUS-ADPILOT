"use server";

import {
  audit, contatoSchema, db, enqueueJob, etapaSchema, FRIO, leadSiteSchema, MAX_TEXTO_WA, numeroSchema, ROTULO_ETAPA, temLink, templateSchema, tipoMidia, whatsappAvisos,
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
    revalidatePath("/mensagens");
    return r!.id;
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

/** Etapa do funil (null = deixa de ser lead). */
export async function definirEtapa(numero: string, etapa: string | null) {
  return run(async () => {
    const ctx = await admin();
    const e = etapaSchema.parse(etapa);
    const n = numeroSchema.parse(numero);
    const r = await db()`update ads.whatsapp_contatos set etapa = ${e}, lead_em = coalesce(lead_em, case when ${e}::text is not null then now() end), updated_at = now() where numero = ${n}`;
    if (!r.count) throw new Error("Salve o contato antes de pôr no funil");
    await audit(db(), { workspaceId: ctx.workspace.id, actor: ctx.actor, action: e ? `Lead: ${ROTULO_ETAPA[e]}` : "Tirar do funil", entityType: "whatsapp_contato", entityId: n, entityName: n });
    revalidatePath("/mensagens");
  });
}

// ───────────── Sites que mandam leads ─────────────

const siteId = z.string().uuid("Site inválido");

export async function salvarSite(id: string | null, input: unknown) {
  return run(async () => {
    const ctx = await admin();
    const s = leadSiteSchema.parse(input);
    const sql = db();
    if (id) await sql`update ads.lead_sites set nome = ${s.nome}, dominios = ${s.dominios}, mensagem_inicial = ${s.mensagem_inicial} where id = ${siteId.parse(id)}`;
    else {
      const [n] = await sql<{ n: number }[]>`select count(*)::int as n from ads.lead_sites`;
      if ((n?.n ?? 0) >= 50) throw new Error("Limite de 50 sites");
      await sql`insert into ads.lead_sites (nome, chave, dominios, mensagem_inicial, created_by)
        values (${s.nome}, ${`lead_${randomBytes(12).toString("base64url")}`}, ${s.dominios}, ${s.mensagem_inicial}, ${ctx.user.id})`;
    }
    revalidatePath("/mensagens");
  });
}

export async function alternarSite(id: string, ativo: boolean) {
  return run(async () => {
    await admin();
    await db()`update ads.lead_sites set ativo = ${ativo} where id = ${siteId.parse(id)}`;
    revalidatePath("/mensagens");
  });
}

/** Apaga o site: os leads continuam nas Mensagens (só perdem o nome do site). */
export async function apagarSite(id: string) {
  return run(async () => {
    await admin();
    await db()`delete from ads.lead_sites where id = ${siteId.parse(id)}`;
    revalidatePath("/mensagens");
  });
}

/** Tenta de novo uma mensagem que falhou (ou ficou parada na fila porque o worker reiniciou). */
export async function reenviarMensagem(id: string) {
  return run(async () => {
    const ctx = await admin();
    await workerOnline();
    const sql = db();
    const r = await sql`update ads.whatsapp_envios set status = 'PENDENTE', erro = null where id = ${z.string().uuid().parse(id)} and direcao = 'OUT'
      and (status = 'FALHOU' or (status = 'PENDENTE' and created_at < now() - interval '2 minutes'))`;
    if (!r.count) throw new Error("Esta mensagem não pode ser reenviada");
    await enqueueJob(sql, { workspaceId: null, type: "WHATSAPP_ENVIAR", payload: { id }, createdBy: ctx.user.id, maxAttempts: 1 });
    revalidatePath("/mensagens");
  });
}

/** Nota interna na conversa: fica só aqui, nunca vai para o WhatsApp. */
export async function salvarNota(input: unknown) {
  return run(async () => {
    const ctx = await admin();
    const n = z.object({ para: numeroSchema, texto: texto.min(1, "Escreva a nota") }).parse(input);
    await db()`insert into ads.whatsapp_envios (para, texto, status, direcao, autor) values (${n.para}, ${n.texto}, 'NOTA', 'NOTA', ${ctx.user.email})`;
    revalidatePath("/mensagens");
  });
}

export async function apagarNota(id: string) {
  return run(async () => {
    await admin();
    await db()`delete from ads.whatsapp_envios where id = ${z.string().uuid().parse(id)} and direcao = 'NOTA'`;
    revalidatePath("/mensagens");
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
    revalidatePath("/mensagens");
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
    if (t.id) await sql`update ads.whatsapp_templates set nome = ${t.nome}, texto = ${t.texto}, updated_at = now() where id = ${t.id}`;
    else {
      const [n] = await sql<{ n: number }[]>`select count(*)::int as n from ads.whatsapp_templates`;
      if ((n?.n ?? 0) >= 100) throw new Error("Limite de 100 modelos");
      await sql`insert into ads.whatsapp_templates (nome, texto, created_by) values (${t.nome}, ${t.texto}, ${ctx.user.id})`;
    }
    revalidatePath("/mensagens");
  });
}

export async function apagarTemplate(id: string) {
  return run(async () => {
    await admin();
    await db()`delete from ads.whatsapp_templates where id = ${z.string().uuid().parse(id)}`;
    revalidatePath("/mensagens");
  });
}
