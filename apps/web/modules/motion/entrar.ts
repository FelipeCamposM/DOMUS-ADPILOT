import { gsap } from "gsap";

export const reduzido = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Entrada (GSAP) que nunca fica pela metade: no fim limpa opacity/transform e, se o componente sair antes
 * (troca de rota, re-render), a limpeza pula para o fim. Uso: `useLayoutEffect(() => entrar(els, { y: 12 }), [])`.
 */
export function entrar(alvos: gsap.TweenTarget, de: gsap.TweenVars, para: gsap.TweenVars = {}): () => void {
  if (reduzido() || !alvos || (Array.isArray(alvos) && !alvos.length)) return () => {};
  const t = gsap.fromTo(alvos, { opacity: 0, ...de }, { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.55, ease: "expo.out", clearProps: "opacity,transform", ...para });
  return () => { t.progress(1).kill(); };
}
