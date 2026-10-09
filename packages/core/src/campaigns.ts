import { audit, type Actor, type AuditSource } from "./audit";
import { db } from "./db";
import { toDecimal } from "./money";
import { providerFor, type CampaignRef } from "./providers";

interface Loaded {
  id: string; name: string; status: string; daily_budget: string | null; external_id: string; provider: string;
  provider_data: Record<string, unknown>; account_external_id: string; credentials_enc: string;
}

/** Carrega campanha + credencial SEMPRE filtrando pelo workspace (nunca confiar no id sozinho). */
async function load(workspaceId: string, campaignId: string): Promise<Loaded> {
  const [c] = await db()<Loaded[]>`
    select c.id, c.name, c.status, c.daily_budget, c.external_id, c.provider, c.provider_data,
           a.external_id as account_external_id, k.credentials_enc
    from ads.campaigns c
    join ads.ad_accounts a on a.id = c.ad_account_id
    join ads.ad_connections k on k.id = a.connection_id
    where c.id = ${campaignId} and c.workspace_id = ${workspaceId}`;
  if (!c) throw new Error("Campanha não encontrada");
  return c;
}

const ref = (c: Loaded): CampaignRef => ({ accountExternalId: c.account_external_id, externalId: c.external_id, providerData: c.provider_data });

export async function setCampaignStatus(p: { workspaceId: string; campaignId: string; status: "ACTIVE" | "PAUSED"; actor: Actor; source?: AuditSource }) {
  const c = await load(p.workspaceId, p.campaignId);
  if (c.status === p.status) return;
  const provider = providerFor(c.provider, c.credentials_enc);
  if (p.status === "PAUSED") await provider.pauseCampaign(ref(c));
  else await provider.activateCampaign(ref(c));
  await db().begin(async (tx) => {
    await tx`update ads.campaigns set status = ${p.status}, updated_at = now() where id = ${c.id}`;
    await audit(tx, {
      workspaceId: p.workspaceId, actor: p.actor, source: p.source,
      action: p.status === "PAUSED" ? "Pausar campanha" : "Ativar campanha",
      entityType: "campaign", entityId: c.id, entityName: c.name, before: { status: c.status }, after: { status: p.status },
    });
  });
}

export async function setCampaignBudget(p: { workspaceId: string; campaignId: string; dailyBudget: string; actor: Actor; source?: AuditSource }) {
  const value = toDecimal(p.dailyBudget);
  if (value === "0.00") throw new Error("Orçamento deve ser maior que zero");
  const c = await load(p.workspaceId, p.campaignId);
  await providerFor(c.provider, c.credentials_enc).updateBudget(ref(c), value);
  await db().begin(async (tx) => {
    await tx`update ads.campaigns set daily_budget = ${value}, updated_at = now() where id = ${c.id}`;
    await audit(tx, {
      workspaceId: p.workspaceId, actor: p.actor, source: p.source, action: "Alteração de orçamento",
      entityType: "campaign", entityId: c.id, entityName: c.name, before: { dailyBudget: c.daily_budget }, after: { dailyBudget: value },
    });
  });
}
