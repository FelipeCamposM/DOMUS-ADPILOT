"use client";

import { gsap } from "gsap";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface OpcaoSeletor { valor: string; rotulo: string; dica?: string }

/**
 * Select da plataforma no lugar do <select> nativo: lista flutuante com entrada e saída animadas (GSAP).
 * Vai para o <body> em position: fixed, então não é cortado por menus/modais com overflow. Teclado: ↑ ↓ Enter Esc.
 */
export function Seletor({ valor, opcoes, onChange, ariaLabel, icone, disabled, className = "" }: {
  valor: string; opcoes: readonly OpcaoSeletor[]; onChange: (v: string) => void; ariaLabel: string;
  icone?: ReactNode; disabled?: boolean; className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [montado, setMontado] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, cima: false });
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const atual = opcoes.find((o) => o.valor === valor) ?? opcoes[0];

  const abrir = () => {
    const r = gatilho.current!.getBoundingClientRect();
    const alto = Math.min(opcoes.length * 38 + 12, 320);
    const cima = r.bottom + alto + 8 > innerHeight && r.top > alto + 8;
    setPos({ top: cima ? r.top - alto - 6 : r.bottom + 6, left: r.left, width: Math.max(r.width, 180), cima });
    setAberto(true);
    setMontado(true);
  };

  // entrada: mola curta a partir do gatilho; foco na opção atual
  useLayoutEffect(() => {
    if (!aberto || !lista.current) return;
    gsap.fromTo(lista.current, { opacity: 0, y: pos.cima ? 6 : -6, scale: 0.96, transformOrigin: pos.cima ? "bottom center" : "top center" },
      { opacity: 1, y: 0, scale: 1, duration: 0.26, ease: "back.out(1.7)" });
    gsap.fromTo(lista.current.children, { opacity: 0, y: pos.cima ? 4 : -4 }, { opacity: 1, y: 0, duration: 0.2, stagger: 0.02, delay: 0.04, ease: "power2.out" });
    lista.current.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
  }, [aberto, pos.cima]);

  // saída: anima e só então desmonta
  const fechar = (focarGatilho = true) => {
    setAberto(false);
    if (focarGatilho) gatilho.current?.focus();
    if (!lista.current) return setMontado(false);
    gsap.to(lista.current, { opacity: 0, y: pos.cima ? 4 : -4, scale: 0.97, duration: 0.14, ease: "power2.in", onComplete: () => setMontado(false) });
  };

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!lista.current?.contains(t) && !gatilho.current?.contains(t)) fechar(false);
    };
    const rolou = (e: Event) => { if (!lista.current?.contains(e.target as Node)) fechar(false); };
    document.addEventListener("pointerdown", fora);
    addEventListener("scroll", rolou, true);
    addEventListener("resize", rolou);
    return () => { document.removeEventListener("pointerdown", fora); removeEventListener("scroll", rolou, true); removeEventListener("resize", rolou); };
  });

  const escolher = (v: string) => { if (v !== valor) onChange(v); fechar(); };

  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    const itens = [...(lista.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])];
    const i = itens.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      itens[(i + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length]?.focus();
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation(); // Esc fecha só a lista, não o menu em volta
      fechar();
    }
  };

  return (
    <>
      <button ref={gatilho} type="button" className={`seletor ${className}`} disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={aberto}
        data-aberto={aberto} onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={(e) => { if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !aberto) { e.preventDefault(); abrir(); } }}>
        {icone}
        <span className="seletor-valor">{atual?.rotulo}</span>
        <ChevronDown size={14} aria-hidden className="seletor-seta" />
      </button>
      {montado && createPortal(
        <div ref={lista} data-flutuante role="listbox" aria-label={ariaLabel} className="seletor-lista" onKeyDown={teclas}
          style={{ top: pos.top, left: Math.min(pos.left, innerWidth - pos.width - 8), minWidth: pos.width }}>
          {opcoes.map((o) => (
            <button key={o.valor} type="button" role="option" aria-selected={o.valor === valor} className="seletor-opcao" onClick={() => escolher(o.valor)}>
              <span style={{ flex: 1, minWidth: 0 }}>{o.rotulo}{o.dica && <small>{o.dica}</small>}</span>
              {o.valor === valor && <Check size={14} aria-hidden />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
