"use server";

import { db, enqueueJob, setCampaignBudget, setCampaignStatus } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireCtx, requireRole } from "@/lib/ctx";

const id = z.string().uuid("Campanha inválida");

export async function alterarStatus(campaignId: string, status: "ACTIVE" | "PAUSED") {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const s = z.enum(["ACTIVE", "PAUSED"], { message: "Status inválido" }).parse(status);
    await setCampaignStatus({ workspaceId: ctx.workspace.id, campaignId: id.parse(campaignId), status: s, actor: ctx.actor });
    revalidatePath("/", "layout");
  });
}

export async function alterarOrcamento(campaignId: string, dailyBudget: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const valor = z.string().trim().regex(/^\d{1,12}([.,]\d{1,2})?$/, "Informe um valor como 130 ou 130,50").parse(dailyBudget);
    await setCampaignBudget({ workspaceId: ctx.workspace.id, campaignId: id.parse(campaignId), dailyBudget: valor, actor: ctx.actor });
    revalidatePath("/", "layout");
  });
}

/** Enfileira a sincronização de todas as conexões do workspace (o worker local executa). Não duplica job pendente. */
export async function sincronizarTudo() {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const sql = db();
    const conexoes = await sql<{ id: string; provider: string }[]>`
      select k.id, k.provider from ads.ad_connections k
      where k.workspace_id = ${ctx.workspace.id} and k.status <> 'REVOKED'
        and not exists (select 1 from ads.jobs j where j.status in ('PENDING', 'RUNNING') and j.payload->>'connectionId' = k.id::text)`;
    for (const k of conexoes) {
      await enqueueJob(sql, { workspaceId: ctx.workspace.id, type: k.provider === "META" ? "SYNC_META" : "SYNC_GOOGLE", payload: { connectionId: k.id }, createdBy: ctx.user.id });
    }
    revalidatePath("/jobs");
    return conexoes.length;
  });
}
