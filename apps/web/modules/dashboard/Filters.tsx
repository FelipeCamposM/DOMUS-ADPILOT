"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface Props {
  contas: { id: string; name: string; provider: string }[];
  campanhas: { id: string; name: string; ad_account_id: string }[];
}

/** Filtros numa linha só (spec: provider, conta, campanha, período). Estado na URL: link compartilhável. */
export function Filters({ contas, campanhas }: Props) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pend, start] = useTransition();
  const set = (k: string, v: string) => {
    const q = new URLSearchParams(sp);
    if (v) q.set(k, v); else q.delete(k);
    if (k === "provider") { q.delete("account"); q.delete("campaign"); }
    if (k === "account") q.delete("campaign");
    start(() => router.replace(`${path}?${q}`, { scroll: false }));
  };
  const provider = sp.get("provider") ?? "";
  const account = sp.get("account") ?? "";
  const days = sp.get("days") ?? "30";
  const contasF = contas.filter((c) => !provider || c.provider === provider);
  const campsF = campanhas.filter((c) => (!account || c.ad_account_id === account) && contasF.some((a) => a.id === c.ad_account_id));

  return (
    <div className="cluster" style={{ gap: 8, opacity: pend ? 0.6 : 1, transition: "opacity 200ms" }} data-enter>
      <div className="cluster" role="radiogroup" aria-label="Período" style={{ gap: 4, padding: 3, borderRadius: 12, border: "1px solid rgb(var(--c-border))", background: "rgb(var(--c-bg-surface))" }}>
        {["7", "14", "30", "90"].map((d) => (
          <button key={d} role="radio" aria-checked={days === d} className="chip" data-active={days === d} onClick={() => set("days", d)} style={{ height: 28, border: 0 }}>
            {d} dias
          </button>
        ))}
      </div>
      <select className="select" aria-label="Plataforma" value={provider} onChange={(e) => set("provider", e.target.value)}>
        <option value="">Todas as plataformas</option>
        <option value="META">Meta Ads</option>
        <option value="GOOGLE">Google Ads</option>
      </select>
      <select className="select" aria-label="Conta" value={account} onChange={(e) => set("account", e.target.value)}>
        <option value="">Todas as contas</option>
        {contasF.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select className="select" aria-label="Campanha" value={sp.get("campaign") ?? ""} onChange={(e) => set("campaign", e.target.value)} style={{ maxWidth: 260 }}>
        <option value="">Todas as campanhas</option>
        {campsF.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}
