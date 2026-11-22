"use server";

import { audit, db, pedirRestauro, r2Presign } from "@domus-ads/core";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireCtx, requireRole } from "@/lib/ctx";
import { enviarVideoTikTok } from "@/lib/tiktok";

/** Manda o MP4 de um criativo para a caixa de entrada do TikTok conectado no workspace (a pessoa publica pelo app). */
export async function enviarAoTikTok(creativeId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const id = z.string().uuid("Vídeo inválido").parse(creativeId);
    const sql = db();
    const [c] = await sql<{ name: string; storage: string; r2_key: string | null; mime: string | null; arquivado: boolean }[]>`
      select name, storage, r2_key, mime, arquivado from ads.creatives where id = ${id} and workspace_id = ${ctx.workspace.id} and status = 'READY'`;
    if (!c?.r2_key || !c.mime?.startsWith("video/")) throw new Error("Vídeo não encontrado");
    if (c.arquivado) {
      await pedirRestauro(sql, id, ctx.workspace.id);
      throw new Error("O vídeo está arquivado no Drive e está sendo restaurado. Tente de novo em instantes.");
    }
    if (c.storage === "local") throw new Error("Este vídeo está só no PC do worker. Aguarde a cópia para a nuvem e tente de novo.");
    const [k] = await sql<{ id: string; label: string; credentials_enc: string }[]>`
      select id, label, credentials_enc from ads.ad_connections
      where workspace_id = ${ctx.workspace.id} and provider = 'TIKTOK' and status <> 'REVOKED' order by created_at desc limit 1`;
    if (!k) throw new Error("Conecte uma conta do TikTok em Conexões primeiro.");

    const arq = await fetch(await r2Presign(c.r2_key, "GET", 600));
    if (!arq.ok) throw new Error("Não consegui ler o arquivo do vídeo.");
    const publishId = await enviarVideoTikTok(k, await arq.arrayBuffer());
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Enviar vídeo ao TikTok", entityType: "creative", entityId: id, entityName: c.name, after: { conta: k.label, publishId } });
    return k.label;
  });
}
