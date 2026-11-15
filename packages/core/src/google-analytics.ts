import { createSign } from "node:crypto";
import { z } from "zod";
import { lerSegredo } from "./settings";

/**
 * GA4 e Search Console pela conta de serviço do Google (só leitura).
 * A chave JSON fica cifrada em ads.settings ("google_conta_servico") ou em GOOGLE_SA_JSON; nunca vai ao navegador.
 * Cada site dá acesso de Leitor ao e-mail da conta no GA4 e de Usuário (restrito) no Search Console.
 */
export const contaServicoSchema = z.object({
  type: z.literal("service_account", { message: "Não é a chave de uma conta de serviço" }),
  client_email: z.string().email("Chave sem client_email"),
  private_key: z.string().includes("PRIVATE KEY", { message: "Chave sem private_key" }),
});
export type ContaServico = z.infer<typeof contaServicoSchema>;

export async function contaServico(): Promise<ContaServico | null> {
  const bruto = (await lerSegredo("google_conta_servico").catch(() => null)) ?? process.env.GOOGLE_SA_JSON ?? null;
  if (!bruto) return null;
  const p = contaServicoSchema.safeParse(JSON.parse(bruto));
  return p.success ? p.data : null;
}

const ESCOPOS = "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly";
const b64 = (v: unknown) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
// ponytail: cache de 1 token por processo (é uma conta só); some ao trocar a chave pelo client_email
let tokenCache: { email: string; token: string; ate: number } | null = null;

export async function tokenGoogle(sa: ContaServico): Promise<string> {
  if (tokenCache && tokenCache.email === sa.client_email && tokenCache.ate > Date.now() + 60_000) return tokenCache.token;
  const agora = Math.floor(Date.now() / 1000);
  const corpo = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: ESCOPOS, aud: "https://oauth2.googleapis.com/token", iat: agora, exp: agora + 3600 })}`;
  const assinatura = createSign("RSA-SHA256").update(corpo).sign(sa.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${corpo}.${assinatura}` }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`Google recusou a conta de serviço: ${j.error_description ?? r.status}`);
  tokenCache = { email: sa.client_email, token: j.access_token, ate: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

async function chamar<T>(token: string, url: string, body: unknown, nome: string): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } };
  if (!r.ok) {
    if (r.status === 403) throw new Error(nome.startsWith("GA4")
      ? "GA4: a conta de serviço não tem acesso. No GA4: Administrador → Gerenciamento de acesso à propriedade → adicione o e-mail dela como Leitor"
      : "Search Console: a conta de serviço não tem acesso. No Search Console: Configurações → Usuários e permissões → adicione o e-mail dela como Restrito (a propriedade cadastrada tem que ser a mesma: domínio ou prefixo de URL)");
    if (r.status === 404) throw new Error(`${nome}: não encontrado (confira o ID/endereço cadastrado)`);
    throw new Error(`${nome}: ${j.error?.message ?? r.status}`);
  }
  return j;
}

// ───────────── períodos ─────────────

const iso = (d: Date) => d.toISOString().slice(0, 10);
const menosDias = (d: Date, n: number) => new Date(d.getTime() - n * 86_400_000);

/** Últimos `dias` (terminando hoje, ou `fimAtras` dias atrás) e o período anterior de mesmo tamanho. */
export function periodos(dias: number, fimAtras = 0, hoje = new Date()) {
  const fim = menosDias(hoje, fimAtras);
  const ini = menosDias(fim, dias - 1);
  return { atual: { ini: iso(ini), fim: iso(fim) }, anterior: { ini: iso(menosDias(ini, dias)), fim: iso(menosDias(ini, 1)) } };
}

// ───────────── GA4 ─────────────

const METRICAS_GA = ["activeUsers", "newUsers", "sessions", "screenPageViews", "engagementRate", "averageSessionDuration", "keyEvents"] as const;
export type TotaisGa = Record<(typeof METRICAS_GA)[number], number>;
type Linha = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };
type Relatorio = { rows?: Linha[] };

export interface RelatorioGa {
  atual: TotaisGa; anterior: TotaisGa;
  porDia: { date: string; usuarios: number; sessoes: number; visualizacoes: number }[];
  origens: { nome: string; sessoes: number; usuarios: number; eventos: number }[];
  paginas: { nome: string; visualizacoes: number; usuarios: number }[];
  dispositivos: { nome: string; usuarios: number }[];
  cidades: { nome: string; usuarios: number }[];
  agora: number;
}

const totais = (l: Linha | undefined): TotaisGa =>
  Object.fromEntries(METRICAS_GA.map((m, i) => [m, Number(l?.metricValues?.[i]?.value ?? 0)])) as TotaisGa;
const linhas = <T>(r: Relatorio | undefined, f: (d: string[], m: number[]) => T) =>
  (r?.rows ?? []).map((l) => f((l.dimensionValues ?? []).map((x) => x.value), (l.metricValues ?? []).map((x) => Number(x.value))));

export async function relatorioGa4(token: string, propriedade: string, dias: number): Promise<RelatorioGa> {
  const { atual, anterior } = periodos(dias);
  const prop = `https://analyticsdata.googleapis.com/v1beta/properties/${propriedade}`;
  const ranges = [{ startDate: atual.ini, endDate: atual.fim }];
  const top = (dim: string, metricas: string[], limit = 10) => ({
    dateRanges: ranges, dimensions: [{ name: dim }], metrics: metricas.map((name) => ({ name })),
    orderBys: [{ metric: { metricName: metricas[0] }, desc: true }], limit,
  });
  const [lote, tempoReal] = await Promise.all([
    chamar<{ reports?: Relatorio[] }>(token, `${prop}:batchRunReports`, {
      requests: [
        // com 2 períodos o GA4 devolve uma linha por período (dimensão dateRange)
        { dateRanges: [{ ...ranges[0], name: "atual" }, { startDate: anterior.ini, endDate: anterior.fim, name: "anterior" }], metrics: METRICAS_GA.map((name) => ({ name })) },
        { dateRanges: ranges, dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }], orderBys: [{ dimension: { dimensionName: "date" } }], limit: 400 },
        top("sessionSourceMedium", ["sessions", "activeUsers", "keyEvents"]),
        top("pagePath", ["screenPageViews", "activeUsers"]),
        top("deviceCategory", ["activeUsers"], 5),
      ],
    }, "GA4"),
    chamar<Relatorio>(token, `${prop}:runRealtimeReport`, { metrics: [{ name: "activeUsers" }] }, "GA4 tempo real"),
  ]);
  const [rTot, rDia, rOrig, rPag, rDisp] = lote.reports ?? [];
  const cidades = await chamar<Relatorio>(token, `${prop}:runReport`, top("city", ["activeUsers"], 8), "GA4");
  const porPeriodo = (nome: string) => rTot?.rows?.find((l) => l.dimensionValues?.some((d) => d.value === nome)) ?? (nome === "atual" && rTot?.rows?.length === 1 ? rTot.rows[0] : undefined);
  return {
    atual: totais(porPeriodo("atual")),
    anterior: totais(porPeriodo("anterior")),
    porDia: linhas(rDia, ([d], [u, s, v]) => ({ date: `${d!.slice(0, 4)}-${d!.slice(4, 6)}-${d!.slice(6, 8)}`, usuarios: u ?? 0, sessoes: s ?? 0, visualizacoes: v ?? 0 })),
    origens: linhas(rOrig, ([n], [s, u, e]) => ({ nome: n ?? "", sessoes: s ?? 0, usuarios: u ?? 0, eventos: e ?? 0 })),
    paginas: linhas(rPag, ([n], [v, u]) => ({ nome: n ?? "", visualizacoes: v ?? 0, usuarios: u ?? 0 })),
    dispositivos: linhas(rDisp, ([n], [u]) => ({ nome: n ?? "", usuarios: u ?? 0 })),
    cidades: linhas(cidades, ([n], [u]) => ({ nome: n ?? "", usuarios: u ?? 0 })).filter((c) => c.nome !== "(not set)"),
    agora: Number(tempoReal.rows?.[0]?.metricValues?.[0]?.value ?? 0),
  };
}

// ───────────── Search Console ─────────────

export interface TotaisGsc { cliques: number; impressoes: number; ctr: number; posicao: number }
export interface RelatorioGsc {
  atual: TotaisGsc; anterior: TotaisGsc;
  porDia: { date: string; cliques: number; impressoes: number }[];
  buscas: { nome: string; cliques: number; impressoes: number; ctr: number; posicao: number }[];
  paginas: { nome: string; cliques: number; impressoes: number; ctr: number; posicao: number }[];
}
type LinhaGsc = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

/**
 * Regex (RE2) das páginas dos domínios do site: o domínio exato ou com www., sem outros subdomínios.
 * Uma propriedade de domínio (sc-domain:) cobre todos os subdomínios; isto separa, ex., digitaldomus.com.br de siaplus.digitaldomus.com.br.
 */
export function filtroPaginas(dominios: string[]): string | null {
  if (!dominios.length) return null;
  const hosts = dominios.map((d) => d.replace(/^www\./, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return `^https?://(www\\.)?(${hosts})([/:?#]|$)`;
}

export async function relatorioGsc(token: string, site: string, dias: number, dominios: string[] = []): Promise<RelatorioGsc> {
  // o Search Console fecha os dados com ~2 dias de atraso: o período termina 2 dias atrás
  const { atual, anterior } = periodos(dias, 2);
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const regex = filtroPaginas(dominios);
  const filtro = regex ? { dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "includingRegex", expression: regex }] }] } : {};
  const q = (p: { ini: string; fim: string }, dimensions: string[] = [], rowLimit = 10) =>
    chamar<{ rows?: LinhaGsc[] }>(token, url, { startDate: p.ini, endDate: p.fim, dimensions, rowLimit, ...filtro }, "Search Console").then((r) => r.rows ?? []);
  const [tA, tB, dia, buscas, paginas] = await Promise.all([q(atual), q(anterior), q(atual, ["date"], 400), q(atual, ["query"]), q(atual, ["page"])]);
  const tot = (l?: LinhaGsc): TotaisGsc => ({ cliques: l?.clicks ?? 0, impressoes: l?.impressions ?? 0, ctr: l?.ctr ?? 0, posicao: l?.position ?? 0 });
  const item = (l: LinhaGsc) => ({ nome: l.keys?.[0] ?? "", cliques: l.clicks, impressoes: l.impressions, ctr: l.ctr, posicao: l.position });
  return {
    atual: tot(tA[0]), anterior: tot(tB[0]),
    porDia: dia.map((l) => ({ date: l.keys?.[0] ?? "", cliques: l.clicks, impressoes: l.impressions })),
    buscas: buscas.map(item), paginas: paginas.map(item),
  };
}
