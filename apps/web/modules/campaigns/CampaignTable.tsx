"use client";

import { Bot, Eye, Loader2, MousePointerClick, Pause, Pencil, Play, RefreshCw, Target, Trash2, Wallet, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ago, derive, int, money, pct } from "@/lib/format";
import type { CampanhaLinha } from "@/lib/queries";
import { GoogleAdsLogo, MetaLogo } from "../connections/Logos";
import { confirmar } from "../shell/confirmar";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { alterarOrcamento, alterarStatus, excluirCampanha, sincronizarTudo } from "./actions";
import { StatusTag } from "./Tags";

type Linha = Omit<CampanhaLinha, "last_synced_at"> & { last_synced_at: string | null };

export function CampaignTable({ linhas, podeEditar, destaque }: { linhas: Linha[]; podeEditar: boolean; destaque?: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [, start] = useTransition();
  const [editando, setEditando] = useState<Linha | null>(null);

  const acao = (c: Linha, fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setOcupado(c.id);
    start(async () => {
      const r = await fn();
      setOcupado(null);
      if (r.ok) toast.ok(msg); else toast.err(r.error ?? "Erro");
      router.refresh();
    });
  };
  const status = (c: Linha) => {
    const novo = c.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    acao(c, () => alterarStatus(c.id, novo), novo === "PAUSED" ? `“${c.name}” pausada` : `“${c.name}” ativada`);
  };
  const excluir = async (c: Linha) => {
    if (!(await confirmar(`Excluir “${c.name}” no ${c.provider === "META" ? "Meta" : "Google Ads"}? Não tem volta: os anúncios param e a campanha some da conta.`))) return;
    acao(c, () => excluirCampanha(c.id), `“${c.name}” excluída`);
  };
  const sync = () => start(async () => {
    const r = await sincronizarTudo();
    if (!r.ok) return toast.err(r.error);
    toast.ok(r.data ? `${r.data} sincronização(ões) na fila do worker` : "Já existe sincronização em andamento");
  });

  if (!linhas.length) {
    return (
      <div className="panel cp-vazio" data-enter>
        <span className="cp-vazio-logos"><GoogleAdsLogo size={34} /><MetaLogo size={34} /></span>
        <b>Nenhuma campanha com esses filtros</b>
        <span className="subtle small">Crie uma com a IA em “Nova campanha” ou sincronize as contas conectadas.</span>
      </div>
    );
  }

  const tot = derive({
    spend: String(linhas.reduce((a, l) => a + Number(l.spend), 0)), impressions: String(linhas.reduce((a, l) => a + Number(l.impressions), 0)),
    clicks: String(linhas.reduce((a, l) => a + Number(l.clicks), 0)), leads: String(linhas.reduce((a, l) => a + Number(l.leads), 0)),
    conversions: String(linhas.reduce((a, l) => a + Number(l.conversions), 0)), revenue: String(linhas.reduce((a, l) => a + Number(l.revenue), 0)),
  });
  const moeda = linhas[0]!.currency;
  const ativas = linhas.filter((l) => l.status === "ACTIVE").length;

  return (
    <>
      <div className="cp-resumo" data-enter>
        <Resumo icone={<Wallet aria-hidden />} rotulo="Gasto no período" valor={money(tot.spend, moeda)} />
        <Resumo icone={<MousePointerClick aria-hidden />} rotulo="Cliques" valor={int(tot.clicks)} sub={`CTR ${pct(tot.ctr)}`} />
        <Resumo icone={<Target aria-hidden />} rotulo="Conversões" valor={tot.conversions.toLocaleString("pt-BR")} sub={tot.cpa == null ? "sem conversões" : `${money(tot.cpa, moeda)} cada`} />
        <Resumo icone={<Zap aria-hidden />} rotulo="Rodando agora" valor={`${ativas} de ${linhas.length}`} sub={ativas ? "campanhas ativas" : "todas pausadas"} />
      </div>

      <div className="cp-barra" data-enter>
        <span className="panel-title">{linhas.length} campanha{linhas.length > 1 ? "s" : ""}</span>
        {podeEditar && <button className="btn btn-secondary btn-xs" onClick={sync}><RefreshCw aria-hidden /> Sincronizar agora</button>}
      </div>

      <div className="cp-grade">
        {linhas.map((c, i) => {
          const d = derive(c);
          const ativa = c.status === "ACTIVE";
          return (
            <article key={c.id} className="panel cp-card surge" data-status={c.status} data-destaque={c.id === destaque || undefined} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <header className="cp-topo">
                <span className="cp-logo">{c.provider === "META" ? <MetaLogo size={24} /> : <GoogleAdsLogo size={24} />}</span>
                <div className="cp-nome">
                  <Link href={`/campaigns/${c.id}`} title={c.name} style={{ color: "inherit", textDecoration: "none" }}><b>{c.name}</b></Link>
                  <span className="subtle" suppressHydrationWarning>{c.provider === "META" ? "Meta Ads" : "Google Ads"} · {c.account_name} · sync {ago(c.last_synced_at)}</span>
                </div>
                <span className="cp-status"><StatusTag s={c.status} /></span>
              </header>

              <div className="cp-gasto">
                <span><small>Gasto</small><strong className="tabular">{money(c.spend, c.currency)}</strong></span>
                <span className="cp-orc">
                  <small>Orçamento</small>
                  <b className="tabular">{c.daily_budget ? `${money(c.daily_budget, c.currency)}/dia` : "no conjunto"}</b>
                </span>
              </div>

              <dl className="cp-metricas">
                <div><dt>Cliques</dt><dd>{int(d.clicks)}</dd></div>
                <div><dt>CTR</dt><dd>{pct(d.ctr)}</dd></div>
                <div><dt>Conversões</dt><dd>{d.conversions.toLocaleString("pt-BR")}</dd></div>
                <div><dt>{d.revenue > 0 ? "ROAS" : "Custo/conv."}</dt><dd>{d.revenue > 0 ? (d.roas == null ? "—" : `${d.roas.toFixed(2).replace(".", ",")}x`) : d.cpa == null ? "—" : money(d.cpa, c.currency)}</dd></div>
              </dl>

              <footer className="cp-acoes">
                {podeEditar && (c.status === "ACTIVE" || c.status === "PAUSED") && (
                  <button className={`btn btn-xs ${ativa ? "btn-secondary" : "btn-primary"}`} onClick={() => status(c)} disabled={ocupado === c.id}>
                    {ocupado === c.id ? <Loader2 className="animate-spin" aria-hidden /> : ativa ? <Pause aria-hidden /> : <Play aria-hidden />}
                    {ativa ? "Pausar" : "Ativar"}
                  </button>
                )}
                {podeEditar && c.budget_editable && (
                  <button className="btn btn-ghost btn-xs" onClick={() => setEditando(c)}><Pencil aria-hidden /> Orçamento</button>
                )}
                <Link className="btn btn-ghost btn-xs" href={`/campaigns/${c.id}`}><Eye aria-hidden /> Detalhes</Link>
                <Link className="btn btn-ghost btn-xs" href={`/ai?nova=1&campaign=${c.id}`}><Bot aria-hidden /> Analisar</Link>
                {podeEditar && (
                  <button className="btn btn-ghost btn-xs cp-excluir" onClick={() => excluir(c)} disabled={ocupado === c.id} title="Excluir campanha">
                    <Trash2 aria-hidden /><span className="sr-only">Excluir</span>
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
      <BudgetDialog c={editando} onClose={() => setEditando(null)} />
    </>
  );
}

function Resumo({ icone, rotulo, valor, sub }: { icone: React.ReactNode; rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="panel cp-kpi">
      <span className="cp-kpi-ic">{icone}</span>
      <span><small>{rotulo}</small><strong className="tabular">{valor}</strong>{sub && <em>{sub}</em>}</span>
    </div>
  );
}

function BudgetDialog({ c, onClose }: { c: Linha | null; onClose: () => void }) {
  const router = useRouter();
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const atual = Number(c?.daily_budget ?? 0);
  const novo = Number(valor.replace(",", "."));
  const variacao = atual > 0 && novo > 0 ? (novo - atual) / atual : null;

  const salvar = () => c && start(async () => {
    const r = await alterarOrcamento(c.id, valor);
    if (!r.ok) return setErro(r.error);
    toast.ok(`Orçamento de “${c.name}” agora é ${money(novo, c.currency)}/dia`);
    setValor(""); setErro(null); onClose();
    router.refresh();
  });

  return (
    <Dialog open={!!c} onClose={() => { setValor(""); setErro(null); onClose(); }} title="Alterar orçamento diário">
      {c && (
        <>
          <p className="muted small">{c.name}</p>
          <div className="field">
            <label className="label" htmlFor="orc">Novo orçamento por dia ({c.currency})</label>
            <input id="orc" className="input" inputMode="decimal" autoFocus placeholder={c.daily_budget ?? ""} value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <div className="panel" style={{ padding: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span><span className="subtle caption">Atual</span><br /><b className="tabular">{money(atual, c.currency)}</b></span>
            <span style={{ textAlign: "right" }}><span className="subtle caption">Novo</span><br /><b className="tabular">{novo > 0 ? money(novo, c.currency) : "—"}</b>
              {variacao != null && <span className={`delta ${variacao > 0 ? "up" : "down"}`}>&nbsp;{variacao > 0 ? "+" : ""}{(variacao * 100).toFixed(0)}%</span>}</span>
          </div>
          {variacao != null && variacao > 0.5 && <p className="small" style={{ color: "rgb(var(--c-warning))" }}>Aumento acima de 50% pode reiniciar o aprendizado da campanha.</p>}
          {erro && <p className="error-text" role="alert">{erro}</p>}
          <p className="subtle caption">A mudança vai direto para a {c.provider === "META" ? "Meta" : "Google"} e fica registrada na auditoria.</p>
          <div className="cluster" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={salvar} disabled={pend || !(novo > 0)}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : "Confirmar"}</button>
          </div>
        </>
      )}
    </Dialog>
  );
}
