import type { PluggyConta, PluggyTransacao } from "@domus-ads/core/financeiro";

/** Cliente mínimo da API da Pluggy. Credenciais só no .env do worker (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET). */
const BASE = process.env.PLUGGY_BASE_URL ?? "https://api.pluggy.ai";
let chave: { apiKey: string; ate: number } | null = null;

async function apiKey() {
  if (chave && chave.ate > Date.now()) return chave.apiKey;
  const clientId = process.env.PLUGGY_CLIENT_ID, clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET faltando no .env do worker.");
  const r = await fetch(`${BASE}/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, clientSecret }) });
  if (!r.ok) throw new Error(`Pluggy recusou as credenciais (${r.status}).`);
  const { apiKey } = (await r.json()) as { apiKey: string };
  chave = { apiKey, ate: Date.now() + 90 * 60_000 }; // vale ~2h; renova antes
  return apiKey;
}

async function get<T>(caminho: string): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    const r = await fetch(`${BASE}${caminho}`, { headers: { "X-API-KEY": await apiKey() }, signal: AbortSignal.timeout(60_000) });
    if (r.ok) return (await r.json()) as T;
    if (r.status === 401 && tentativa === 0) { chave = null; continue; }
    if ((r.status === 429 || r.status >= 500) && tentativa < 3) { await new Promise((ok) => setTimeout(ok, 2000 * (tentativa + 1))); continue; }
    const corpo = await r.text().catch(() => "");
    throw new Error(`Pluggy ${r.status} em ${caminho.split("?")[0]}: ${corpo.slice(0, 200)}`);
  }
}

export interface PluggyItem {
  id: string; status: string; executionStatus?: string; updatedAt?: string; lastUpdatedAt?: string | null;
  error?: { message?: string } | null;
  connector: { name: string; imageUrl?: string; primaryColor?: string };
}

export const item = (id: string) => get<PluggyItem>(`/items/${id}`);
export const contas = async (itemId: string) => (await get<{ results: PluggyConta[] }>(`/accounts?itemId=${itemId}`)).results;

/** Pagina por cursor: usa o `next` da resposta (pageSize não é aceito; o filtro é dateFrom). */
export async function transacoes(accountId: string, desde?: string): Promise<PluggyTransacao[]> {
  const p = new URLSearchParams({ accountId });
  if (desde) p.set("dateFrom", desde);
  const out: PluggyTransacao[] = [];
  let caminho: string | null = `/v2/transactions?${p}`;
  while (caminho) {
    const pg: { results: PluggyTransacao[]; next: string | null } = await get(caminho);
    out.push(...pg.results);
    caminho = pg.next ? `/v2/transactions${pg.next}` : null; // `next` já vem como "?cursor=…"
  }
  return out;
}
