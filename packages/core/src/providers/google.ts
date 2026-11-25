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

export interface DetalhesGoogle {
  status: string; situacao: string; motivos: string[]; lance: string; cpcMax: string | null; orcamentoDia: string | null;
  inicio: string | null; fim: string | null; locais: string[]; locaisExcluidos: string[];
  horarios: { dia: string; de: number; ate: number }[]; negativas: string[]; sitelinks: { texto: string; url: string | null }[];
  grupos: {
    nome: string; status: string; cpc: string | null; negativas: string[];
    anuncios: { titulos: string[]; descricoes: string[]; url: string | null; caminho: string; aprovacao: string; situacao: string }[];
    palavras: { texto: string; tipo: string; situacao: string; motivos: string[]; nota: number | null; impressoes: number; cliques: number }[];
  }[];
}
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

  async removeCampaign(c: CampaignRef) {
    const id = cid(c.accountExternalId);
    await this.call(`customers/${id}/campaigns:mutate`, { operations: [{ remove: `customers/${id}/campaigns/${c.externalId}` }] });
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

  /** O que está no ar de verdade numa campanha de Pesquisa (lido do Google, não do rascunho): grupos, anúncios, palavras, segmentação. */
  async detalhesPesquisa(customerId: string, campaignId: string): Promise<DetalhesGoogle> {
    const id = Number(campaignId); // só dígitos entram na query
    const q = (s: string) => this.search(customerId, s) as Promise<unknown[]>;
    const [[camp], grupos, anuncios, palavras, metr, crit, links] = await Promise.all([
      q(`SELECT campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.bidding_strategy_type,
                campaign.target_spend.cpc_bid_ceiling_micros, campaign.start_date_time, campaign.end_date_time, campaign_budget.amount_micros
         FROM campaign WHERE campaign.id = ${id}`),
      q(`SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros FROM ad_group WHERE campaign.id = ${id} AND ad_group.status != 'REMOVED'`),
      q(`SELECT ad_group.id, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions,
                ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2, ad_group_ad.ad.final_urls,
                ad_group_ad.policy_summary.approval_status, ad_group_ad.primary_status
         FROM ad_group_ad WHERE campaign.id = ${id} AND ad_group_ad.status != 'REMOVED'`),
      q(`SELECT ad_group.id, ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.negative,
                ad_group_criterion.primary_status, ad_group_criterion.primary_status_reasons, ad_group_criterion.quality_info.quality_score
         FROM ad_group_criterion WHERE campaign.id = ${id} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'`),
      q(`SELECT ad_group_criterion.resource_name, metrics.impressions, metrics.clicks FROM keyword_view WHERE campaign.id = ${id} AND segments.date DURING LAST_30_DAYS`),
      q(`SELECT campaign_criterion.type, campaign_criterion.negative, campaign_criterion.location.geo_target_constant, campaign_criterion.keyword.text,
                campaign_criterion.ad_schedule.day_of_week, campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.end_hour
         FROM campaign_criterion WHERE campaign.id = ${id}`),
      q(`SELECT asset.sitelink_asset.link_text, asset.final_urls FROM campaign_asset
         WHERE campaign.id = ${id} AND campaign_asset.field_type = 'SITELINK' AND campaign_asset.status != 'REMOVED'`).catch(() => []),
    ]);
    if (!camp) throw new ProviderError("Campanha não encontrada no Google Ads");
    const s = (r: unknown, p: string) => { const v = p.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], r); return v == null ? null : String(v); };
    const arr = <T = string>(r: unknown, p: string) => (p.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], r) as T[] | undefined) ?? [];
    const micros = (v: string | null) => (v ? fromMicros(v) : null);

    const porKw = new Map<string, { i: number; c: number }>();
    for (const m of metr) {
      const k = s(m, "adGroupCriterion.resourceName")!, a = porKw.get(k) ?? { i: 0, c: 0 };
      porKw.set(k, { i: a.i + Number(s(m, "metrics.impressions") ?? 0), c: a.c + Number(s(m, "metrics.clicks") ?? 0) });
    }
    const geos = crit.map((c) => s(c, "campaignCriterion.location.geoTargetConstant")).filter((g): g is string => !!g);
    const nomes = new Map<string, string>();
    if (geos.length) {
      const rows = await q(`SELECT geo_target_constant.resource_name, geo_target_constant.canonical_name FROM geo_target_constant
        WHERE geo_target_constant.resource_name IN (${geos.map((g) => `'${g.replace(/[^\w/]/g, "")}'`).join(",")})`).catch(() => []);
      for (const r of rows) nomes.set(s(r, "geoTargetConstant.resourceName")!, s(r, "geoTargetConstant.canonicalName")!);
    }
    const crits = (tipo: string, neg: boolean) => crit.filter((c) => s(c, "campaignCriterion.type") === tipo && (s(c, "campaignCriterion.negative") === "true") === neg);

    return {
      status: s(camp, "campaign.status")!,
      situacao: s(camp, "campaign.primaryStatus") ?? "",
      motivos: arr(camp, "campaign.primaryStatusReasons"),
      lance: s(camp, "campaign.biddingStrategyType") ?? "",
      cpcMax: micros(s(camp, "campaign.targetSpend.cpcBidCeilingMicros")),
      orcamentoDia: micros(s(camp, "campaignBudget.amountMicros")),
      inicio: s(camp, "campaign.startDateTime"),
      fim: s(camp, "campaign.endDateTime"),
      locais: crits("LOCATION", false).map((c) => { const g = s(c, "campaignCriterion.location.geoTargetConstant")!; return nomes.get(g) ?? g; }),
      locaisExcluidos: crits("LOCATION", true).map((c) => { const g = s(c, "campaignCriterion.location.geoTargetConstant")!; return nomes.get(g) ?? g; }),
      horarios: crits("AD_SCHEDULE", false).map((c) => ({ dia: s(c, "campaignCriterion.adSchedule.dayOfWeek")!, de: Number(s(c, "campaignCriterion.adSchedule.startHour") ?? 0), ate: Number(s(c, "campaignCriterion.adSchedule.endHour") ?? 24) })),
      negativas: crits("KEYWORD", true).map((c) => s(c, "campaignCriterion.keyword.text")!),
      sitelinks: links.map((l) => ({ texto: s(l, "asset.sitelinkAsset.linkText") ?? "", url: arr(l, "asset.finalUrls")[0] ?? null })),
      grupos: grupos.map((g) => {
        const gid = s(g, "adGroup.id");
        const kws = palavras.filter((p) => s(p, "adGroup.id") === gid);
        return {
          nome: s(g, "adGroup.name") ?? "", status: s(g, "adGroup.status") ?? "", cpc: micros(s(g, "adGroup.cpcBidMicros")),
          anuncios: anuncios.filter((a) => s(a, "adGroup.id") === gid).map((a) => ({
            titulos: arr<{ text: string }>(a, "adGroupAd.ad.responsiveSearchAd.headlines").map((h) => h.text),
            descricoes: arr<{ text: string }>(a, "adGroupAd.ad.responsiveSearchAd.descriptions").map((h) => h.text),
            url: arr(a, "adGroupAd.ad.finalUrls")[0] ?? null,
            caminho: [s(a, "adGroupAd.ad.responsiveSearchAd.path1"), s(a, "adGroupAd.ad.responsiveSearchAd.path2")].filter(Boolean).join("/"),
            aprovacao: s(a, "adGroupAd.policySummary.approvalStatus") ?? "", situacao: s(a, "adGroupAd.primaryStatus") ?? "",
          })),
          palavras: kws.filter((p) => s(p, "adGroupCriterion.negative") !== "true").map((p) => {
            const m = porKw.get(s(p, "adGroupCriterion.resourceName")!);
            const nota = s(p, "adGroupCriterion.qualityInfo.qualityScore");
            return {
              texto: s(p, "adGroupCriterion.keyword.text")!, tipo: s(p, "adGroupCriterion.keyword.matchType")!,
              situacao: s(p, "adGroupCriterion.primaryStatus") ?? "", motivos: arr(p, "adGroupCriterion.primaryStatusReasons"),
              nota: nota ? Number(nota) : null, impressoes: m?.i ?? 0, cliques: m?.c ?? 0,
            };
          }),
          negativas: kws.filter((p) => s(p, "adGroupCriterion.negative") === "true").map((p) => s(p, "adGroupCriterion.keyword.text")!),
        };
      }),
    };
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
