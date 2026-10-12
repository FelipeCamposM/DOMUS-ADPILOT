import { operacoesSearch, type GoogleSearchSpec } from "../google-search";
import { fromMicros, toMicros } from "../money";
import { fetchJson } from "./http";
import { ProviderError, type AdsProvider, type CampaignRef, type CampaignStatus, type DailyMetric, type RemoteAccount, type RemoteCampaign } from "./types";

/** Credencial do Google Ads: refresh token OAuth (escopo adwords) obtido no fluxo de conexão. */
export interface GoogleCredentials {
  refreshToken: string;
}

const STATUS: Record<string, CampaignStatus> = { ENABLED: "ACTIVE", PAUSED: "PAUSED", REMOVED: "ARCHIVED" };
const tokenCache = new Map<string, { token: string; exp: number }>();

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new ProviderError(`Google Ads não configurado: defina ${name} no .env`);
  return v;
}

export async function googleAccessToken(refreshToken: string): Promise<string> {
  const hit = tokenCache.get(refreshToken);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const r = await fetchJson<{ access_token: string; expires_in: number }>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_ADS_CLIENT_ID"),
      client_secret: env("GOOGLE_ADS_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  }, { name: "Google OAuth", isAuthError: (s) => s === 400 });
  tokenCache.set(refreshToken, { token: r.access_token, exp: Date.now() + r.expires_in * 1000 });
  return r.access_token;
}

type Row = Record<string, Record<string, string | undefined> | undefined>;
const cid = (id: string) => id.replace(/-/g, "");

export class GoogleAdsProvider implements AdsProvider {
  private base = `https://googleads.googleapis.com/${process.env.GOOGLE_ADS_API_VERSION || "v25"}`;

  constructor(private creds: GoogleCredentials) {}

  private async headers(): Promise<Record<string, string>> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${await googleAccessToken(this.creds.refreshToken)}`,
      "Content-Type": "application/json",
    };
    // Desde set/2026 o nível de acesso vem do projeto Google Cloud do cliente OAuth; o token virou opcional
    const dev = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (dev) h["developer-token"] = dev;
    const login = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    if (login) h["login-customer-id"] = cid(login);
    return h;
  }

  private async call<T>(path: string, body?: unknown): Promise<T> {
    return fetchJson<T>(`${this.base}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: await this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    }, { name: "Google Ads", isRateLimited: (_s, b) => JSON.stringify(b ?? "").includes("RESOURCE_EXHAUSTED") });
  }

  private async search(customerId: string, query: string): Promise<Row[]> {
    const batches = await this.call<{ results?: Row[] }[]>(`customers/${cid(customerId)}/googleAds:searchStream`, { query });
    return batches.flatMap((b) => b.results ?? []);
  }

  async listAccounts(): Promise<RemoteAccount[]> {
    const { resourceNames = [] } = await this.call<{ resourceNames?: string[] }>("customers:listAccessibleCustomers");
    const out: RemoteAccount[] = [];
    for (const rn of resourceNames) {
      const id = rn.split("/")[1]!;
      try {
        const [row] = await this.search(id, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer");
        const c = row?.customer;
        if (!c) continue;
        if (String(c.manager) === "true") {
          // MCC não tem campanhas: lista as contas clientes diretas (chamadas a elas usam GOOGLE_ADS_LOGIN_CUSTOMER_ID = MCC)
          const kids = await this.search(id, `SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code,
            customer_client.time_zone, customer_client.manager FROM customer_client WHERE customer_client.level = 1`);
          for (const k of kids.map((r) => r.customerClient)) {
            if (k?.id && String(k.manager) !== "true" && !out.some((a) => a.externalId === k.id))
              out.push({ externalId: k.id, name: k.descriptiveName ?? k.id, currency: k.currencyCode ?? "BRL", timezone: k.timeZone ?? null });
          }
          continue;
        }
        if (out.some((a) => a.externalId === id)) continue;
        out.push({ externalId: id, name: c.descriptiveName ?? id, currency: c.currencyCode ?? "BRL", timezone: c.timeZone ?? null });
      } catch {
        // conta sem acesso direto (precisa de login-customer-id do MCC): ignora
      }
    }
    return out;
  }

  async getCampaigns(customerId: string): Promise<RemoteCampaign[]> {
    const rows = await this.search(customerId, `
      SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
             campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.explicitly_shared
      FROM campaign WHERE campaign.status != 'REMOVED'`);
    return rows.map((r) => ({
      externalId: r.campaign!.id!,
      name: r.campaign!.name ?? r.campaign!.id!,
      objective: r.campaign!.advertisingChannelType ?? null,
      status: STATUS[r.campaign!.status ?? ""] ?? "ERROR",
      dailyBudget: r.campaignBudget?.amountMicros ? fromMicros(r.campaignBudget.amountMicros) : null,
      lifetimeBudget: null,
      startedAt: null,
      endedAt: null,
      providerData: {
        budgetResourceName: r.campaignBudget?.resourceName ?? null,
        budgetShared: String(r.campaignBudget?.explicitlyShared) === "true",
      },
    }));
  }

  private setStatus(c: CampaignRef, status: "PAUSED" | "ENABLED") {
    const id = cid(c.accountExternalId);
    return this.call(`customers/${id}/campaigns:mutate`, {
      operations: [{ update: { resourceName: `customers/${id}/campaigns/${c.externalId}`, status }, updateMask: "status" }],
    });
  }

  async pauseCampaign(c: CampaignRef) {
    await this.setStatus(c, "PAUSED");
  }

  async activateCampaign(c: CampaignRef) {
    await this.setStatus(c, "ENABLED");
  }

  async updateBudget(c: CampaignRef, dailyBudget: string) {
    const rn = c.providerData.budgetResourceName;
    if (typeof rn !== "string") throw new ProviderError("Campanha sem orçamento sincronizado. Sincronize a conta e tente de novo.");
    if (c.providerData.budgetShared) throw new ProviderError("Orçamento compartilhado entre campanhas: altere direto no Google Ads para não afetar as outras.");
    await this.call(`customers/${cid(c.accountExternalId)}/campaignBudgets:mutate`, {
      operations: [{ update: { resourceName: rn, amountMicros: toMicros(dailyBudget).toString() }, updateMask: "amount_micros" }],
    });
  }

  async getInsights(customerId: string, range: { since: string; until: string }): Promise<DailyMetric[]> {
    const rows = await this.search(customerId, `
      SELECT campaign.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks,
             metrics.conversions, metrics.conversions_value
      FROM campaign WHERE segments.date BETWEEN '${range.since}' AND '${range.until}'`);
    return rows.map((r) => ({
      campaignExternalId: r.campaign!.id!,
      date: r.segments!.date!,
      spend: fromMicros(r.metrics?.costMicros ?? "0"),
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      leads: "0.00",
      conversions: Number(r.metrics?.conversions ?? 0).toFixed(2),
      revenue: Number(r.metrics?.conversionsValue ?? 0).toFixed(2),
    }));
  }

  /** Localizações por nome ("Brasil", "Goiás", "Goiânia") → geoTargetConstants. Erro claro se alguma não existir. */
  async resolverLocais(nomes: string[]): Promise<string[]> {
    const r = await this.call<{ geoTargetConstantSuggestions?: { searchTerm?: string; geoTargetConstant?: { resourceName: string; canonicalName?: string; status?: string } }[] }>(
      "geoTargetConstants:suggest", { locale: "pt", countryCode: "BR", locationNames: { names: nomes } });
    const out: string[] = [];
    const faltam: string[] = [];
    for (const n of nomes) {
      const s = (r.geoTargetConstantSuggestions ?? []).find((x) => x.searchTerm?.toLowerCase() === n.toLowerCase() && x.geoTargetConstant?.status !== "REMOVAL_PLANNED");
      if (s?.geoTargetConstant) out.push(s.geoTargetConstant.resourceName); else faltam.push(n);
    }
    if (faltam.length) throw new ProviderError(`Localização não encontrada no Google Ads: ${faltam.join(", ")}. Use nomes como "Brasil", "Goiás" ou "Goiânia".`);
    return [...new Set(out)];
  }

  /**
   * Cria a campanha de pesquisa inteira (orçamento, campanha PAUSADA, segmentação, grupos, palavras, anúncios e assets)
   * numa única chamada atômica. validateOnly: o Google confere tudo e não cria nada (botão "Validar no Google").
   */
  async createSearchCampaign(customerId: string, spec: GoogleSearchSpec, o: { validateOnly?: boolean } = {}): Promise<{ campaignId: string | null }> {
    const id = cid(customerId);
    const geo = await this.resolverLocais(spec.localizacoes);
    const ops = operacoesSearch(id, spec, geo, new Date().toISOString().slice(0, 16).replace("T", " "));
    try {
      const r = await this.call<{ mutateOperationResponses?: { campaignResult?: { resourceName?: string } }[] }>(`customers/${id}/googleAds:mutate`, { mutateOperations: ops, validateOnly: !!o.validateOnly });
      const rn = r.mutateOperationResponses?.find((x) => x.campaignResult?.resourceName)?.campaignResult?.resourceName;
      return { campaignId: rn ? rn.split("/").pop()! : null };
    } catch (e) {
      if (e instanceof ProviderError && !e.auth) throw new ProviderError(`Google Ads recusou: ${errosGoogle(e.detail, ops).join(" · ") || e.message}`, false, e.detail);
      throw e;
    }
  }
}

/** Lê o GoogleAdsFailure e diz QUAL item falhou (ex.: "grupo 2, palavra-chave …: …"). */
export function errosGoogle(detail: unknown, ops: Record<string, unknown>[] = []): string[] {
  const det = (detail as { error?: { details?: { errors?: { message?: string; location?: { fieldPathElements?: { fieldName?: string; index?: number }[] } }[] }[] } } | undefined)?.error?.details ?? [];
  const msgs: string[] = [];
  for (const d of det) for (const e of d.errors ?? []) {
    const caminho = e.location?.fieldPathElements ?? [];
    const i = caminho.find((p) => p.fieldName === "mutate_operations")?.index;
    const op = i != null ? ops[i] : undefined;
    const alvo = op ? descreverOp(op) : "";
    msgs.push(`${alvo ? `${alvo}: ` : ""}${e.message ?? "erro"}`);
  }
  return [...new Set(msgs)].slice(0, 6);
}
function descreverOp(op: Record<string, unknown>): string {
  const k = Object.keys(op)[0]!;
  const c = (op[k] as { create?: Record<string, unknown> }).create ?? {};
  const kw = c.keyword as { text?: string } | undefined;
  if (kw?.text) return `palavra-chave “${kw.text}”`;
  if (k === "adGroupAdOperation") { const h = ((c.ad as { responsiveSearchAd?: { headlines?: { text: string }[] } })?.responsiveSearchAd?.headlines ?? [])[0]?.text; return `anúncio “${h ?? ""}…”`; }
  if (k === "adGroupOperation") return `grupo “${String(c.name ?? "")}”`;
  if (k === "campaignOperation") return "campanha";
  if (k === "campaignBudgetOperation") return "orçamento";
  if (k === "assetOperation") return c.sitelinkAsset ? `sitelink “${(c.sitelinkAsset as { linkText?: string }).linkText}”` : "frase de destaque";
  return k.replace("Operation", "");
}
