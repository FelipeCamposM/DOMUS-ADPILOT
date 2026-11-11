"use client";

import { brl, nomeMes } from "@domus-ads/core/financeiro";
import { gsap } from "gsap";
import { useLayoutEffect, useRef, useState } from "react";
import { reduzido } from "../motion/entrar";

/** Gráficos do Financeiro: SVG puro animado com GSAP (desenha ao entrar, reage ao mouse). Valores em centavos. */

export const RENDA = "#34d399";
export const GASTO = "#c385ff";

/** Rosca: cada fatia "se desenha" em sequência; passar o mouse destaca a fatia e mostra no centro. */
export function Rosca({ fatias, total, rotulo }: { fatias: { nome: string; valor: number; cor: string }[]; total: number; rotulo: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [foco, setFoco] = useState<number | null>(null);
  const R = 70, C = 2 * Math.PI * R;
  const soma = fatias.reduce((a, f) => a + f.valor, 0) || 1;
  let acc = 0;
  const arcos = fatias.map((f) => {
    const len = (f.valor / soma) * C;
    const a = { ...f, len, off: acc };
    acc += len;
    return a;
  });

  useLayoutEffect(() => {
    if (!ref.current || reduzido()) return;
    const els = ref.current.querySelectorAll<SVGCircleElement>(".fin-arco");
    const t = gsap.fromTo(els, { strokeDasharray: `0 ${C}` }, {
      strokeDasharray: (_i: number, el: SVGCircleElement) => `${Math.max(0, Number(el.dataset.len) - 2)} ${C}`,
      duration: 0.9, ease: "expo.out", stagger: 0.07,
    });
    return () => { t.progress(1).kill(); };
  }, [fatias, C]);

  const f = foco != null ? arcos[foco] : null;
  return (
    <div className="fin-rosca">
      <svg ref={ref} viewBox="0 0 200 200" role="img" aria-label={`${rotulo}: ${brl(total)}`}>
        <circle cx="100" cy="100" r={R} className="fin-rosca-trilho" />
        {arcos.map((a, i) => (
          <circle key={a.nome} className="fin-arco" data-len={a.len} cx="100" cy="100" r={R} stroke={a.cor}
            strokeDasharray={`${Math.max(0, a.len - 2)} ${C}`} strokeDashoffset={-a.off}
            data-foco={foco === i ? "sim" : foco != null ? "nao" : undefined}
            onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} />
        ))}
      </svg>
      <div className="fin-rosca-centro" aria-hidden>
        <small>{f ? f.nome : rotulo}</small>
        <b className="tabular">{brl(f ? f.valor : total)}</b>
        {f && <span>{Math.round((f.valor / soma) * 100)}%</span>}
      </div>
    </div>
  );
}

/** 12 meses: barra de renda e de gasto por mês (crescem em cascata) e a linha do saldo desenhada por cima. */
export function Barras({ serie, mesAtual, onMes }: { serie: { mes: string; renda: number; gastos: number; saldo: number }[]; mesAtual: string; onMes?: (mes: string) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [dica, setDica] = useState<number | null>(null);
  const [medido, setW] = useState<number | null>(null);
  const W = medido ?? 720;
  const H = 240, P = 26;
  // largura real (texto e pontos não esticam com viewBox)
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    setW(el.clientWidth || 720); // antes de pintar: a animação já nasce na largura certa
    const ro = new ResizeObserver(([e]) => { const w = Math.round(e!.contentRect.width); if (w > 0) setW(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = Math.max(1, ...serie.flatMap((s) => [s.renda, s.gastos]));
  const larg = (W - P * 2) / serie.length;
  const y = (v: number) => H - P - (Math.max(0, v) / max) * (H - P * 2);
  const ys = (v: number) => H - P - ((v + max) / (2 * max)) * (H - P * 2); // saldo pode ser negativo: eixo próprio centrado
  const linha = serie.map((s, i) => `${i ? "L" : "M"}${P + larg * i + larg / 2},${ys(s.saldo)}`).join(" ");

  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg || medido == null || reduzido()) return;
    const tl = gsap.timeline();
    // atributos (não transform): transform em <rect> desloca a barra
    tl.from(svg.querySelectorAll(".fin-barra"), { attr: { y: H - P, height: 0 }, duration: 0.7, ease: "expo.out", stagger: 0.025 });
    const p = svg.querySelector<SVGPathElement>(".fin-saldo");
    if (p) { const L = p.getTotalLength(); tl.fromTo(p, { strokeDasharray: L, strokeDashoffset: L }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" }, 0.25); }
    tl.from(svg.querySelectorAll(".fin-saldo-pt"), { attr: { r: 0 }, duration: 0.35, stagger: 0.04, ease: "back.out(3)" }, 0.6);
    return () => { tl.progress(1).kill(); };
  }, [serie, medido == null]);

  const d = dica != null ? serie[dica] : null;
  return (
    <div className="fin-barras" ref={caixa}>
      <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Renda e gastos dos últimos 12 meses">
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} className="fin-eixo" />
        {serie.map((s, i) => {
          const x = P + larg * i;
          const bw = Math.min(22, larg / 3.2);
          return (
            <g key={s.mes} className="fin-col" data-atual={s.mes === mesAtual || undefined} onMouseEnter={() => setDica(i)} onMouseLeave={() => setDica(null)}
              onClick={() => onMes?.(s.mes)} style={{ cursor: onMes ? "pointer" : undefined }}>
              <rect x={x} y={P / 2} width={larg} height={H - P} className="fin-col-fundo" />
              <rect className="fin-barra" x={x + larg / 2 - bw - 2} y={y(s.renda)} width={bw} height={H - P - y(s.renda)} rx={4} fill={RENDA} />
              <rect className="fin-barra" x={x + larg / 2 + 2} y={y(s.gastos)} width={bw} height={H - P - y(s.gastos)} rx={4} fill="url(#fin-grad-gasto)" />
              <text x={x + larg / 2} y={H - 8} className="fin-rot">{nomeMes(s.mes).slice(0, 3)}</text>
            </g>
          );
        })}
        <path d={linha} className="fin-saldo" />
        {serie.map((s, i) => <circle key={s.mes} className="fin-saldo-pt" cx={P + larg * i + larg / 2} cy={ys(s.saldo)} r={3.2} data-neg={s.saldo < 0 || undefined} />)}
        <defs>
          <linearGradient id="fin-grad-gasto" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e9d5ff" /><stop offset="1" stopColor="#9640ff" /></linearGradient>
        </defs>
      </svg>
      {d && (
        <div className="fin-dica" style={{ left: `${((dica! + 0.5) / serie.length) * 100}%` }}>
          <b>{nomeMes(d.mes)} {d.mes.slice(0, 4)}</b>
          <span><i style={{ background: RENDA }} />Renda {brl(d.renda)}</span>
          <span><i style={{ background: GASTO }} />Gastos {brl(d.gastos)}</span>
          <span className={d.saldo < 0 ? "neg" : "pos"}>Saldo {brl(d.saldo)}</span>
        </div>
      )}
    </div>
  );
}

/** Calendário de calor do mês: cada dia acende conforme o gasto (cascata diagonal ao entrar). */
export function Calor({ porDia, mes }: { porDia: number[]; mes: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...porDia);
  const inicio = new Date(`${mes}T12:00:00Z`).getUTCDay(); // 0 = domingo
  useLayoutEffect(() => {
    if (!ref.current || reduzido()) return;
    const t = gsap.fromTo(ref.current.querySelectorAll(".fin-dia"), { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)", stagger: { each: 0.012, grid: "auto", from: "start" }, clearProps: "transform,opacity" });
    return () => { t.progress(1).kill(); };
  }, [porDia]);
  return (
    <div className="fin-calor" ref={ref}>
      {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <span key={i} className="fin-calor-sem">{d}</span>)}
      {Array.from({ length: inicio }, (_, i) => <span key={`v${i}`} />)}
      {porDia.map((v, i) => {
        const k = Math.sqrt(v / max); // raiz: dias médios também aparecem (o aluguel não apaga o resto)
        return (
          <span key={i} className="fin-dia" title={`Dia ${i + 1}: ${brl(v)}`} data-zero={v === 0 || undefined}
            style={{ background: v ? `rgba(180, 108, 255, ${0.12 + k * 0.88})` : undefined, boxShadow: k > 0.6 ? `0 0 ${Math.round(k * 18)}px rgba(195,133,255,.55)` : undefined }}>
            {i + 1}
          </span>
        );
      })}
    </div>
  );
}

/** Medidor semicircular (limite do cartão, orçamento): o ponteiro sobe com mola. */
export function Medidor({ fracao, rotulo, sub }: { fracao: number; rotulo: string; sub?: string }) {
  const ref = useRef<SVGPathElement>(null);
  const f = Math.max(0, Math.min(1, fracao));
  const L = Math.PI * 50;
  const cor = f > 0.9 ? "#f87171" : f > 0.7 ? "#fbbf24" : "#c385ff";
  useLayoutEffect(() => {
    if (!ref.current || reduzido()) return;
    const t = gsap.fromTo(ref.current, { strokeDashoffset: L }, { strokeDashoffset: L * (1 - f), duration: 1.2, ease: "elastic.out(1, 0.75)" });
    return () => { t.progress(1).kill(); };
  }, [f, L]);
  return (
    <div className="fin-medidor">
      <svg viewBox="0 0 120 68" aria-hidden>
        <path d="M10 60 A50 50 0 0 1 110 60" className="fin-medidor-trilho" />
        <path ref={ref} d="M10 60 A50 50 0 0 1 110 60" className="fin-medidor-arco" stroke={cor} strokeDasharray={L} strokeDashoffset={L * (1 - f)} />
      </svg>
      <b className="tabular">{Math.round(fracao * 100)}%</b>
      <small>{rotulo}</small>
      {sub && <span>{sub}</span>}
    </div>
  );
}

/** Barra horizontal que enche (categorias, orçamento, parcelas). */
export function Enche({ fracao, cor, alerta }: { fracao: number; cor?: string; alerta?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const f = Math.max(0, Math.min(1, fracao));
  useLayoutEffect(() => {
    if (!ref.current || reduzido()) return;
    const t = gsap.fromTo(ref.current, { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: "expo.out", delay: 0.1 });
    return () => { t.progress(1).kill(); };
  }, [f]);
  return (
    <span className="fin-enche" data-alerta={alerta || undefined}>
      <span ref={ref} style={{ width: `${f * 100}%`, background: cor ?? undefined }} />
    </span>
  );
}

/** Linha suave (hero): área com gradiente, desenhada da esquerda para a direita. */
export function Onda({ valores, cor = "#ffffff" }: { valores: number[]; cor?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const W = 300, H = 80;
  const max = Math.max(1, ...valores), min = Math.min(0, ...valores);
  const pts = valores.map((v, i) => [(i / Math.max(1, valores.length - 1)) * W, H - 6 - ((v - min) / (max - min || 1)) * (H - 14)] as const);
  // curva suave (Catmull-Rom → Bézier)
  const d = pts.map(([x, y], i) => {
    if (!i) return `M${x},${y}`;
    const [x0, y0] = pts[i - 2] ?? pts[i - 1]!, [x1, y1] = pts[i - 1]!, [x3, y3] = pts[i + 1] ?? [x, y];
    return `C${x1 + (x - x0) / 6},${y1 + (y - y0) / 6} ${x - (x3 - x1) / 6},${y - (y3 - y1) / 6} ${x},${y}`;
  }).join(" ");
  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg || reduzido()) return;
    const p = svg.querySelector<SVGPathElement>(".fin-onda-linha")!;
    const L = p.getTotalLength();
    const tl = gsap.timeline();
    tl.fromTo(p, { strokeDasharray: L, strokeDashoffset: L }, { strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut" })
      .fromTo(svg.querySelector(".fin-onda-area"), { opacity: 0 }, { opacity: 1, duration: 0.8 }, 0.6);
    return () => { tl.progress(1).kill(); };
  }, [valores]);
  return (
    <svg ref={ref} className="fin-onda" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id="fin-onda-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={cor} stopOpacity=".35" /><stop offset="1" stopColor={cor} stopOpacity="0" /></linearGradient></defs>
      <path className="fin-onda-area" d={`${d} L${W},${H} L0,${H} Z`} fill="url(#fin-onda-g)" />
      <path className="fin-onda-linha" d={d} stroke={cor} />
    </svg>
  );
}
