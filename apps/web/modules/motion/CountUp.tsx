"use client";

import { gsap } from "gsap";
import { useEffect, useRef } from "react";
import { compact, int, money, pct } from "@/lib/format";

export type CountFormat = "money" | "int" | "compact" | "pct" | "ratio";

const fmt = (kind: CountFormat, v: number, currency: string) =>
  kind === "money" ? money(v, currency) : kind === "int" ? int(v) : kind === "compact" ? compact(v) : kind === "pct" ? pct(v) : `${v.toFixed(2).replace(".", ",")}x`;

/** Número que conta até o valor. `value` null = sem dado ("—"). Com "reduzir movimento", mostra o valor direto. */
export function CountUp({ value, kind, currency = "BRL", duration = 1.3 }: { value: number | null; kind: CountFormat; currency?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const anterior = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value == null || !Number.isFinite(value)) {
      el.textContent = "—";
      return;
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = fmt(kind, value, currency);
      return;
    }
    const obj = { v: anterior.current };
    const tween = gsap.to(obj, { v: value, duration, ease: "expo.out", onUpdate: () => { el.textContent = fmt(kind, obj.v, currency); } });
    anterior.current = value;
    return () => { tween.kill(); };
  }, [value, kind, currency, duration]);

  return <span ref={ref}>{value == null ? "—" : fmt(kind, 0, currency)}</span>;
}
