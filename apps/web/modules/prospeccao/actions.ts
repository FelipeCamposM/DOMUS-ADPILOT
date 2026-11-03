"use server";

import { audit, db, enqueueJob, ETAPA_ENTRADA, prospeccaoSchema, STATUS_PROSPECTO } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";

/** Prospecção é da DOMUS (plataforma): só o admin da plataforma. */
async function admin() {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) throw new Error("Só o administrador da plataforma usa a prospecção");
  return ctx;
}
const uuid = z.string().uuid("Item inválido");

/** Nova busca no Google Maps: entra na fila própria do worker (uma por vez, não atrasa imagem nem vídeo). */
export async function criarProspeccao(input: unknown) {
  return run(async () => {
    const ctx = await admin();
    const p = prospeccaoSchema.parse(input);
    const sql = db();
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from ads.prospeccoes where status in ('FILA','RODANDO')`;
    if ((n?.n ?? 0) >= 5) throw new Error("Já há 5 buscas na fila. Espere alguma terminar.");
    const [b] = await sql<{ id: string }[]>`insert into ads.prospeccoes (nicho, cidade, bairros, profundidade, created_by)
      values (${p.nicho}, ${p.cidade}, ${[...new Set(p.bairros)]}, ${p.profundidade}, ${ctx.user.id}) returning id`;
    const job = await enqueueJob(sql, { workspaceId: null, type: "PROSPECTAR", payload: { prospeccaoId: b!.id }, createdBy: ctx.user.id, maxAttempts: 1 });
    await sql`update ads.prospeccoes set job_id = ${job} where id = ${b!.id}`;
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Buscar empresas no Google Maps", entityType: "prospeccao", entityId: b!.id, entityName: `${p.nicho} · ${p.cidade}` });
    revalidatePath("/crm/prospeccao");
    return b!.id;
  });
}

export async function cancelarProspeccao(id: string) {
  return run(async () => {
    await admin();
    const sql = db();
    const [b] = await sql<{ job_id: string | null; status: string }[]>`select job_id, status from ads.prospeccoes where id = ${uuid.parse(id)}`;
    if (!b || !["FILA", "RODANDO"].includes(b.status)) throw new Error("Esta busca já terminou");
    if (b.job_id) await sql`update ads.jobs set status = 'CANCELLED', finished_at = now() where id = ${b.job_id} and status in ('PENDING','RUNNING')`;
    // na fila ainda: ninguém vai mexer nela, já fica cancelada; rodando: o worker para o motor e marca
    if (b.status === "FILA") await sql`update ads.prospeccoes set status = 'CANCELADO', updated_at = now() where id = ${id}`;
    revalidatePath("/crm/prospeccao");
  });
}

/** Apaga a busca do histórico; as empresas que ela achou continuam na lista. */
export async function apagarProspeccao(id: string) {
  return run(async () => {
    await admin();
    const r = await db()`delete from ads.prospeccoes where id = ${uuid.parse(id)} and status not in ('FILA','RODANDO')`;
    if (!r.count) throw new Error("Cancele a busca antes de apagar");
    revalidatePath("/crm/prospeccao");
  });
}

export async function marcarProspectos(ids: string[], status: string) {
  return run(async () => {
    await admin();
    const lista = z.array(uuid).min(1).max(2000).parse(ids);
    const s = z.enum(STATUS_PROSPECTO, { error: "Situação inválida" }).parse(status);
    await db()`update ads.prospectos set status = ${s}, updated_at = now() where id = any(${lista})`;
    revalidatePath("/crm/prospeccao");
  });
}

export async function anotarProspecto(id: string, texto: string) {
  return run(async () => {
    await admin();
    const t = z.string().trim().max(1000, "Até 1000 caracteres").parse(texto);
    await db()`update ads.prospectos set nota_interna = ${t || null}, updated_at = now() where id = ${uuid.parse(id)}`;
    revalidatePath("/crm/prospeccao");
  });
}

/**
 * Empresa → lead do CRM (etapa de entrada), para conversar em Mensagens. Sem consentimento de formulário:
 * a conversa é fria e valem as travas contra ban (sem link, poucas mensagens até responder).
 */
export async function mandarParaCrm(id: string) {
  return run(async () => {
    const ctx = await admin();
    const sql = db();
    const [p] = await sql<{ nome: string; whatsapp: string | null; telefone: string | null; categoria: string | null; endereco: string | null; site: string | null; link: string | null; emails: string[] }[]>`
      select nome, whatsapp, telefone, categoria, endereco, site, link, emails from ads.prospectos where id = ${uuid.parse(id)}`;
    if (!p) throw new Error("Empresa não encontrada");
    if (!p.whatsapp) throw new Error("Esta empresa não tem celular (WhatsApp) no Google Maps");
    const nome = p.nome.slice(0, 80).padEnd(2, ".");
    const dados = { origem: "Prospecção · Google Maps", mensagem: [p.categoria, p.endereco].filter(Boolean).join(" · ") || undefined, pagina: p.site ?? p.link ?? null, email: p.emails[0] };
    await sql`insert into ads.whatsapp_contatos (numero, nome, salvo, etapa, lead_em, etapa_em, lead_dados, created_by)
      values (${p.whatsapp}, ${nome}, true, ${ETAPA_ENTRADA}, now(), now(), ${sql.json(dados)}, ${ctx.user.id})
      on conflict (numero) do update set etapa = coalesce(ads.whatsapp_contatos.etapa, excluded.etapa),
        lead_em = coalesce(ads.whatsapp_contatos.lead_em, excluded.lead_em), etapa_em = coalesce(ads.whatsapp_contatos.etapa_em, excluded.etapa_em),
        lead_dados = coalesce(ads.whatsapp_contatos.lead_dados, excluded.lead_dados), updated_at = now()`;
    await sql`update ads.prospectos set status = 'LEAD', updated_at = now() where id = ${id}`;
    await sql`delete from ads.whatsapp_ocultas where numero = ${p.whatsapp}`;
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Prospecto virou lead", entityType: "whatsapp_contato", entityId: p.whatsapp, entityName: p.nome });
    revalidatePath("/crm", "layout");
    return p.whatsapp;
  });
}
