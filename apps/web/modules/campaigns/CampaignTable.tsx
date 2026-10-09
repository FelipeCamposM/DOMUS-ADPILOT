"use client";

import { Bot, Loader2, Pause, Pencil, Play, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ago, derive, money, pct } from "@/lib/format";
import type { CampanhaLinha } from "@/lib/queries";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { alterarOrcamento, alterarStatus, sincronizarTudo } from "./actions";
import { ProviderTag, StatusTag } from "./Tags";

type Linha = Omit<CampanhaLinha, "last_synced_at"> & { last_synced_at: string | null };

export function CampaignTable({ linhas, podeEditar, destaque }: { linhas: Linha[]; podeEditar: boolean; destaque?: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [, start] = useTransition();
  const [editando, setEditando] = useState<Linha | null>(null);

  const status = (c: Linha) => {
    setOcupado(c.id);
    start(async () => {
      const novo = c.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
      const r = await alterarStatus(c.id, novo);
      setOcupado(null);
      if (r.ok) toast.ok(novo === "PAUSED" ? `“${c.name}” pausada` : `“${c.name}” ativada`);
      else toast.err(r.error);
      router.refresh();
    });
  };

  const sync = () => start(async () => {
    const r = await sincronizarTudo();
    if (!r.ok) return toast.err(r.error);
    toast.ok(r.data ? `${r.data} sincronização(ões) na fila do worker` : "Já existe sincronização em andamento");
  });

  if (!linhas.length) {
    return <div className="panel"><div className="empty">Nenhuma campanha com esses filtros.</div></div>;
  }

  return (
    <>
      <div className="panel" data-enter>
        <div className="panel-head">
          <span className="panel-title">{linhas.length} campanhas</span>
          {podeEditar && <button className="btn btn-secondary btn-xs" onClick={sync}><RefreshCw aria-hidden /> Sincronizar agora</button>}
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Campanha</th><th>Plataforma</th><th>Status</th><th className="num">Orçamento/dia</th><th className="num">Gasto</th>
                <th className="num">CTR</th><th className="num">CPA</th><th className="num">Conversões</th><th className="num">ROAS</th><th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => {
                const d = derive(c);
                return (
                  <tr key={c.id} style={c.id === destaque ? { background: "rgb(var(--c-brand) / 0.05)" } : undefined}>
                    <td style={{ maxWidth: 320 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", fontWeight: 550 }} title={c.name}>{c.name}</div>
                      <div className="subtle" style={{ fontSize: 11.5 }} suppressHydrationWarning>{c.account_name} · sync {ago(c.last_synced_at)}</div>
                    </td>
                    <td><ProviderTag p={c.provider} /></td>
                    <td><StatusTag s={c.status} /></td>
                    <td className="num">
                      {c.daily_budget ? money(c.daily_budget, c.currency) : <span className="subtle" title="Orçamento no nível do conjunto/grupo">no conjunto</span>}
                    </td>
                    <td className="num">{money(c.spend, c.currency)}</td>
                    <td className="num">{pct(d.ctr)}</td>
                    <td className="num">{d.cpa == null ? "—" : money(d.cpa, c.currency)}</td>
                    <td className="num">{d.conversions.toLocaleString("pt-BR")}</td>
                    <td className="num">{d.roas == null ? "—" : `${d.roas.toFixed(2).replace(".", ",")}x`}</td>
                    <td>
                      <div className="cluster" style={{ gap: 4, flexWrap: "nowrap", justifyContent: "flex-end" }}>
                        {podeEditar && (c.status === "ACTIVE" || c.status === "PAUSED") && (
                          <button className="btn btn-ghost btn-xs" onClick={() => status(c)} disabled={ocupado === c.id} title={c.status === "ACTIVE" ? "Pausar" : "Ativar"}>
                            {ocupado === c.id ? <Loader2 className="animate-spin" aria-hidden /> : c.status === "ACTIVE" ? <Pause aria-hidden /> : <Play aria-hidden />}
                            <span className="sr-only">{c.status === "ACTIVE" ? "Pausar" : "Ativar"}</span>
                          </button>
                        )}
                        {podeEditar && c.budget_editable && (
                          <button className="btn btn-ghost btn-xs" onClick={() => setEditando(c)} title="Alterar orçamento"><Pencil aria-hidden /><span className="sr-only">Alterar orçamento</span></button>
                        )}
                        <Link className="btn btn-ghost btn-xs" href={`/ai?nova=1&campaign=${c.id}`} title="Analisar com IA"><Bot aria-hidden /><span className="sr-only">Analisar com IA</span></Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <BudgetDialog c={editando} onClose={() => setEditando(null)} />
    </>
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
