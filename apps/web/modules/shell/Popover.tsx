"use client";

import { gsap } from "gsap";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

const celular = () => window.matchMedia("(max-width: 900px)").matches;

/** Menu flutuante com entrada em mola (GSAP). Fecha com Esc ou clique fora. No celular vira sheet de baixo, com fundo escuro. */
export function Popover({ open, onClose, children, align = "left", width, className = "", style }: {
  open: boolean; onClose: () => void; children: ReactNode; align?: "left" | "right"; width?: number; className?: string; style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fechar = useRef(onClose);
  fechar.current = onClose;

  useEffect(() => {
    if (!open) return;
    if (celular()) gsap.fromTo(ref.current, { yPercent: 100 }, { yPercent: 0, duration: 0.45, ease: "expo.out", clearProps: "transform" });
    else gsap.fromTo(ref.current, { opacity: 0, y: -6, scale: 0.97, transformOrigin: align === "right" ? "top right" : "top left" },
      { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "back.out(1.6)" });
    // [data-flutuante]: listas que vão para o <body> (Seletor) contam como dentro do menu
    const fora = (e: PointerEvent) => { if (!ref.current?.parentElement?.contains(e.target as Node) && !(e.target as Element).closest?.("[data-flutuante]")) fechar.current(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") fechar.current(); };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", esc); };
  }, [open, align]);

  if (!open) return null;
  // open começa false: só renderiza no cliente, sem risco de hidratação
  if (celular()) return createPortal(
    <div className="overlay pop-fundo" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`menu menu-folha ${className}`} role="menu">{children}</div>
    </div>,
    document.body,
  );
  return (
    <div ref={ref} className={`menu ${className}`} role="menu" style={{ top: "calc(100% + 8px)", [align]: 0, width, ...style }}>
      {children}
    </div>
  );
}
