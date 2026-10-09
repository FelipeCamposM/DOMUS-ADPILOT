"use client";

import { gsap } from "gsap";
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Grupo de opções com um "realce" que desliza com mola até a opção ativa (em linha, em grade ou quebrando linha).
 * Cada opção dentro dele marca data-opt="<valor>". O realce fica POR TRÁS das opções:
 * - "pilula" (chips e abas): é o próprio botão ativo, gradiente roxo com brilho, que desliza;
 * - "cartao" (grades de cartões): um cartão iluminado desliza sob os cartões translúcidos.
 * Na troca, a opção nova dá um "pulo" curto.
 */
export function Escolha({ valor, children, raio = 12, className, style, variante = "cartao" }: { valor: string | number; children: ReactNode; raio?: number; className?: string; style?: CSSProperties; variante?: "cartao" | "pilula" }) {
  const raiz = useRef<HTMLDivElement>(null);
  const realce = useRef<HTMLSpanElement>(null);
  const primeira = useRef(true);

  useLayoutEffect(() => {
    const el = raiz.current, r = realce.current;
    if (!el || !r) return;
    const posicionar = (animar: boolean) => {
      const alvo = el.querySelector<HTMLElement>(`[data-opt="${CSS.escape(String(valor))}"]`);
      if (!alvo) { r.style.opacity = "0"; return; }
      r.style.transition = animar ? "" : "none";
      Object.assign(r.style, { opacity: "1", width: `${alvo.offsetWidth}px`, height: `${alvo.offsetHeight}px`, transform: `translate(${alvo.offsetLeft}px, ${alvo.offsetTop}px)` });
      if (animar && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.fromTo(alvo, { scale: 0.94 }, { scale: 1, duration: 0.55, ease: "back.out(2.4)", clearProps: "transform" });
      }
    };
    posicionar(!primeira.current);
    primeira.current = false;
    const ro = new ResizeObserver(() => posicionar(false));
    ro.observe(el);
    return () => ro.disconnect();
  }, [valor]);

  return (
    <div ref={raiz} className={`${className ?? ""} escolha-${variante}`} style={{ position: "relative", ...style }}>
      {children}
      <span ref={realce} aria-hidden className={`escolha-realce escolha-realce-${variante}`} style={{ borderRadius: raio }} />
    </div>
  );
}

/** Seção que abre e fecha animando a altura (sem medir no JS) e o desfoque. */
export function Revelar({ aberto, children }: { aberto: boolean; children: ReactNode }) {
  return (
    <div className="revelar" data-aberto={aberto} aria-hidden={!aberto} inert={!aberto}>
      <div>{children}</div>
    </div>
  );
}
