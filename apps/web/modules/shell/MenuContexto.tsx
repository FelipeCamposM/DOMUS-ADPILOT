"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ItemMenu =
  | { rotulo: string; icone?: ReactNode; onClick: () => void; perigo?: boolean; desativado?: boolean }
  | { secao: string }
  | "sep";
export interface Menu { x: number; y: number; itens: ItemMenu[] }

/** Menu do botão direito: abre no ponto do clique, cabe na tela, fecha com Esc, clique fora ou rolagem. ↑ ↓ Enter. */
export function MenuContexto({ menu, onClose }: { menu: Menu | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!menu || !el) return;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(menu.x, innerWidth - r.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(menu.y, innerHeight - r.height - 8))}px`;
    el.querySelector<HTMLElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const fora = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    const rolou = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("pointerdown", fora, true);
    addEventListener("keydown", tecla);
    addEventListener("scroll", rolou, true);
    addEventListener("resize", onClose);
    addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", fora, true);
      removeEventListener("keydown", tecla); removeEventListener("scroll", rolou, true); removeEventListener("resize", onClose); removeEventListener("blur", onClose);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  const setas = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const bs = [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
    const i = bs.indexOf(document.activeElement as HTMLElement);
    bs[(i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length]?.focus();
  };
  return createPortal(
    <div ref={ref} role="menu" className="menu-ctx" data-flutuante style={{ left: menu.x, top: menu.y }} onKeyDown={setas} onContextMenu={(e) => e.preventDefault()}>
      {menu.itens.map((it, i) => it === "sep" ? <hr key={i} /> : "secao" in it ? <div key={i} className="menu-ctx-secao">{it.secao}</div> : (
        <button key={i} type="button" role="menuitem" data-perigo={it.perigo || undefined} disabled={it.desativado} onClick={() => { onClose(); it.onClick(); }}>
          {it.icone}<span>{it.rotulo}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
