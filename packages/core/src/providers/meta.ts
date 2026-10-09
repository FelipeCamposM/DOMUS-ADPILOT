import { createHmac } from "node:crypto";
import { fromMinor, toMinor } from "../money";
import { fetchJson } from "./http";
import { ProviderError, type AdsProvider, type CampaignRef, type CampaignStatus, type DailyMetric, type RemoteAccount, type RemoteCampaign } from "./types";

/** Credencial da Meta: token de System User (Business Manager) com ads_management + ads_read. */
export interface MetaCredentials {
  accessToken: string;
}

// Códigos de rate limit da Marketing API (respondem HTTP 400): 4, 17, 32, 613, 80000-80014.
const RATE_CODES = new Set([4, 17, 32, 613]);
const errCode = (b: unknown) => (b as { error?: { code?: number } } | null)?.error?.code;

const STATUS: Record<string, CampaignStatus> = { ACTIVE: "ACTIVE", PAUSED: "PAUSED", ARCHIVED: "ARCHIVED", DELETED: "ARCHIVED" };
// A Meta repete o mesmo evento em tipos agregados e específicos; usa o primeiro presente da lista (sem somar duplicados).
const LEAD_ACTIONS = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
const PURCHASE_ACTIONS = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];

interface Page<T> { data: T[]; paging?: { next?: string } }
interface Action { action_type: string; value: string }

export class MetaAdsProvider implements AdsProvider {
  private base = `https://graph.facebook.com/${process.env.META_API_VERSION || "v26.0"}`;

  constructor(private creds: MetaCredentials) {}

  private auth(): Record<string, string> {
    const p: Record<string, string> = { access_token: this.creds.accessToken };
    const secret = process.env.META_APP_SECRET;
    if (secret) p.appsecret_proof = createHmac("sha256", secret).update(this.creds.accessToken).digest("hex");
    return p;
  }

  private req<T>(url: string, init: RequestInit = {}) {
    return fetchJson<T>(url, init, {
      name: "Meta",
      isRateLimited: (_s, b) => { const c = errCode(b); return c !== undefined && (RATE_CODES.has(c) || (c >= 80000 && c <= 80014)); },
      isAuthError: (_s, b) => errCode(b) === 190,
    });
  }

  private async getAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
    let url: string | undefined = `${this.base}/${path}?${new URLSearchParams({ ...params, ...this.auth(), limit: "200" })}`;
    const out: T[] = [];
    while (url) {
      const page: Page<T> = await this.req<Page<T>>(url);
      out.push(...page.data);
      url = page.paging?.next;
    }
    return out;
  }

  private post(id: string, fields: Record<string, string>) {
    return this.req<{ success?: boolean }>(`${this.base}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...fields, ...this.auth() }),
    });
  }

  async listAccounts(): Promise<RemoteAccount[]> {
    const rows = await this.getAll<{ id: string; name: string; currency: string; timezone_name?: string }>("me/adaccounts", {
      fields: "id,name,currency,timezone_name,account_status",
    });
    return rows.map((r) => ({ externalId: r.id, name: r.name, currency: r.currency, timezone: r.timezone_name ?? null }));
  }

  async getCampaigns(accountId: string): Promise<RemoteCampaign[]> {
    const rows = await this.getAll<{
      id: string; name: string; objective?: string; status: string; effective_status?: string;
      daily_budget?: string; lifetime_budget?: string; start_time?: string; stop_time?: string;
    }>(`${accountId}/campaigns`, { fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time" });
    return rows.map((r) => ({
      externalId: r.id,
      name: r.name,
      objective: r.objective ?? null,
      status: STATUS[r.status] ?? "ERROR",
      dailyBudget: r.daily_budget ? fromMinor(r.daily_budget) : null,
      lifetimeBudget: r.lifetime_budget ? fromMinor(r.lifetime_budget) : null,
      startedAt: r.start_time ?? null,
      endedAt: r.stop_time ?? null,
      providerData: { effective_status: r.effective_status ?? null },
    }));
  }

  async pauseCampaign(c: CampaignRef) {
    await this.post(c.externalId, { status: "PAUSED" });
  }

  async activateCampaign(c: CampaignRef) {
    await this.post(c.externalId, { status: "ACTIVE" });
  }

  async updateBudget(c: CampaignRef, dailyBudget: string) {
    try {
      await this.post(c.externalId, { daily_budget: toMinor(dailyBudget).toString() });
    } catch (e) {
      if (e instanceof ProviderError && /budget/i.test(e.message)) {
        throw new ProviderError("Esta campanha não usa orçamento no nível da campanha (CBO). Altere o orçamento nos conjuntos de anúncios.", false, e.detail);
      }
      throw e;
    }
  }

  async getInsights(accountId: string, range: { since: string; until: string }): Promise<DailyMetric[]> {
    const rows = await this.getAll<{
      campaign_id: string; date_start: string; spend?: string; impressions?: string; clicks?: string;
      actions?: Action[]; action_values?: Action[];
    }>(`${accountId}/insights`, {
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify(range),
      fields: "campaign_id,spend,impressions,clicks,actions,action_values",
    });
    const pick = (list: Action[] | undefined, types: string[]) => {
      for (const t of types) {
        const a = list?.find((x) => x.action_type === t);
        if (a) return Number(a.value).toFixed(2);
      }
      return "0.00";
    };
    return rows.map((r) => ({
      campaignExternalId: r.campaign_id,
      date: r.date_start,
      spend: Number(r.spend ?? 0).toFixed(2),
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      leads: pick(r.actions, LEAD_ACTIONS),
      conversions: pick(r.actions, PURCHASE_ACTIONS),
      revenue: pick(r.action_values, PURCHASE_ACTIONS),
    }));
  }
}
