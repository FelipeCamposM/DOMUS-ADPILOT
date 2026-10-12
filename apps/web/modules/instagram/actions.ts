"use server";

import { db, enqueueJob, postSchema, problemasPost, type Json, type TipoPost } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireCtx, requireRole, type Ctx } from "@/lib/ctx";

const uuid = z.string().uuid("Identificador inválido");

async function postDoWorkspace(ctx: Ctx, id: string) {
  const [p] = await db()<{ id: string; status: string; tipo: TipoPost; legenda: string; midias: { creativeId: string }[] }[]>`
    select id, status, tipo, legenda, midias from ads.instagram_posts where id = ${uuid.parse(id)} and workspace_id = ${ctx.workspace.id}`;
  if (!p) throw new Error("Publicação não encontrada");
  return p;
}

/** Nova publicação (rascunho) e vai para o editor. Aceita mídias já escolhidas (vindas do Studio/Criativos). */
export async function novaPublicacao(form: FormData) {
  const ctx = await requireCtx();
  requireRole(ctx, "editor");
  const tipo = postSchema.shape.tipo.parse(form.get("tipo") ?? "FEED");
  const midias = form.getAll("midia").map((m) => ({ creativeId: uuid.parse(m) })).slice(0, 10);
  const sql = db();
  // sem perfil escolhido (atalho do Studio): o primeiro perfil do workspace
  const pedido = form.get("conta") ? uuid.parse(form.get("conta")) : null;
  const [a] = await sql<{ id: string }[]>`
    select a.id from ads.instagram_accounts a join ads.ad_connections k on k.id = a.connection_id
    where a.workspace_id = ${ctx.workspace.id} and k.status <> 'REVOKED' and (${pedido}::uuid is null or a.id = ${pedido}) order by a.username limit 1`;
  if (!a) redirect("/instagram");
  const conta = a.id;
  const [p] = await sql<{ id: string }[]>`
    insert into ads.instagram_posts (workspace_id, ig_account_id, tipo, midias, created_by)
    values (${ctx.workspace.id}, ${conta}, ${tipo}, ${sql.json(midias)}, ${ctx.user.id}) returning id`;
  redirect(`/instagram/publicar/${p!.id}`);
}

export async function salvarPublicacao(id: string, input: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await postDoWorkspace(ctx, id);
    if (!["RASCUNHO", "FALHOU", "AGENDADO"].includes(p.status)) throw new Error("Esta publicação já foi enviada ao Instagram");
    const d = postSchema.parse(input);
    const sql = db();
    const ok = await sql`select count(*)::int n from ads.creatives where id = any(${d.midias.map((m) => m.creativeId)}::uuid[]) and workspace_id = ${ctx.workspace.id}`;
    if (ok[0]!.n !== new Set(d.midias.map((m) => m.creativeId)).size) throw new Error("Mídia não encontrada na biblioteca");
    await sql`update ads.instagram_posts set tipo = ${d.tipo}, legenda = ${d.legenda}, midias = ${sql.json(d.midias)}, opcoes = ${sql.json(d.opcoes as Json)},
      status = case when status = 'FALHOU' then 'RASCUNHO' else status end, updated_at = now() where id = ${p.id}`;
    revalidatePath("/instagram", "layout");
  });
}

/** Legenda + hashtags pela IA (worker). O editor acompanha por polling até a sugestão chegar. */
export async function pedirLegenda(id: string, dica: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await postDoWorkspace(ctx, id);
    const sql = db();
    await sql`update ads.instagram_posts set sugestao = ${sql.json({ gerando: true })}, updated_at = now() where id = ${p.id}`;
    await enqueueJob(sql, { workspaceId: ctx.workspace.id, type: "AI_INSTAGRAM_CAPTION", payload: { postId: p.id, dica: z.string().max(1000, "Pedido muito longo").parse(dica) }, createdBy: ctx.user.id, maxAttempts: 1 });
  });
}

/** Agenda (ou publica agora, quando = null). Valida tudo antes; o worker publica na hora marcada. */
export async function agendarPublicacao(id: string, quando: string | null) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await postDoWorkspace(ctx, id);
    if (!["RASCUNHO", "FALHOU", "AGENDADO"].includes(p.status)) throw new Error("Esta publicação já foi enviada ao Instagram");
    const sql = db();
    const midias = await sql<{ id: string; type: string; duration_ms: number | null }[]>`
      select id, type, duration_ms from ads.creatives where id = any(${p.midias.map((m) => m.creativeId)}::uuid[]) and workspace_id = ${ctx.workspace.id} and status = 'READY'`;
    const info = p.midias.map((m) => midias.find((x) => x.id === m.creativeId)).filter((x) => !!x).map((x) => ({ type: x!.type, durationMs: x!.duration_ms }));
    const erros = problemasPost({ tipo: p.tipo, legenda: p.legenda, midias: info });
    if (info.length !== p.midias.length) erros.push("Uma das mídias foi apagada da biblioteca");
    if (erros.length) throw new Error(erros.join(" · "));
    let data: Date = new Date();
    if (quando) {
      data = new Date(z.string().datetime({ offset: true, message: "Data inválida" }).parse(quando));
      if (data.getTime() < Date.now() + 60_000) throw new Error("Escolha um horário daqui a pelo menos 1 minuto (ou publique agora)");
      if (data.getTime() > Date.now() + 75 * 86_400_000) throw new Error("Agende para no máximo 75 dias à frente");
    }
    await sql`update ads.instagram_posts set status = 'AGENDADO', agendado_para = ${data}, erro = null, updated_at = now() where id = ${p.id}`;
    if (!quando) await enqueueJob(sql, { workspaceId: ctx.workspace.id, type: "PUBLISH_INSTAGRAM", payload: { postId: p.id }, createdBy: ctx.user.id, maxAttempts: 1 });
    revalidatePath("/instagram", "layout");
  });
}

export async function voltarParaRascunho(id: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await postDoWorkspace(ctx, id);
    const r = await db()`update ads.instagram_posts set status = 'RASCUNHO', agendado_para = null, updated_at = now() where id = ${p.id} and status in ('AGENDADO', 'FALHOU')`;
    if (!r.count) throw new Error("Só dá para cancelar o que ainda não começou a publicar");
    revalidatePath("/instagram", "layout");
  });
}

export async function apagarPublicacao(id: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const p = await postDoWorkspace(ctx, id);
    if (p.status === "PUBLICANDO") throw new Error("Está publicando agora; espere terminar");
    await db()`delete from ads.instagram_posts where id = ${p.id}`;
    revalidatePath("/instagram", "layout");
  });
}
