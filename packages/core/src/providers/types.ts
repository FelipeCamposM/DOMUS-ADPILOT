// Modelos normalizados: a UI e o domínio só conhecem estes tipos, nunca o formato da Meta/Google.

export const PROVIDERS = ["META", "GOOGLE"] as const;
export type Provider = (typeof PROVIDERS)[number];
export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED" | "ERROR";

export interface RemoteAccount {
  externalId: string;
  name: string;
  currency: string;
  timezone: string | null;
}

export interface RemoteCampaign {
  externalId: string;
  name: string;
  objective: string | null;
  status: CampaignStatus;
  dailyBudget: string | null; // decimal "100.00" na moeda da conta
  lifetimeBudget: string | null;
  startedAt: string | null;
  endedAt: string | null;
  providerData: Record<string, unknown>;
}

export interface DailyMetric {
  campaignExternalId: string;
  date: string; // YYYY-MM-DD
  spend: string;
  impressions: number;
  clicks: number;
  leads: string;
  conversions: string;
  revenue: string;
}

/** Referência mínima a uma campanha já sincronizada, para operações de escrita. */
export interface CampaignRef {
  accountExternalId: string;
  externalId: string;
  providerData: Record<string, unknown>;
}

export interface AdsProvider {
  listAccounts(): Promise<RemoteAccount[]>;
  getCampaigns(accountExternalId: string): Promise<RemoteCampaign[]>;
  pauseCampaign(c: CampaignRef): Promise<void>;
  activateCampaign(c: CampaignRef): Promise<void>;
  updateBudget(c: CampaignRef, dailyBudget: string): Promise<void>;
  getInsights(accountExternalId: string, range: { since: string; until: string }): Promise<DailyMetric[]>;
}

/** Erro vindo do provider, com mensagem em português para a UI. `auth` = credencial inválida/expirada. */
export class ProviderError extends Error {
  constructor(message: string, readonly auth = false, readonly detail?: unknown) {
    super(message);
  }
}
