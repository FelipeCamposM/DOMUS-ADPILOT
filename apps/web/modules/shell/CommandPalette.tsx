"use client";

import { gsap } from "gsap";
import { Bot, CornerDownLeft, Megaphone, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { NAV } from "./Sidebar";

interface Item { id: string; label: string; hint: string; icon: typeof Search; go: () => void }

/** Paleta de comandos (Ctrl/⌘ K): navegação, campanhas do workspace e atalhos. Setas + Enter. */
export function CommandPalette({ open, onClose, campanhas }: { open: boolean; onClose: () => void; campanhas: { id: string; name: string }[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);

  const itens = useMemo<Item[]>(() => {
    const ir = (href: string) => () => { router.push(href); onClose(); };
    const base: Item[] = [
      { id: "new-ai", label: "Nova conversa com a IA", hint: "Ação", icon: Bot, go: ir("/ai?nova=1") },
      ...NAV.map((n) => ({ id: n.href, label: n.label, hint: "Ir para", icon: n.icon, go: ir(n.href) })),
      ...campanhas.map((c) => ({ id: c.id, label: c.name, hint: "Campanha", icon: Megaphone, go: ir(`/campaigns?campaign=${c.id}`) })),
    ];
    const t = q.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    if (!t) return base.slice(0, 12);
    return base.filter((i) => i.label.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").includes(t)).slice(0, 30);
  }, [q, campanhas, router, onClose]);

  useEffect(() => setSel(0), [q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    gsap.fromTo(bgRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    gsap.fromTo(boxRef.current, { opacity: 0, y: -14, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.5)" });
  }, [open]);

  if (!open) return null;

  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, itens.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") itens[sel]?.go();
  };

  return (
    <div className="overlay" ref={bgRef} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" ref={boxRef} role="dialog" aria-label="Busca e comandos" onKeyDown={tecla}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid rgb(var(--c-border))" }}>
          <Search size={17} className="text-tertiary" aria-hidden />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar página, campanha ou ação…"
            aria-label="Buscar" style={{ flex: 1, background: "none", border: 0, outline: "none", color: "inherit", fontSize: 15 }} />
          <span className="kbd">Esc</span>
        </div>
        <div style={{ maxHeight: 380, overflowY: "auto", padding: 6 }} role="listbox">
          {itens.length === 0 && <div className="empty" style={{ padding: 28 }}>Nada encontrado para “{q}”.</div>}
          {itens.map((it, i) => {
            const Icon = it.icon;
            return (
              <button key={it.id} className="menu-item" data-active={i === sel} role="option" aria-selected={i === sel}
                onMouseEnter={() => setSel(i)} onClick={it.go}>
                <Icon aria-hidden />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
                <span className="subtle" style={{ fontSize: 11 }}>{it.hint}</span>
                {i === sel && <CornerDownLeft size={13} aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
