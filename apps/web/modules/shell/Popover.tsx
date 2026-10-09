"use client";

import { gsap } from "gsap";
import { useEffect, useRef, type ReactNode } from "react";

/** Menu flutuante com entrada em mola (GSAP). Fecha com Esc ou clique fora. */
export function Popover({ open, onClose, children, align = "left", width, className = "" }: {
  open: boolean; onClose: () => void; children: ReactNode; align?: "left" | "right"; width?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    gsap.fromTo(ref.current, { opacity: 0, y: -6, scale: 0.97, transformOrigin: align === "right" ? "top right" : "top left" },
      { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "back.out(1.6)" });
    const fora = (e: PointerEvent) => { if (!ref.current?.parentElement?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", esc); };
  }, [open, onClose, align]);

  if (!open) return null;
  return (
    <div ref={ref} className={`menu ${className}`} role="menu" style={{ top: "calc(100% + 8px)", [align]: 0, width }}>
      {children}
    </div>
  );
}
