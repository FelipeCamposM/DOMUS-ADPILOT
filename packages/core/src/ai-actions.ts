import { z } from "zod";
import type { Actor } from "./audit";
import { setCampaignBudget, setCampaignStatus } from "./campaigns";
import { db } from "./db";

/**
 * Allowlist de ações que a IA pode PROPOR. Nada aqui executa sozinho: vira ads.ai_actions PENDING_APPROVAL e só roda
 * quando um usuário aprova na interface.
 */
export const aiActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PAUSE_CAMPAIGN"), campaignId: z.string().uuid(), reason: z.string().max(500).optional() }),
  z.object({ type: z.literal("ACTIVATE_CAMPAIGN"), campaignId: z.string().uuid(), reason: z.string().max(500).optional() }),
  z.object({
    type: z.literal("UPDATE_BUDGET"), campaignId: z.string().uuid(),
    dailyBudget: z.string().regex(/^\d{1,12}([.,]\d{1,2})?$/, "Orçamento inválido"), reason: z.string().max(500).optional(),
  }),
]);
export type AiAction = z.infer<typeof aiActionSchema>;

/** Extrai blocos ```domus-action {json}``` da resposta da IA. Blocos inválidos são ignorados (e contados). */
export function parseActionBlocks(text: string): { actions: AiAction[]; invalid: number } {
  const actions: AiAction[] = [];
  let invalid = 0;
  for (const m of text.matchAll(/```domus-action\s*([\s\S]*?)```/g)) {
    try {
      const raw: unknown = JSON.parse(m[1]!);
      for (const item of Array.isArray(raw) ? raw : [raw]) {
        const r = aiActionSchema.safeParse(item);
        if (r.success) actions.push(r.data);
        else invalid++;
      }
    } catch {
      invalid++;
    }
  }
  return { actions, invalid };
}

/** Executa uma ação aprovada (com trava: só sai de PENDING_APPROVAL uma vez). */
export async function approveAiAction(workspaceId: string, actionId: string, actor: Actor) {
  const sql = db();
  const [a] = await sql<{ id: string; payload: AiAction }[]>`
    update ads.ai_actions set status = 'EXECUTING', decided_by = ${actor.userId}, decided_at = now()
    where id = ${actionId} and workspace_id = ${workspaceId} and status = 'PENDING_APPROVAL' returning id, payload`;
  if (!a) throw new Error("Ação não encontrada ou já decidida");
  try {
    const p = aiActionSchema.parse(a.payload);
    const base = { workspaceId, campaignId: p.campaignId, actor, source: "AI_RECOMMENDATION" as const };
    if (p.type === "UPDATE_BUDGET") await setCampaignBudget({ ...base, dailyBudget: p.dailyBudget });
    else await setCampaignStatus({ ...base, status: p.type === "PAUSE_CAMPAIGN" ? "PAUSED" : "ACTIVE" });
    await sql`update ads.ai_actions set status = 'EXECUTED' where id = ${a.id}`;
  } catch (e) {
    await sql`update ads.ai_actions set status = 'FAILED', error = ${(e as Error).message} where id = ${a.id}`;
    throw e;
  }
}

export async function rejectAiAction(workspaceId: string, actionId: string, actor: Actor) {
  const r = await db()`
    update ads.ai_actions set status = 'REJECTED', decided_by = ${actor.userId}, decided_at = now()
    where id = ${actionId} and workspace_id = ${workspaceId} and status = 'PENDING_APPROVAL'`;
  if (!r.count) throw new Error("Ação não encontrada ou já decidida");
}
