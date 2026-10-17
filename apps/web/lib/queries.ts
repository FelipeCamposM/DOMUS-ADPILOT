import "server-only";
import { db } from "@domus-ads/core";
import { cache } from "react";
import { z } from "zod";

/** Filtros da URL (?provider=&account=&campaign=&days=). Tudo opcional; inválido cai no padrão. */
const filtroSchema = z.object({
  provider: z.enum(["META", "GOOGLE"]).optional().catch(undefined),
  account: z.string().uuid().optional().catch(undefined),
  campaign: z.string().uuid().optional().catch(undefined),
  days: z.coerce.number().pipe(z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(90)])).catch(30),
});
export type Filtro = z.infer<typeof filtroSchema> & { since: string; until: string; prevSince: string; prevUntil: string };

const dia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD no fuso de Goiás

export function parseFiltro(sp: Record<string, string | string[] | undefined>): Filtro {
  const f = filtroSchema.parse(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const hoje = new Date(`${dia(new Date())}T12:00:00Z`);
  const menos = (n: number) => dia(new Date(hoje.getTime() - n * 86_400_000));
  return { ...f, until: menos(0), since: menos(f.days - 1), prevUntil: menos(f.days), prevSince: menos(2 * f.days - 1) };
}

export interface Totais { spend: string; impressions: string; clicks: string; leads: string; conversions: string; revenue: string }

/** Soma do período com os mesmos filtros. Numeric/bigint voltam como string (sem float no caminho do dinheiro). */
async function totais(ws: string, f: Filtro, since: string, until: string): Promise<Totais> {
  const sql = db();
  const [t] = await sql<Totais[]>`
    select coalesce(sum(m.spend), 0)::text as spend, coalesce(sum(m.impressions), 0)::text as impressions,
           coalesce(sum(m.clicks), 0)::text as clicks, coalesce(sum(m.leads), 0)::text as leads,
           coalesce(sum(m.conversions), 0)::text as conversions, coalesce(sum(m.revenue), 0)::text as revenue
    from ads.metrics_daily m join ads.campaigns c on c.id = m.campaign_id
    where m.workspace_id = ${ws} and m.date between ${since} and ${until}
      ${f.provider ? sql`and c.provider = ${f.provider}` : sql``}
      ${f.account ? sql`and c.ad_account_id = ${f.account}` : sql``}
      ${f.campaign ? sql`and c.id = ${f.campaign}` : sql``}`;
  return t!;
}

export async function kpis(ws: string, f: Filtro) {
  const [atual, anterior] = await Promise.all([totais(ws, f, f.since, f.until), totais(ws, f, f.prevSince, f.prevUntil)]);
  return { atual, anterior };
}

export interface PontoSerie { date: string; spend: string; clicks: string; conversions: string; revenue: string }

export async function serie(ws: string, f: Filtro): Promise<PontoSerie[]> {
  const sql = db();
  return sql<PontoSerie[]>`
    select d::date::text as date, coalesce(sum(m.spend), 0)::text as spend, coalesce(sum(m.clicks), 0)::text as clicks,
           coalesce(sum(m.conversions + m.leads), 0)::text as conversions, coalesce(sum(m.revenue), 0)::text as revenue
    from generate_series(${f.since}::date, ${f.until}::date, interval '1 day') d
    left join (ads.metrics_daily m join ads.campaigns c on c.id = m.campaign_id
      ${f.provider ? sql`and c.provider = ${f.provider}` : sql``}
      ${f.account ? sql`and c.ad_account_id = ${f.account}` : sql``}
      ${f.campaign ? sql`and c.id = ${f.campaign}` : sql``})
      on m.date = d::date and m.workspace_id = ${ws}
    group by d order by d`;
}

export interface CampanhaLinha {
  id: string; name: string; provider: "META" | "GOOGLE"; status: string; objective: string | null;
  daily_budget: string | null; lifetime_budget: string | null; account_name: string; currency: string;
  budget_editable: boolean; last_synced_at: Date | null;
  spend: string; impressions: string; clicks: string; leads: string; conversions: string; revenue: string;
}

export async function campanhas(ws: string, f: Filtro): Promise<CampanhaLinha[]> {
  const sql = db();
  return sql<CampanhaLinha[]>`
    select c.id, c.name, c.provider, c.status, c.objective, c.daily_budget::text, c.lifetime_budget::text, c.last_synced_at,
           a.name as account_name, a.currency,
           (c.daily_budget is not null and coalesce((c.provider_data->>'budgetShared')::boolean, false) = false) as budget_editable,
           coalesce(sum(m.spend), 0)::text as spend, coalesce(sum(m.impressions), 0)::text as impressions,
           coalesce(sum(m.clicks), 0)::text as clicks, coalesce(sum(m.leads), 0)::text as leads,
           coalesce(sum(m.conversions), 0)::text as conversions, coalesce(sum(m.revenue), 0)::text as revenue
    from ads.campaigns c
    join ads.ad_accounts a on a.id = c.ad_account_id
    left join ads.metrics_daily m on m.campaign_id = c.id and m.date between ${f.since} and ${f.until}
    where c.workspace_id = ${ws} and c.status <> 'ARCHIVED'
      ${f.provider ? sql`and c.provider = ${f.provider}` : sql``}
      ${f.account ? sql`and c.ad_account_id = ${f.account}` : sql``}
      ${f.campaign ? sql`and c.id = ${f.campaign}` : sql``}
    group by c.id, a.id
    order by (c.status = 'ACTIVE') desc, coalesce(sum(m.spend), 0) desc, c.name`;
}

/** cache(): layout e página pedem a mesma coisa na mesma requisição; vai ao banco uma vez só. */
export const opcoesFiltro = cache(async (ws: string) => {
  const sql = db();
  const [contas, camps] = await Promise.all([
    sql<{ id: string; name: string; provider: string }[]>`
    select id, name, provider from ads.ad_accounts where workspace_id = ${ws} order by provider, name`,
    sql<{ id: string; name: string; ad_account_id: string }[]>`
    select id, name, ad_account_id from ads.campaigns where workspace_id = ${ws} and status <> 'ARCHIVED' order by name`,
  ]);
  return { contas, campanhas: camps };
});

/** Contadores do topo (sininho): ações da IA aguardando aprovação e jobs que falharam nas últimas 24 h. */
export async function notificacoes(ws: string) {
  const sql = db();
  const acoes = await sql<{ id: string; type: string; summary: string; conversation_id: string | null; created_at: Date }[]>`
    select id, type, summary, conversation_id, created_at from ads.ai_actions
    where workspace_id = ${ws} and status = 'PENDING_APPROVAL' order by created_at desc limit 20`;
  const falhas = await sql<{ id: string; type: string; error: string | null; finished_at: Date }[]>`
    select id, type, error, finished_at from ads.jobs
    where workspace_id = ${ws} and status = 'FAILED' and finished_at > now() - interval '24 hours' order by finished_at desc limit 10`;
  return { acoes, falhas };
}

export const workerOnline = cache(async (): Promise<{ online: boolean; lastSeen: Date | null; info: Record<string, unknown> }> => {
  const [w] = await db()<{ last_seen: Date; info: Record<string, unknown> }[]>`
    select last_seen, info from ads.worker_status order by last_seen desc limit 1`;
  // status do worker é decorativo no layout: dado estranho nunca pode derrubar a página
  const visto = w?.last_seen instanceof Date ? w.last_seen : null;
  return { online: !!visto && Date.now() - visto.getTime() < 90_000, lastSeen: visto, info: w?.info && typeof w.info === "object" ? w.info : {} };
});

export interface UsoContaIA {
  id: string; provider: string; name: string; email: string | null; plan: string | null; status: string; limited_until: string | null;
  usage: { five_hour?: { pct: number; resets_at: string | null }; seven_day?: { pct: number; resets_at: string | null }; observed_at?: string } | null;
  chamadas24h: number; tokens24h: string; custo24h: string | null;
}

/** Contas de IA (globais) com a janela de uso de 5 h / 7 dias e o gasto das últimas 24 h, para o menu do topo. */
export function usoContasIA() {
  return db()<UsoContaIA[]>`
    select a.id, a.provider, a.name, a.email, a.plan, a.status, to_char(a.limited_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as limited_until, a.usage,
      coalesce(u.n, 0)::int as "chamadas24h", coalesce(u.tokens, 0)::text as "tokens24h", u.custo::text as "custo24h"
    from ads.ai_accounts a
    left join (select ai_account_id, count(*) n, sum(input_tokens + output_tokens) tokens, sum(cost_usd) custo
               from ads.ai_usage where created_at > now() - interval '24 hours' group by ai_account_id) u on u.ai_account_id = a.id
    order by a.priority, a.created_at`;
}
