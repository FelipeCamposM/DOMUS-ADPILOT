"use client";

import { gsap } from "gsap";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";

interface Toast { id: number; kind: "ok" | "err"; text: string }
let lista: Toast[] = [];
const ouvintes = new Set<() => void>();
const emitir = () => ouvintes.forEach((f) => f());
let seq = 0;

/** Avisos curtos no canto da tela. `toast.ok("Campanha pausada")`, `toast.err(e.message)`. */
export const toast = {
  ok: (text: string) => push("ok", text),
  err: (text: string) => push("err", text),
};

function push(kind: Toast["kind"], text: string) {
  const id = ++seq;
  lista = [...lista, { id, kind, text }];
  emitir();
  setTimeout(() => { lista = lista.filter((t) => t.id !== id); emitir(); }, kind === "err" ? 7000 : 4000);
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
      {t.kind === "ok" ? <CheckCircle2 size={17} aria-hidden /> : <AlertCircle size={17} aria-hidden />}
      <span>{t.text}</span>
    </div>
  );
}
