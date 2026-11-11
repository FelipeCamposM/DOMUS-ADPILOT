"use client";

import { useEffect, useRef } from "react";

const CARACTERES = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF";
const FONTE = 15;

/**
 * Chuva de terminal por cima do hero das páginas: colunas em profundidades diferentes, cabeça branca com brilho e
 * rastro roxo longo. Canvas transparente, ~18 quadros/s, pausa fora da tela ou com a aba escondida; com "reduzir
 * movimento" não desenha.
 */
export function HeroFx() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    let w = 0, h = 0, raf = 0, ultimo = 0, visivel = true;
    let colunas: { y: number; v: number; a: number }[] = [];
    const nova = (y: number) => ({ y, v: 0.25 + Math.random() * 0.6, a: 0.25 + Math.random() * 0.75 });

    const medir = () => {
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      colunas = Array.from({ length: Math.ceil(w / FONTE) }, () => nova((Math.random() - 0.4) * (h / FONTE)));
    };
    const letra = () => CARACTERES[(Math.random() * CARACTERES.length) | 0];

    const quadro = (t: number) => {
      raf = requestAnimationFrame(quadro);
      if (!visivel || document.hidden || t - ultimo < 55) return;
      ultimo = t;
      // apaga devagar o que já está desenhado: vira o rastro longo
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.07)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.font = `600 ${FONTE}px ui-monospace, "Cascadia Code", monospace`;
      ctx.textAlign = "center";
      for (let i = 0; i < colunas.length; i++) {
        const c = colunas[i]!;
        const linha = Math.floor(c.y);
        const x = i * FONTE + FONTE / 2;
        const y = linha * FONTE;
        if (y > 0) {
          // rastro: ao descer uma linha, a de cima vira roxa
          if (linha !== Math.floor(c.y - c.v)) {
            ctx.shadowBlur = 0;
            ctx.clearRect(x - FONTE / 2, y - FONTE * 2 + 3, FONTE, FONTE);
            ctx.fillStyle = `rgba(180,140,255,${0.6 * c.a})`;
            ctx.fillText(letra(), x, y - FONTE);
          }
          // cabeça: branca com brilho (redesenhada todo quadro: não apaga enquanto anda devagar)
          ctx.clearRect(x - FONTE / 2, y - FONTE + 3, FONTE, FONTE);
          ctx.shadowColor = "rgba(236,214,255,0.9)";
          ctx.shadowBlur = 10 * c.a;
          ctx.fillStyle = `rgba(255,248,255,${c.a})`;
          ctx.fillText(letra(), x, y);
        }
        c.y += c.v;
        if (y > h + FONTE * 6 && Math.random() > 0.95) colunas[i] = nova(-Math.random() * 8);
      }
      ctx.shadowBlur = 0;
    };

    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => { visivel = !!e?.isIntersecting; });
    io.observe(cv);
    raf = requestAnimationFrame(quadro);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);

  return <canvas ref={ref} className="hero-fx" aria-hidden />;
}
