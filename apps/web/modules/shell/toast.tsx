"use client";

import { gsap } from "gsap";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";

interface Toast { id: number; kind: "ok" | "err" | "load"; text: string }
let lista: Toast[] = [];
const ouvintes = new Set<() => void>();
const emitir = () => ouvintes.forEach((f) => f());
let seq = 0;

const sumir = (id: number, kind: Toast["kind"]) => setTimeout(() => { lista = lista.filter((t) => t.id !== id); emitir(); }, kind === "err" ? 7000 : 4000);

/**
 * Avisos curtos no canto da tela. `toast.ok("Campanha pausada")`, `toast.err(e.message)`.
 * Processo demorado: `const id = toast.carregando("Apagando…")` e depois `toast.fim(id, "ok", "3 apagados")`.
 */
export const toast = {
  ok: (text: string): void => { push("ok", text); },
  err: (text: string): void => { push("err", text); },
  carregando: (text: string) => push("load", text),
  fim: (id: number, kind: "ok" | "err", text: string) => {
    lista = lista.map((t) => (t.id === id ? { ...t, kind, text } : t));
    emitir();
    sumir(id, kind);
  },
};

function push(kind: Toast["kind"], text: string) {
  const id = ++seq;
  lista = [...lista, { id, kind, text }];
  emitir();
  if (kind !== "load") sumir(id, kind);
  return id;
}

export function Toaster() {
  const itens = useSyncExternalStore((f) => (ouvintes.add(f), () => ouvintes.delete(f)), () => lista, () => lista);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {itens.map((t) => <ToastItem key={t.id} t={t} />)}
    </div>
  );
}

function ToastItem({ t }: { t: Toast }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    gsap.fromTo(ref.current, { y: 24, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)" });
  }, []);
  return (
    <div ref={ref} className={`toast ${t.kind}`}>
      {t.kind === "ok" ? <CheckCircle2 size={17} aria-hidden /> : t.kind === "err" ? <AlertCircle size={17} aria-hidden /> : <Loader2 size={17} className="animate-spin" aria-hidden />}
      <span>{t.text}</span>
    </div>
  );
}
