"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const PARADO_MS = 5 * 60_000;

/**
 * Atualiza a tela sozinha sem gastar CPU à toa: a cada `ms` pergunta ao /api/pulso se algo mudou (consulta pequena) e só
 * então recarrega a página. Não pergunta com a aba escondida nem quando ninguém mexe há 5 min (aba esquecida aberta);
 * ao voltar, confere na hora.
 */
export function usePulso(escopo: "mensagens" | "shell" | "calendario" | "studio" | "prospeccao" | "financeiro", ms: number, ativo = true) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    let ultimo: string | null = null;
    let mexeu = Date.now();
    let indo = false;
    const tick = async () => {
      if (indo || document.visibilityState !== "visible" || Date.now() - mexeu > PARADO_MS) return;
      indo = true;
      try {
        const r = await fetch(`/api/pulso?e=${escopo}`, { cache: "no-store" });
        if (r.ok) {
          const { v } = (await r.json()) as { v: string };
          if (ultimo !== null && v !== ultimo) router.refresh();
          ultimo = v;
        }
      } catch { /* sem rede: tenta no próximo */ } finally { indo = false; }
    };
    const marca = () => {
      const voltou = Date.now() - mexeu > PARADO_MS;
      mexeu = Date.now();
      if (voltou) void tick();
    };
    const visivel = () => { if (document.visibilityState === "visible") { mexeu = Date.now(); void tick(); } };
    const evs = ["pointermove", "pointerdown", "keydown", "scroll", "focus"] as const;
    evs.forEach((e) => window.addEventListener(e, marca, { passive: true }));
    document.addEventListener("visibilitychange", visivel);
    void tick();
    const t = setInterval(tick, ms);
    return () => {
      clearInterval(t);
      evs.forEach((e) => window.removeEventListener(e, marca));
      document.removeEventListener("visibilitychange", visivel);
    };
  }, [escopo, ms, ativo, router]);
}
