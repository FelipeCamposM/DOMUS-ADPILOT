/** Formatação pt-BR (Intl). Valores chegam como string decimal do banco; Number só para exibir/derivar razões. */
const n = (v: string | number | null | undefined) => (v == null ? 0 : Number(v));

export const money = (v: string | number | null | undefined, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 2 }).format(n(v));

export const int = (v: string | number | null | undefined) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n(v));

export const compact = (v: string | number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n(v));

export const pct = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(2).replace(".", ",")}%`);

export const dateTime = (d: Date | string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(d));

export function ago(d: Date | string | null): string {
  if (!d) return "nunca";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000); // negativo = futuro ("em 3 horas")
  const a = Math.abs(s);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (a < 60) return rtf.format(-s, "second");
  if (a < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

/** Métricas derivadas da spec: CTR, CPC, CPM, CPA (gasto/conversões), CPL (gasto/leads), ROAS (receita/gasto). */
export function derive(t: { spend: string; impressions: string; clicks: string; leads: string; conversions: string; revenue: string }) {
  const spend = n(t.spend), imp = n(t.impressions), clk = n(t.clicks), leads = n(t.leads), conv = n(t.conversions), rev = n(t.revenue);
  return {
    spend, impressions: imp, clicks: clk, leads, conversions: conv, revenue: rev,
    ctr: div(clk, imp), cpc: div(spend, clk), cpm: imp > 0 ? (spend / imp) * 1000 : null,
    cpa: div(spend, conv), cpl: div(spend, leads), roas: div(rev, spend),
  };
}

export const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativa", PAUSED: "Pausada", ARCHIVED: "Arquivada", DRAFT: "Rascunho", ERROR: "Com erro",
};
