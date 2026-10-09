"use client";

import { gsap } from "gsap";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Movimento da plataforma, declarativo por atributo (as páginas continuam Server Components):
 * - [data-enter]           entra em cascata a cada navegação (sobe + desfoca → nítido)
 * - [data-enter="scale"]   entra crescendo de leve (cartões de destaque)
 * - .spotlight             luz que segue o mouse (--mx/--my), herdado do SIAPLUS
 * "Reduzir movimento" do sistema: nada anima, tudo aparece (tira html.anim).
 */
export function Motion() {
  const path = usePathname();

  useEffect(() => {
    const raiz = document.documentElement;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      raiz.classList.remove("anim");
      return;
    }
    raiz.classList.add("motion");
    const ctx = gsap.context(() => {
      const els = gsap.utils.toArray<HTMLElement>("[data-enter]");
      const normais = els.filter((e) => e.dataset.enter !== "scale");
      const escala = els.filter((e) => e.dataset.enter === "scale");
      gsap.fromTo(normais, { opacity: 0, y: 14, filter: "blur(6px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "expo.out", stagger: 0.045, clearProps: "filter,transform" });
      gsap.fromTo(escala, { opacity: 0, scale: 0.97, y: 8 },
        { opacity: 1, scale: 1, y: 0, duration: 0.8, ease: "expo.out", stagger: 0.06, delay: 0.05, clearProps: "transform" });
    });
    return () => ctx.revert();
  }, [path]);

  useEffect(() => {
    if (!matchMedia("(pointer: fine)").matches) return;
    const mover = (e: PointerEvent) => {
      const card = (e.target as Element).closest<HTMLElement>(".spotlight");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", mover, { passive: true });
    return () => document.removeEventListener("pointermove", mover);
  }, []);

  return null;
}
