"use server";

import { audit, db, encrypt, enqueueJob, MetaAdsProvider } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireCtx, requireRole } from "@/lib/ctx";

const metaSchema = z.object({
  label: z.string().trim().min(1, "Dê um nome para a conexão").max(80, "Nome muito longo"),
  token: z.string().trim().min(20, "Token inválido").max(1000, "Token inválido"),
});

/** Conecta a Meta com token de System User. Valida o token listando as contas antes de salvar (cifrado). */
export async function conectarMeta(input: { label: string; token: string }) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "admin");
    const p = metaSchema.parse(input);
    const contas = await new MetaAdsProvider({ accessToken: p.token }).listAccounts();
    if (!contas.length) throw new Error("O token é válido, mas não enxerga nenhuma conta de anúncios. Dê acesso às contas ao System User no Business Manager.");
    const sql = db();
    const [k] = await sql<{ id: string }[]>`
      insert into ads.ad_connections (workspace_id, provider, label, credentials_enc, created_by)
      values (${ctx.workspace.id}, 'META', ${p.label}, ${encrypt({ accessToken: p.token })}, ${ctx.user.id}) returning id`;
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Conectar Meta Ads", entityType: "connection", entityId: k!.id, entityName: p.label, after: { contas: contas.length } });
    await enqueueJob(sql, { workspaceId: ctx.workspace.id, type: "SYNC_META", payload: { connectionId: k!.id }, createdBy: ctx.user.id });
    revalidatePath("/connections");
    return contas.length;
  });
}

export async function sincronizarConexao(connectionId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const sql = db();
    const [k] = await sql<{ id: string; provider: string }[]>`
      select id, provider from ads.ad_connections where id = ${z.string().uuid().parse(connectionId)} and workspace_id = ${ctx.workspace.id}`;
    if (!k) throw new Error("Conexão não encontrada");
    const [dup] = await sql`select 1 from ads.jobs where status in ('PENDING','RUNNING') and payload->>'connectionId' = ${k.id}`;
    if (dup) throw new Error("Já existe uma sincronização desta conexão na fila");
    await enqueueJob(sql, { workspaceId: ctx.workspace.id, type: k.provider === "META" ? "SYNC_META" : "SYNC_GOOGLE", payload: { connectionId: k.id }, createdBy: ctx.user.id });
    revalidatePath("/jobs");
  });
}

/** Remove a conexão e, em cascata, contas, campanhas e métricas sincronizadas dela. Não mexe em nada na Meta/Google. */
export async function removerConexao(connectionId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "admin");
    const sql = db();
    const [k] = await sql<{ id: string; label: string; provider: string }[]>`
      delete from ads.ad_connections where id = ${z.string().uuid().parse(connectionId)} and workspace_id = ${ctx.workspace.id} returning id, label, provider`;
    if (!k) throw new Error("Conexão não encontrada");
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Remover conexão", entityType: "connection", entityId: k.id, entityName: k.label, before: { provider: k.provider } });
    revalidatePath("/", "layout");
  });
}
