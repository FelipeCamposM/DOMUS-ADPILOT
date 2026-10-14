"use client";

import { Loader2, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Busca que filtra a página pelo servidor (?q=), enquanto digita. Mantém os outros parâmetros (ex.: ?aba=). */
export function Busca({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pend, start] = useTransition();
  const primeira = useRef(true);

  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    const t = setTimeout(() => {
      const p = new URLSearchParams(params.toString());
      if (q.trim()) p.set("q", q.trim()); else p.delete("q");
      start(() => router.replace(`${path}${p.size ? `?${p}` : ""}`, { scroll: false }));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div data-enter style={{ position: "relative", width: "min(100%, 360px)" }}>
      {pend ? <Loader2 size={15} className="animate-spin" aria-hidden style={{ position: "absolute", left: 12, top: 12, color: "rgb(var(--c-text-tertiary))" }} />
        : <Search size={15} aria-hidden style={{ position: "absolute", left: 12, top: 12, color: "rgb(var(--c-text-tertiary))" }} />}
      <input type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={100}
        style={{ paddingLeft: 36, paddingRight: q ? 34 : undefined }} onKeyDown={(e) => e.key === "Escape" && setQ("")} />
      {q && <button type="button" className="btn btn-ghost btn-xs" aria-label="Limpar busca" onClick={() => setQ("")} style={{ position: "absolute", right: 4, top: 6 }}><X aria-hidden /></button>}
    </div>
  );
}
