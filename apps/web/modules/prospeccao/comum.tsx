import type { Lead, WebsiteStatus } from "@domus-ads/core/prospeccao";

/** Situação do site: rótulo, tom do selo e cor do pino/faixa (mesmas cores do CAMPS-UTILS). */
export const STATUS: Record<WebsiteStatus, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "accent"; color: string }> = {
  unknown: { label: "Não auditado", tone: "neutral", color: "#64748b" },
  no_site: { label: "Sem site", tone: "danger", color: "#f87171" },
  social_only: { label: "Só redes", tone: "accent", color: "#c084fc" },
  broken: { label: "Site quebrado", tone: "danger", color: "#ef4444" },
  weak: { label: "Site fraco", tone: "warning", color: "#fbbf24" },
  healthy: { label: "Site saudável", tone: "success", color: "#4ade80" },
};

export function Selo({ tone = "neutral", children, title }: { tone?: (typeof STATUS)[WebsiteStatus]["tone"]; children: React.ReactNode; title?: string }) {
  return <span className="pp-selo" data-tone={tone} title={title}>{children}</span>;
}

export function normalizeExternalUrl(raw: string): string | undefined {
  const candidate = raw.trim();
  if (!candidate) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    if (url.hostname.endsWith("google.com") && url.pathname === "/url") {
      const target = url.searchParams.get("q") || url.searchParams.get("url");
      return target ? normalizeExternalUrl(target) : undefined;
    }
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

export function mapsUrl(lead: Lead): string {
  const source = lead.sourceUrls.find((url) => /google\.[^/]+\/maps|maps\.google/i.test(url));
  if (source) return source;
  const query = Number.isFinite(lead.latitude) && Number.isFinite(lead.longitude) ? `${lead.latitude},${lead.longitude}` : [lead.name, lead.address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Anel do score: verde a partir de 60, âmbar a partir de 35. */
export function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const cor = score >= 60 ? "var(--c-success)" : score >= 35 ? "var(--c-warning)" : "var(--c-text-tertiary)";
  return (
    <span className="pp-anel" style={{ width: size, height: size, background: `conic-gradient(rgb(${cor}) ${score * 3.6}deg, rgb(255 255 255 / 0.07) 0deg)`, boxShadow: score >= 60 ? `0 0 16px -4px rgb(${cor} / 0.7)` : undefined }} aria-label={`Score ${score}`}>
      <span className="pp-anel-miolo" />
      <span className="pp-anel-n" style={{ fontSize: size >= 50 ? 14 : size <= 34 ? 10.5 : 12 }}>{score}</span>
    </span>
  );
}

export const copiar = (texto: string) => navigator.clipboard.writeText(texto);
