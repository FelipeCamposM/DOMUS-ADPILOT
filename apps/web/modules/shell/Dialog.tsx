"use client";

import { gsap } from "gsap";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** Modal com entrada em mola. Esc e clique no fundo fecham. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const bg = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    gsap.fromTo(bg.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    gsap.fromTo(box.current, { opacity: 0, y: 18, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.4)" });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" ref={bg} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" ref={box} role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-head">
          <span className="panel-title">{title}</span>
          <button className="btn btn-ghost btn-xs" onClick={onClose} aria-label="Fechar"><X aria-hidden /></button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
