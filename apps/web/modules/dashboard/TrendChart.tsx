"use client";

import { gsap } from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { compact, int, money } from "@/lib/format";

interface Ponto { date: string; spend: string; clicks: string; conversions: string; revenue: string }
const METRICAS = [
  { key: "spend", label: "Investimento", fmt: (v: number) => money(v) },
  { key: "clicks", label: "Cliques", fmt: (v: number) => int(v) },
  { key: "conversions", label: "Resultados", fmt: (v: number) => int(v) },
  { key: "revenue", label: "Receita", fmt: (v: number) => money(v) },
] as const;
type Key = (typeof METRICAS)[number]["key"];

const W = 960, H = 260, PAD = { l: 56, r: 16, t: 16, b: 28 };
const diaCurto = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "");

/** Série diária de uma métrica por vez (um eixo só). Linha desenha com GSAP; crosshair + tooltip no hover. */
export function TrendChart({ data }: { data: Ponto[] }) {
  const [key, setKey] = useState<Key>("spend");
  const [hover, setHover] = useState<number | null>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const m = METRICAS.find((x) => x.key === key)!;

  const { pts, linha, area, ticks, max } = useMemo(() => {
    const vals = data.map((d) => Number(d[key]));
    const bruto = Math.max(...vals, 0);
    const passo = bruto > 0 ? 10 ** Math.floor(Math.log10(bruto)) : 1;
    const max = bruto > 0 ? Math.ceil((bruto * 1.1) / passo) * passo : 1;
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    const pts = vals.map((v, i) => ({ x: PAD.l + (data.length > 1 ? (i / (data.length - 1)) * iw : iw / 2), y: PAD.t + ih - (v / max) * ih, v }));
    // curva suave (Catmull-Rom → Bézier), sem ultrapassar muito os pontos
    const d = pts.map((p, i) => {
      if (i === 0) return `M${p.x},${p.y}`;
      const p0 = pts[i - 2] ?? pts[i - 1]!, p1 = pts[i - 1]!, p2 = p, p3 = pts[i + 1] ?? p;
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
      const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      return `C${c1.x},${Math.min(c1.y, PAD.t + ih)} ${c2.x},${Math.min(c2.y, PAD.t + ih)} ${p2.x},${p2.y}`;
    }).join(" ");
    const base = PAD.t + ih;
    return { pts, linha: d, area: pts.length ? `${d} L${pts.at(-1)!.x},${base} L${pts[0]!.x},${base} Z` : "", ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => f * max), max };
  }, [data, key]);

  useEffect(() => {
    const l = lineRef.current, a = areaRef.current;
    if (!l || !a || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const len = l.getTotalLength();
    gsap.fromTo(l, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.4, ease: "expo.inOut" });
    gsap.fromTo(a, { opacity: 0 }, { opacity: 1, duration: 1.2, delay: 0.35, ease: "power2.out" });
  }, [linha]);

  const mover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p.x - x) < Math.abs(pts[best]!.x - x)) best = i; });
    setHover(best);
  };

  const h = hover != null ? pts[hover] : null;
  const total = pts.reduce((s, p) => s + p.v, 0);
  const rotulos = data.length <= 14 ? data.map((_, i) => i) : [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor((3 * data.length) / 4), data.length - 1];

  return (
    <div className="panel spotlight" data-enter="scale">
      <div className="panel-head">
        <div>
          <div className="panel-title">{m.label} por dia</div>
          <div className="subtle caption tabular">Total no período: {m.fmt(total)}</div>
        </div>
        <div className="cluster" role="tablist" aria-label="Métrica do gráfico" style={{ gap: 6 }}>
          {METRICAS.map((x) => (
            <button key={x.key} role="tab" aria-selected={x.key === key} className="chip" data-active={x.key === key} onClick={() => setKey(x.key)} style={{ height: 28 }}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ position: "relative", padding: "8px 8px 4px" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${m.label} por dia`} onPointerMove={mover} onPointerLeave={() => setHover(null)} style={{ display: "block", touchAction: "none" }}>
          <defs>
            <linearGradient id="area-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "rgb(var(--c-brand))", stopOpacity: 0.38 }} />
              <stop offset="100%" style={{ stopColor: "rgb(var(--c-brand))", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {ticks.map((t) => {
            const y = PAD.t + (H - PAD.t - PAD.b) * (1 - t / max);
            return (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="rgb(var(--c-border))" strokeDasharray={t === 0 ? undefined : "2 4"} />
                <text x={PAD.l - 10} y={y + 4} textAnchor="end" fontSize="11" fill="rgb(var(--c-text-tertiary))">{key === "spend" || key === "revenue" ? `R$ ${compact(t)}` : compact(t)}</text>
              </g>
            );
          })}
          {rotulos.map((i) => pts[i] && (
            <text key={i} x={pts[i]!.x} y={H - 8} textAnchor="middle" fontSize="11" fill="rgb(var(--c-text-tertiary))">{diaCurto(data[i]!.date)}</text>
          ))}
          <path ref={areaRef} d={area} fill="url(#area-g)" />
          <path ref={lineRef} className="chart-line" d={linha} fill="none" stroke="rgb(var(--c-brand))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {h && (
            <g pointerEvents="none">
              <line x1={h.x} x2={h.x} y1={PAD.t} y2={H - PAD.b} stroke="rgb(var(--c-border-strong))" />
              <circle className="chart-dot" cx={h.x} cy={h.y} r="5" fill="rgb(var(--c-brand))" stroke="rgb(var(--c-bg-surface))" strokeWidth="2" />
            </g>
          )}
        </svg>
        {h && hover != null && (
          <div style={{
            position: "absolute", pointerEvents: "none", top: 12, left: `calc(${(h.x / W) * 100}% + ${h.x / W > 0.7 ? "-170px" : "14px"})`,
            background: "rgb(var(--c-bg-elevated))", border: "1px solid rgb(var(--c-border-strong))", borderRadius: 10, padding: "8px 12px", boxShadow: "var(--shadow-md)", minWidth: 150,
          }}>
            <div className="subtle caption">{new Date(`${data[hover]!.date}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" })}</div>
            <div className="tabular" style={{ fontWeight: 700, fontSize: 15 }}>{m.fmt(h.v)}</div>
          </div>
        )}
      </div>
      <details style={{ padding: "0 18px 12px" }}>
        <summary className="subtle caption" style={{ cursor: "pointer" }}>Ver como tabela</summary>
        <table className="data" style={{ marginTop: 8 }}>
          <thead><tr><th>Dia</th><th className="num">{m.label}</th></tr></thead>
          <tbody>{data.map((d, i) => <tr key={d.date}><td>{diaCurto(d.date)}</td><td className="num">{m.fmt(pts[i]!.v)}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}
