import { db } from "./db";
import { providerFor, ProviderError } from "./providers";

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Sincroniza uma conexão inteira: descobre/atualiza as contas de anúncio e depois sincroniza cada uma. */
export async function syncConnection(connectionId: string, log: (m: string) => Promise<void> = async () => {}, progress: (p: number) => Promise<void> = async () => {}) {
  const sql = db();
  const [k] = await sql<{ id: string; workspace_id: string; provider: string; credentials_enc: string }[]>`
    select id, workspace_id, provider, credentials_enc from ads.ad_connections where id = ${connectionId}`;
  if (!k) throw new Error("Conexão não encontrada");
  let accounts;
  try {
    accounts = await providerFor(k.provider, k.credentials_enc).listAccounts();
  } catch (e) {
    await sql`update ads.ad_connections set status = 'ERROR', last_error = ${(e as Error).message} where id = ${k.id}`;
    throw e;
  }
  await log(`${accounts.length} contas de anúncio encontradas`);
  const ids: string[] = [];
  for (const a of accounts) {
    const [row] = await sql<{ id: string }[]>`
      insert into ads.ad_accounts (workspace_id, connection_id, provider, external_id, name, currency, timezone)
      values (${k.workspace_id}, ${k.id}, ${k.provider}, ${a.externalId}, ${a.name}, ${a.currency}, ${a.timezone})
      on conflict (connection_id, external_id) do update set name = excluded.name, currency = excluded.currency, timezone = excluded.timezone
      returning id`;
    ids.push(row!.id);
  }
  const totals = { accounts: ids.length, campaigns: 0, metrics: 0, errors: [] as string[] };
  for (const [i, id] of ids.entries()) {
    try {
      const r = await syncAdAccount(id, 30, log);
      totals.campaigns += r.campaigns;
      totals.metrics += r.metrics;
    } catch (e) {
      totals.errors.push((e as Error).message);
      await log(`erro na conta ${accounts[i]!.name}: ${(e as Error).message}`);
      if (e instanceof ProviderError && e.auth) throw e; // credencial morta: não adianta seguir
    }
    await progress(Math.round(((i + 1) / ids.length) * 100));
  }
  await sql`update ads.ad_connections set last_synced_at = now() where id = ${k.id}`;
  return totals;
}

/**
 * Sincroniza uma conta: campanhas (upsert) + métricas diárias dos últimos `days` dias.
 * Credencial inválida marca a conexão como ERROR (a UI mostra para reconectar).
 */
export async function syncAdAccount(adAccountId: string, days = 30, log: (m: string) => Promise<void> = async () => {}) {
  const sql = db();
  const [acc] = await sql<{ id: string; workspace_id: string; provider: string; external_id: string; connection_id: string; credentials_enc: string }[]>`
    select a.id, a.workspace_id, a.provider, a.external_id, a.connection_id, k.credentials_enc
    from ads.ad_accounts a join ads.ad_connections k on k.id = a.connection_id where a.id = ${adAccountId}`;
  if (!acc) throw new Error("Conta de anúncios não encontrada");
  const provider = providerFor(acc.provider, acc.credentials_enc);

  try {
    const campaigns = await provider.getCampaigns(acc.external_id);
    await log(`${campaigns.length} campanhas recebidas`);
    const ids = new Map<string, string>();
    for (const c of campaigns) {
      const [row] = await sql<{ id: string }[]>`
        insert into ads.campaigns (workspace_id, ad_account_id, provider, external_id, name, objective, status,
                                   daily_budget, lifetime_budget, started_at, ended_at, provider_data, last_synced_at)
        values (${acc.workspace_id}, ${acc.id}, ${acc.provider}, ${c.externalId}, ${c.name}, ${c.objective}, ${c.status},
                ${c.dailyBudget}, ${c.lifetimeBudget}, ${c.startedAt}, ${c.endedAt}, ${sql.json(c.providerData as never)}, now())
        on conflict (ad_account_id, external_id) do update set
          name = excluded.name, objective = excluded.objective, status = excluded.status, daily_budget = excluded.daily_budget,
          lifetime_budget = excluded.lifetime_budget, started_at = excluded.started_at, ended_at = excluded.ended_at,
          provider_data = excluded.provider_data, last_synced_at = now(), updated_at = now()
        returning id`;
      ids.set(c.externalId, row!.id);
    }

    const until = new Date();
    const since = new Date(until.getTime() - (days - 1) * 86_400_000);
    const metrics = await provider.getInsights(acc.external_id, { since: day(since), until: day(until) });
    await log(`${metrics.length} linhas de métricas recebidas`);
    for (const m of metrics) {
      const campaignId = ids.get(m.campaignExternalId);
      if (!campaignId) continue; // campanha removida
      await sql`
        insert into ads.metrics_daily (campaign_id, workspace_id, date, spend, impressions, clicks, leads, conversions, revenue)
        values (${campaignId}, ${acc.workspace_id}, ${m.date}, ${m.spend}, ${m.impressions}, ${m.clicks}, ${m.leads}, ${m.conversions}, ${m.revenue})
        on conflict (campaign_id, date) do update set spend = excluded.spend, impressions = excluded.impressions, clicks = excluded.clicks,
          leads = excluded.leads, conversions = excluded.conversions, revenue = excluded.revenue`;
    }
    await sql`update ads.ad_accounts set last_synced_at = now() where id = ${acc.id}`;
    await sql`update ads.ad_connections set status = 'ACTIVE', last_error = null where id = ${acc.connection_id}`;
    return { campaigns: campaigns.length, metrics: metrics.length };
  } catch (e) {
    if (e instanceof ProviderError && e.auth) {
      await sql`update ads.ad_connections set status = 'ERROR', last_error = ${e.message} where id = ${acc.connection_id}`;
    }
    throw e;
  }
}
