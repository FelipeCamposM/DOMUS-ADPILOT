"use client";

import { CountUp } from "../motion/CountUp";

/**
 * Prévia viva do que vai ser gerado: o quadro muda de proporção com mola quando o formato muda, e as camadas
 * atrás mostram quantas peças saem (variações ou slides do carrossel). Os números contam até o valor novo.
 */
export function Palco({ w, h, numero, unidade, legenda, camadas = 0, leque = false }: {
  w: number; h: number; numero: number; unidade: string; legenda: string; camadas?: number; leque?: boolean;
}) {
  const k = Math.min(132 / w, 132 / h);
  const n = Math.min(4, Math.max(0, camadas));
  return (
    <div className="palco" aria-label={`Prévia: ${legenda}`}>
      <div className="palco-brilho" aria-hidden />
      <div className="palco-quadro" style={{ width: w * k, height: h * k }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} aria-hidden className="palco-camada"
            style={{ opacity: i < n ? 1 - i * 0.18 : 0, transform: i < n ? (leque ? `translate(${(i + 1) * 14}px, ${(i + 1) * 3}px) rotate(${(i + 1) * 4}deg)` : `translate(${(i + 1) * 6}px, ${-(i + 1) * 6}px)`) : "none" }} />
        ))}
        <div style={{ display: "grid", gap: 2 }}>
          <b className="tabular" style={{ fontSize: 26, lineHeight: 1, color: "#fff", textShadow: "0 0 18px rgb(var(--c-brand))" }}><CountUp value={numero} kind="int" duration={0.6} /><span style={{ fontSize: 13, marginLeft: 2 }}>{unidade}</span></b>
          <span className="subtle" style={{ fontSize: 10.5 }}>{legenda}</span>
        </div>
      </div>
    </div>
  );
}
