"use client";

import { ETAPAS, formatarNumero, ROTULO_ETAPA, type Etapa } from "@domus-ads/core/mensagens";
import { Globe, MessageCircle, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "../shell/toast";
import { definirEtapa } from "./actions";
import { ha } from "./Mensagens";

export interface Lead {
  numero: string; nome: string; etapa: Etapa; site: string | null; lead_em: string; mensagem: string | null; respondeu: boolean; ultima: string | null;
}

const DICA: Record<Etapa, string> = {
  NOVO: "Chegou e ninguém falou ainda",
  CONTATO: "Você já mandou mensagem",
  NEGOCIANDO: "Conversa andando, proposta na mesa",
  GANHO: "Virou cliente",
  PERDIDO: "Não fechou",
};

/** Funil dos leads em colunas, uma por etapa. Mudar a etapa no cartão move o lead; o cartão abre a conversa. */
export function Leads({ leads, sites }: { leads: Lead[]; sites: string[] }) {
  const [busca, setBusca] = useState("");
  const [site, setSite] = useState("");
  const q = busca.trim().toLowerCase();
  const vistos = leads.filter((l) => (!site || l.site === site) && (!q || l.nome.toLowerCase().includes(q) || l.numero.includes(q.replace(/\D/g, "") || "—") || l.mensagem?.toLowerCase().includes(q)));
  const n = (e: Etapa) => vistos.filter((l) => l.etapa === e).length;
  const fechados = n("GANHO") + n("PERDIDO");
  const esfriando = vistos.filter((l) => l.etapa === "NOVO" && Date.now() - new Date(l.lead_em).getTime() > 6 * 3600_000).length;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="kpis" data-enter>
        <div className="kpi hero"><div className="kpi-label">Leads</div><div className="kpi-value">{vistos.length}</div></div>
        <div className="kpi"><div className="kpi-label">Esperando resposta</div><div className="kpi-value" style={esfriando ? { color: "rgb(var(--c-warning))" } : undefined}>{n("NOVO")}</div>
          {esfriando > 0 && <div className="subtle caption">{esfriando} há mais de 6 h</div>}</div>
        <div className="kpi"><div className="kpi-label">Negociando</div><div className="kpi-value">{n("NEGOCIANDO")}</div></div>
        <div className="kpi"><div className="kpi-label">Taxa de fechamento</div><div className="kpi-value">{fechados ? `${Math.round((n("GANHO") / fechados) * 100)}%` : "—"}</div>
          <div className="subtle caption">{n("GANHO")} de {fechados} decididos</div></div>
      </div>

      <div className="cluster" style={{ gap: 10 }}>
        <label className="wa-busca" style={{ margin: 0, flex: "1 1 260px", maxWidth: 380 }}><Search size={15} aria-hidden /><input placeholder="Buscar nome, número ou mensagem" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        {sites.length > 1 && (
          <select className="select" style={{ width: "auto", height: 36 }} value={site} onChange={(e) => setSite(e.target.value)} aria-label="Filtrar por site">
            <option value="">Todos os sites</option>
            {sites.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {leads.length ? (
        <div className="crm-funil">
          {ETAPAS.map((e) => (
            <section key={e} className="crm-col" data-etapa={e} aria-label={ROTULO_ETAPA[e]}>
              <header className="crm-col-topo"><b>{ROTULO_ETAPA[e]}</b><span className="crm-col-n">{n(e)}</span><small className="subtle">{DICA[e]}</small></header>
              <div className="crm-col-lista">
                {vistos.filter((l) => l.etapa === e).map((l) => <Cartao key={l.numero} l={l} />)}
                {!n(e) && <span className="crm-col-vazio">Nenhum</span>}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="panel wa-vazio" style={{ padding: "48px 16px" }}>
          <Sparkles size={38} aria-hidden /><b>Nenhum lead ainda</b>
          <span className="subtle small" style={{ textAlign: "center", maxWidth: 420 }}>Conecte um site e cole o formulário. Quem preencher aparece aqui, na coluna Novo. Você também pode marcar qualquer conversa como lead.</span>
          <Link className="btn btn-primary btn-sm" style={{ marginTop: 6 }} href="/crm/sites"><Globe aria-hidden /> Conectar site</Link>
        </div>
      )}
    </div>
  );
}

function Cartao({ l }: { l: Lead }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const esfriando = l.etapa === "NOVO" && Date.now() - new Date(l.lead_em).getTime() > 6 * 3600_000;
  const mover = (e: string) => start(async () => {
    const r = await definirEtapa(l.numero, e || null);
    if (!r.ok) return toast.err(r.error);
    router.refresh();
  });
  return (
    <article className="crm-card" data-esfriando={esfriando} aria-busy={pend}>
      <Link href={`/crm?c=${l.numero}`} className="crm-card-link">
        <span className="crm-card-topo"><b className="crm-trunc">{l.nome}</b><small suppressHydrationWarning>{ha(l.lead_em)}</small></span>
        <span className="subtle caption crm-trunc">{formatarNumero(l.numero)}{l.site ? ` · ${l.site}` : ""}</span>
        {l.mensagem && <span className="crm-card-msg">“{l.mensagem}”</span>}
      </Link>
      <footer className="crm-card-pe">
        <select className="select" data-etapa={l.etapa} value={l.etapa} onChange={(e) => mover(e.target.value)} disabled={pend} aria-label={`Etapa de ${l.nome}`}>
          {ETAPAS.map((e) => <option key={e} value={e}>{ROTULO_ETAPA[e]}</option>)}
          <option value="">Tirar do funil</option>
        </select>
        {l.respondeu && <span className="crm-card-resp" title="A pessoa já respondeu: sem trava de primeiro contato"><MessageCircle size={12} aria-hidden /> respondeu</span>}
      </footer>
    </article>
  );
}
