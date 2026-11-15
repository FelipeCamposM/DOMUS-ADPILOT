"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Seletor } from "../shell/Seletor";
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
      <Seletor ariaLabel="Plataforma" valor={provider} onChange={(x) => set("provider", x)}
        opcoes={[{ valor: "", rotulo: "Todas as plataformas" }, { valor: "META", rotulo: "Meta Ads" }, { valor: "GOOGLE", rotulo: "Google Ads" }]} />
      <Seletor ariaLabel="Conta" valor={account} onChange={(x) => set("account", x)}
        opcoes={[{ valor: "", rotulo: "Todas as contas" }, ...contasF.map((c) => ({ valor: c.id, rotulo: c.name }))]} />
      <Seletor ariaLabel="Campanha" valor={sp.get("campaign") ?? ""} onChange={(x) => set("campaign", x)} style={{ maxWidth: 260 }}
        opcoes={[{ valor: "", rotulo: "Todas as campanhas" }, ...campsF.map((c) => ({ valor: c.id, rotulo: c.name }))]} />
    </div>
  );
}
