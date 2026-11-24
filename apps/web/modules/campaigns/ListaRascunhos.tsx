"use client";

import { Loader2, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ago } from "@/lib/format";
import { GoogleAdsLogo } from "../connections/Logos";
import { confirmar } from "../shell/confirmar";
import { toast } from "../shell/toast";
import { apagarRascunho } from "./rascunhos";

export interface RascunhoCard { id: string; name: string; status: string; source: string; updated_at: string }
const ROTULO: Record<string, string> = { GENERATING: "IA escrevendo…", DRAFT: "Rascunho", FAILED: "Com erro", PUBLISHING: "Publicando…" };

/** Propostas da IA e campanhas em montagem (nada disso está no Google ainda). */
export function Rascunhos({ itens, podeEditar }: { itens: RascunhoCard[]; podeEditar: boolean }) {
  const router = useRouter();
  const [apagando, setApagando] = useState<string | null>(null);
  const apagar = async (r: RascunhoCard) => {
    if (!(await confirmar(`Apagar o rascunho “${r.name}”? Ele não foi publicado; nada muda no Google.`))) return;
    setApagando(r.id);
    const res = await apagarRascunho(r.id);
    setApagando(null);
    if (!res.ok) return toast.err(res.error);
    toast.ok("Rascunho apagado");
    router.refresh();
  };
  return (
    <section className="panel cp-rascunhos" data-enter>
      <div className="panel-head">
        <div><div className="panel-title">Rascunhos</div><div className="subtle caption">Propostas da IA e campanhas em montagem. Nada disso está no Google ainda.</div></div>
      </div>
      <div className="cp-rasc-grade">
        {itens.map((r) => (
          <div key={r.id} className="cp-rasc" data-status={r.status}>
            <Link href={`/campaigns/rascunhos/${r.id}`} className="cp-rasc-link">
              <span className="cp-logo">
                <GoogleAdsLogo size={20} />
                {r.source === "AI" && <i className="cp-ia"><Sparkles size={10} aria-hidden className={r.status === "GENERATING" ? "animate-pulse" : undefined} /></i>}
              </span>
              <span className="cp-nome">
                <b title={r.name}>{r.name}</b>
                <span className="subtle" suppressHydrationWarning>{ROTULO[r.status] ?? r.status} · Google Pesquisa · {ago(r.updated_at)}</span>
              </span>
            </Link>
            {podeEditar && r.status !== "GENERATING" && r.status !== "PUBLISHING" && (
              <button className="btn btn-ghost btn-xs cp-excluir" onClick={() => apagar(r)} disabled={apagando === r.id} title="Apagar rascunho">
                {apagando === r.id ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}<span className="sr-only">Apagar rascunho</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
