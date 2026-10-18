import { z } from "zod";
import type { Actor } from "./audit";
import { faltasItem, FORMATOS_CAL, itemCalSchema } from "./calendario";
import { setCampaignBudget, setCampaignStatus } from "./campaigns";
import { db, type Json } from "./db";
import { googleSearchSchema } from "./google-search";

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
  // rascunho de campanha (ainda não publicado): a IA devolve a campanha COMPLETA já ajustada
  z.object({ type: z.literal("UPDATE_DRAFT"), draftId: z.string().uuid(), spec: googleSearchSchema, reason: z.string().max(500).optional() }),
  // consultor de marketing: post completo (roteiro, legenda, hashtags). Aprovado, entra no calendário como APROVADO e a
  // automação do calendário gera a arte e pede o sim no WhatsApp; aprovada, agenda e publica sozinha ("agora" = assim que aprovar)
  itemCalSchema.omit({ dataHora: true }).extend({
    type: z.literal("CRIAR_POST_INSTAGRAM"),
    igAccountId: z.string().uuid("Perfil inválido"),
    brandId: z.string().uuid("Marca inválida").nullable().default(null),
    quando: z.union([z.literal("agora"), z.string().datetime({ offset: true, message: "Horário inválido" })]),
    reason: z.string().max(500).optional(),
  }),
]);
export type AiAction = z.infer<typeof aiActionSchema>;

/** Extrai blocos ```domus-action {json}``` da resposta da IA. Blocos inválidos são ignorados (e contados). */
export function parseActionBlocks(text: string): { actions: AiAction[]; invalid: number; erros: string[] } {
  const actions: AiAction[] = [];
  const erros: string[] = [];
  let invalid = 0;
  for (const m of text.matchAll(/```domus-action\s*([\s\S]*?)```/g)) {
    try {
      const raw: unknown = JSON.parse(m[1]!);
      for (const item of Array.isArray(raw) ? raw : [raw]) {
        const r = aiActionSchema.safeParse(item);
        if (r.success) actions.push(r.data);
        else { invalid++; erros.push(...r.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`)); }
      }
    } catch {
      invalid++;
      erros.push("bloco sem JSON válido");
    }
  }
  return { actions, invalid, erros };
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
    if (p.type === "UPDATE_DRAFT") {
      const r = await sql`
        update ads.campaign_drafts set spec = ${sql.json(p.spec as unknown as Json)}, name = ${p.spec.nome}, validated_at = null, error = null, updated_at = now()
        where id = ${p.draftId} and workspace_id = ${workspaceId} and status in ('DRAFT', 'FAILED')`;
      if (!r.count) throw new Error("Rascunho não encontrado ou já publicado/em geração");
      await sql`update ads.ai_actions set status = 'EXECUTED' where id = ${a.id}`;
      return;
    }
    if (p.type === "CRIAR_POST_INSTAGRAM") {
      await criarPostDoConsultor(workspaceId, p, actor);
      await sql`update ads.ai_actions set status = 'EXECUTED' where id = ${a.id}`;
      return;
    }
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

type PostConsultor = Extract<AiAction, { type: "CRIAR_POST_INSTAGRAM" }>;

/**
 * Post pedido ao consultor vira item APROVADO num planejamento "Consultor de marketing" do perfil e da marca (um por par, criado
 * na primeira vez). Daí em diante é o mesmo caminho do calendário: aparece em Conteúdos, gera na antecedência, publica.
 */
async function criarPostDoConsultor(workspaceId: string, p: PostConsultor, actor: Actor) {
  const sql = db();
  const faltas = faltasItem(p);
  if (faltas.length) throw new Error(faltas[0]);
  const [conta] = await sql<{ id: string }[]>`select id from ads.instagram_accounts where id = ${p.igAccountId} and workspace_id = ${workspaceId}`;
  if (!conta) throw new Error("Perfil do Instagram não encontrado neste workspace");
  if (p.brandId) {
    const [m] = await sql<{ id: string }[]>`select id from ads.brands where id = ${p.brandId} and workspace_id = ${workspaceId}`;
    if (!m) throw new Error("Marca não encontrada neste workspace");
  }
  const quando = p.quando === "agora" ? new Date() : new Date(Math.max(Date.parse(p.quando), Date.now()));
  const dia = quando.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  await sql.begin(async (tx) => {
    let [cal] = await tx<{ id: string }[]>`
      select id from ads.calendarios where workspace_id = ${workspaceId} and ig_account_id = ${p.igAccountId} and objetivo = ${OBJETIVO_CONSULTOR}
        and brand_id is not distinct from ${p.brandId}::uuid limit 1`; // a marca (logo, cores) vem do planejamento: um por perfil + marca
    if (cal) await tx`update ads.calendarios set fim = greatest(fim, ${dia}::date), inicio = least(inicio, ${dia}::date), updated_at = now() where id = ${cal.id}`;
    else [cal] = await tx<{ id: string }[]>`
      insert into ads.calendarios (workspace_id, ig_account_id, brand_id, inicio, fim, objetivo, mix, status, created_by)
      values (${workspaceId}, ${p.igAccountId}, ${p.brandId}, ${dia}, ${dia}, ${OBJETIVO_CONSULTOR}, '{}', 'PRONTO', ${actor.userId}) returning id`;
    await tx`
      insert into ads.calendario_itens (calendario_id, workspace_id, data_hora, formato, tema, objetivo, roteiro, legenda, hashtags, status)
      values (${cal!.id}, ${workspaceId}, ${quando}, ${p.formato}, ${p.tema}, ${p.objetivo}, ${tx.json(p.roteiro as unknown as Json)}, ${p.legenda}, ${p.hashtags}, 'APROVADO')`;
  });
}

export const OBJETIVO_CONSULTOR = "Posts pedidos ao consultor de marketing";

/** "Criar e publicar carrossel “Tema” em @perfil · agora" (texto do cartão de aprovação). */
export function resumoPostConsultor(p: PostConsultor, username: string): string {
  const quando = p.quando === "agora" ? "assim que a arte ficar pronta"
    : new Date(p.quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const extra = p.formato === "CARROSSEL" ? ` (${p.roteiro.slides.length} slides)` : p.formato === "REELS" ? ` (${p.roteiro.duracao} s)` : "";
  return `Criar e publicar ${FORMATOS_CAL[p.formato].toLowerCase()}${extra} “${p.tema}” em @${username} · ${quando}`;
}