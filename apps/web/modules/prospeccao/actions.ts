"use server";

import { audit, db, enqueueJob, MAX_TEXTO_WA, normalizarNumero } from "@domus-ads/core";
import { buscaSchema, exportarMarkdown, lerMarkdown, PESO_COLUNA, pesosSchema, whatsappNumber, type ScoreWeights } from "@domus-ads/core/prospeccao";
import { campanhas, leadsProsp, salvarLeadsProsp } from "@domus-ads/core/prospeccao-db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";

/** Prospecção é ferramenta da plataforma (roda no PC do worker, com o IP de casa): só o admin da plataforma. */
async function admin() {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) throw new Error("Só o administrador da plataforma usa a prospecção");
  return ctx;
}
const id = z.string().uuid("Busca inválida");
const leadId = z.string().min(8, "Lead inválido").max(64, "Lead inválido");
const fim = () => revalidatePath("/crm/prospeccao");

async function workerOnline() {
  const [w] = await db()<{ ok: boolean }[]>`select last_seen > now() - interval '90 seconds' as ok from ads.worker_status order by last_seen desc limit 1`;
  if (!w?.ok) throw new Error("O worker está offline: a busca roda no PC do worker. Ligue o PC e tente de novo.");
}

export async function iniciarBusca(input: unknown) {
  return run(async () => {
    const ctx = await admin();
    const f = buscaSchema.parse(input);
    const sql = db();
    await workerOnline();
    const [rodando] = await sql`select 1 from ads.prosp_campanhas where status = 'running' and updated_at > now() - interval '45 minutes'`;
    if (rodando) throw new Error("Já existe uma busca em andamento. Espere terminar ou pare a atual.");
    const local = f.location || `${f.centerLat.toFixed(4)}, ${f.centerLng.toFixed(4)}`;
    const nome = f.name || `${f.niches[0]} — ${local}`;
    const [c] = await sql<{ id: string }[]>`
      insert into ads.prosp_campanhas (nome, nichos, local, lat, lng, raio_km, max_leads, ritmo, auditar, foco, etapa_texto, created_by)
      values (${nome.slice(0, 160)}, ${f.niches}, ${local}, ${f.centerLat}, ${f.centerLng}, ${f.radiusKm}, ${f.maxLeads}, ${f.pace}, ${f.auditWebsites}, ${f.opportunityFocus}, 'Na fila do worker', ${ctx.user.id})
      returning id`;
    const job = await enqueueJob(sql, { workspaceId: null, type: "PROSPECTAR_LEADS", payload: { campanhaId: c!.id }, createdBy: ctx.user.id, maxAttempts: 1 });
    await sql`update ads.prosp_campanhas set job_id = ${job} where id = ${c!.id}`;
    await audit(sql, { workspaceId: null, actor: ctx.actor, action: "Prospecção: nova busca", entityType: "prosp_campanha", entityId: c!.id, entityName: nome });
    fim();
    return { id: c!.id, nome };
  });
}

/** "Parar": o worker mata o Python e guarda o que já tinha achado. */
export async function pararBusca(campanhaId: string) {
  return run(async () => {
    await admin();
    const sql = db();
    const [c] = await sql<{ job_id: string | null }[]>`select job_id from ads.prosp_campanhas where id = ${id.parse(campanhaId)}`;
    if (c?.job_id) await sql`update ads.jobs set status = 'CANCELLED', finished_at = now() where id = ${c.job_id} and status in ('PENDING', 'RUNNING')`;
    // ainda na fila (worker nunca pegou): não há processo para parar
    await sql`update ads.prosp_campanhas set status = 'cancelled', updated_at = now() where id = ${campanhaId} and status = 'running'
      and not exists (select 1 from ads.jobs j where j.id = ${c?.job_id ?? null} and j.started_at is not null)`;
    fim();
  });
}

export async function excluirCampanha(campanhaId: string) {
  return run(async () => {
    const ctx = await admin();
    const sql = db();
    const [c] = await sql<{ status: string; job_id: string | null }[]>`select status, job_id from ads.prosp_campanhas where id = ${id.parse(campanhaId)}`;
    if (c?.status === "running" && c.job_id) await sql`update ads.jobs set status = 'CANCELLED', finished_at = now() where id = ${c.job_id} and status in ('PENDING', 'RUNNING')`;
    await sql`delete from ads.prosp_campanhas where id = ${campanhaId}`;
    await audit(sql, { workspaceId: null, actor: ctx.actor, action: "Prospecção: excluir busca", entityType: "prosp_campanha", entityId: campanhaId });
    fim();
  });
}

const edicaoSchema = z.object({
  stageId: z.string().regex(/^[a-z0-9_]{2,40}$/, "Etapa inválida").optional(),
  notes: z.string().max(5000, "Notas muito longas").optional(),
  tags: z.array(z.string().trim().min(1).max(40, "Tag muito longa")).max(30, "No máximo 30 tags").optional(),
  nextActionAt: z.number().int().nullable().optional(),
});

export async function editarLead(idLead: string, input: unknown) {
  return run(async () => {
    await admin();
    const p = edicaoSchema.parse(input);
    const sql = db();
    const r = await sql`
      update ads.prosp_leads set
        etapa = coalesce(${p.stageId ?? null}, etapa), notas = coalesce(${p.notes ?? null}, notas), tags = coalesce(${p.tags ?? null}::text[], tags),
        proxima_acao = ${p.nextActionAt === undefined ? sql`proxima_acao` : p.nextActionAt === null ? null : new Date(p.nextActionAt)}, updated_at = now()
      where id = ${leadId.parse(idLead)}`;
    if (!r.count) throw new Error("Lead não encontrado");
    fim();
  });
}

export async function lixeiraLead(idLead: string, apagar: boolean) {
  return run(async () => {
    await admin();
    await db()`update ads.prosp_leads set deleted_at = ${apagar ? new Date() : null}, updated_at = now() where id = ${leadId.parse(idLead)}`;
    fim();
  });
}

export async function excluirLeadDeVez(idLead: string) {
  return run(async () => {
    await admin();
    await db()`delete from ads.prosp_leads where id = ${leadId.parse(idLead)} and deleted_at is not null`;
    fim();
  });
}

export async function salvarConfig(input: unknown) {
  return run(async () => {
    await admin();
    const p = z.object({ oferta: z.string().trim().min(5, "Descreva sua oferta").max(2000, "Oferta muito longa"), pesos: pesosSchema }).parse(input);
    const sql = db();
    const sets = (Object.keys(PESO_COLUNA) as (keyof ScoreWeights)[]).map((k) => sql`${sql(PESO_COLUNA[k])} = ${p.pesos[k]}`);
    await sql`update ads.prosp_config set oferta = ${p.oferta}, ${sets.reduce((a, b) => sql`${a}, ${b}`)}, updated_at = now() where id = 1`;
    fim();
  });
}

/** Análise com IA (um lead ou um lote de até 10, 2 em paralelo no worker). Devolve o job para acompanhar e parar. */
export async function analisarLeads(ids: string[]) {
  return run(async () => {
    const ctx = await admin();
    const lista = z.array(leadId).min(1, "Nenhum lead para analisar").max(10, "No máximo 10 por vez").parse(ids);
    const sql = db();
    await workerOnline();
    const [ia] = await sql`select 1 from ads.ai_accounts where status = 'ACTIVE' limit 1`;
    if (!ia) throw new Error("Nenhuma conta de IA ativa. Conecte uma em Configurações → Contas de IA.");
    const job = await enqueueJob(sql, { workspaceId: null, type: "AI_LEADS", payload: { ids: lista }, createdBy: ctx.user.id, maxAttempts: 1 });
    fim();
    return job;
  });
}

export async function pararAnalise(jobId: string) {
  return run(async () => {
    await admin();
    await db()`update ads.jobs set status = 'CANCELLED', finished_at = now() where id = ${z.string().uuid().parse(jobId)} and type = 'AI_LEADS' and status in ('PENDING', 'RUNNING')`;
    fim();
  });
}

export async function exportarMd(campanhaId: string) {
  return run(async () => {
    await admin();
    const sql = db();
    const [c] = await campanhas(sql, id.parse(campanhaId));
    if (!c) throw new Error("Busca não encontrada");
    return { nome: `${c.name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "leads"}.md`, texto: exportarMarkdown(c, await leadsProsp(sql, { campanhaId: c.id })) };
  });
}

export async function importarMd(texto: string) {
  return run(async () => {
    const ctx = await admin();
    if (texto.length > 15_000_000) throw new Error("Arquivo grande demais");
    const { campaign: c, leads } = lerMarkdown(texto);
    const sql = db();
    // id do app que não é uuid (ou de outra base): vira uma busca nova aqui
    const ok = z.string().uuid().safeParse(c.id).success;
    const [nova] = await sql<{ id: string }[]>`
      insert into ads.prosp_campanhas (id, nome, nichos, local, lat, lng, raio_km, max_leads, ritmo, auditar, status, encontrados, auditados, progresso, etapa_texto, created_by, created_at)
      values (${ok ? c.id : sql`gen_random_uuid()`}, ${c.name.slice(0, 160) || "Importada"}, ${c.niches.length ? c.niches.slice(0, 20) : ["importado"]}, ${c.locationLabel.slice(0, 200)},
        ${c.centerLat ?? null}, ${c.centerLng ?? null}, ${Math.min(50, Math.max(0.5, c.radiusKm))}, ${Math.min(500, Math.max(1, Math.round(c.maxLeads)))},
        ${c.settings.pace ?? "balanced"}, ${c.settings.auditWebsites ?? true}, 'completed', ${leads.length}, ${leads.length}, 100, 'Importada', ${ctx.user.id}, ${new Date(c.createdAt ?? Date.now())})
      on conflict (id) do update set nome = excluded.nome, updated_at = now()
      returning id`;
    await salvarLeadsProsp(sql, nova!.id, leads.map((l) => ({ ...l, campaignId: nova!.id })), true);
    fim();
    return { campanhaId: nova!.id, importados: leads.length };
  });
}

/**
 * "Transformar em lead": o prospect vira contato do CRM (Mensagens) na etapa de entrada, com a origem "Prospecção" e a
 * mensagem sugerida já no campo da conversa, para revisar (ou ajustar com IA) e mandar. Nada é enviado aqui.
 */
export async function transformarEmLead(idLead: string, mensagem: string) {
  return run(async () => {
    const ctx = await admin();
    const sql = db();
    const [l] = await leadsProsp(sql, { ids: [leadId.parse(idLead)] });
    if (!l) throw new Error("Lead não encontrado");
    const bruto = whatsappNumber(l);
    const numero = bruto ? normalizarNumero(`+${bruto}`) : null;
    if (!numero) throw new Error("Este lead não tem um telefone válido para o WhatsApp");
    const rascunho = z.string().trim().max(MAX_TEXTO_WA, "Mensagem muito longa").parse(mensagem);
    const nome = l.name.trim().slice(0, 80).padEnd(2, ".");
    const dados = { origem: "Prospecção", email: l.email || undefined, pagina: l.websiteUrl || null, rascunho, prospeccao: l.id };
    await sql.begin(async (tx) => {
      await tx`
        insert into ads.whatsapp_contatos (numero, nome, salvo, etapa, lead_em, etapa_em, lead_dados, created_by)
        values (${numero}, ${nome}, true, 'NOVO', now(), now(), ${tx.json(dados)}, ${ctx.user.id})
        on conflict (numero) do update set
          etapa = coalesce(ads.whatsapp_contatos.etapa, 'NOVO'), lead_em = coalesce(ads.whatsapp_contatos.lead_em, now()),
          etapa_em = coalesce(ads.whatsapp_contatos.etapa_em, now()), lead_dados = coalesce(ads.whatsapp_contatos.lead_dados, '{}'::jsonb) || ${tx.json(dados)},
          salvo = true, updated_at = now()`;
      await tx`delete from ads.whatsapp_ocultas where numero = ${numero}`;
      await tx`update ads.prosp_leads set contato_numero = ${numero}, etapa = case when etapa = 'new' then 'qualified' else etapa end, updated_at = now() where id = ${l.id}`;
    });
    await audit(sql, { workspaceId: null, actor: ctx.actor, action: "Prospecção: transformar em lead", entityType: "whatsapp_contato", entityId: numero, entityName: l.name });
    fim();
    revalidatePath("/crm", "layout");
    return numero;
  });
}
