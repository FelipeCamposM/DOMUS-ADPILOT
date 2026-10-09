"use client";

import { Download, KeyRound, Loader2, Plus, ScanSearch, Trash2, Unlock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ago, dateTime, int } from "@/lib/format";
import { toast } from "../shell/toast";
import { atualizarContaIA } from "./actions";
import { importarContaIA, procurarContasIA, removerContaIA } from "./ai-accounts";
import { ConnectAi, ProviderLogo } from "./ConnectAi";

type Provider = "claude" | "codex";
export interface ContaIA {
  id: string; provider: Provider; name: string; email: string | null; plan: string | null; status: string; priority: number;
  limited_until: string | null; last_used_at: string | null; last_error: string | null;
  usage: { five_hour?: { pct: number; resets_at: string | null }; seven_day?: { pct: number; resets_at: string | null }; observed_at?: string } | null;
  turnos: number; tokens: string; custo: string | null;
}
export interface Detectada { key: string; provider: Provider; name: string; email: string | null; plan: string | null }

export function AiAccounts({ contas, detectadas, podeAdmin, workerOnline }: { contas: ContaIA[]; detectadas: Detectada[]; podeAdmin: boolean; workerOnline: boolean }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [conectar, setConectar] = useState(false);
  const [relogin, setRelogin] = useState<ContaIA | null>(null);
  const [procurando, setProcurando] = useState(false);

  const rodar = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => start(async () => {
    const r = await fn();
    if (r.ok) toast.ok(msg); else toast.err(r.error ?? "Erro");
    router.refresh();
  });
  const procurar = () => start(async () => {
    const r = await procurarContasIA();
    if (!r.ok) return toast.err(r.error);
    setProcurando(true);
    setTimeout(() => { router.refresh(); setProcurando(false); }, 6000); // a detecção leva alguns segundos no worker
  });

  return (
    <>
      {podeAdmin && (
        <div className="cluster">
          <button className="btn btn-primary btn-sm" onClick={() => setConectar(true)} disabled={!workerOnline} title={workerOnline ? undefined : "Precisa do worker online"}>
            <Plus aria-hidden /> Conectar conta
          </button>
          <button className="btn btn-secondary btn-sm" onClick={procurar} disabled={pend || procurando || !workerOnline}>
            {procurando ? <Loader2 className="animate-spin" aria-hidden /> : <ScanSearch aria-hidden />} Procurar contas já logadas neste PC
          </button>
          {!workerOnline && <span className="subtle caption">Worker offline: ligue o PC do worker para conectar contas.</span>}
        </div>
      )}

      {podeAdmin && detectadas.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="subtle caption">Encontradas neste PC, já logadas. É só importar:</span>
          <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {detectadas.map((d) => (
              <div key={d.key} className="panel spotlight" data-enter="scale" style={{ padding: 14, display: "flex", gap: 12, alignItems: "center" }}>
                <ProviderLogo p={d.provider} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{d.email ?? d.name}</div>
                  <div className="subtle" style={{ fontSize: 11.5 }}>{d.provider === "claude" ? "Claude" : "Codex"}{d.plan ? ` · ${d.plan}` : ""} · {d.name}</div>
                </div>
                <button className="btn btn-secondary btn-xs" disabled={pend} onClick={() => rodar(() => importarContaIA(d.key), "Conta importada")}><Download aria-hidden /> Importar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {contas.length === 0 ? (
        <div className="empty" style={{ padding: 20 }}>Nenhuma conta ainda. Conecte uma conta Claude ou ChatGPT (Codex) acima.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Conta</th><th>Status</th><th style={{ width: 160 }}>Uso 5 h</th><th style={{ width: 160 }}>Uso semana</th><th className="num">Respostas 30 d</th><th className="num">Tokens 30 d</th><th>Prioridade</th><th aria-label="Ações" /></tr></thead>
            <tbody>
              {contas.map((c) => {
                const bloqueada = c.limited_until && new Date(c.limited_until) > new Date();
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <ProviderLogo p={c.provider} size={28} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          <div className="subtle" style={{ fontSize: 11.5 }} suppressHydrationWarning>{[c.email !== c.name && c.email, c.plan, `usada ${ago(c.last_used_at)}`].filter(Boolean).join(" · ")}</div>
                        </div>
                      </div>
                      {c.last_error && <div className="error-text" style={{ fontSize: 11.5, whiteSpace: "normal", maxWidth: 280, marginTop: 4 }}>{c.last_error}</div>}
                    </td>
                    <td>
                      {bloqueada ? <span className="badge badge-warning" title={`Volta ${dateTime(c.limited_until!)}`}>No limite até {dateTime(c.limited_until!)}</span>
                        : c.status === "ACTIVE" ? <span className="badge badge-brand"><span className="dot on" aria-hidden />Ativa</span> : <span className="badge">Desativada</span>}
                    </td>
                    <td><Uso w={c.usage?.five_hour} /></td>
                    <td><Uso w={c.usage?.seven_day} /></td>
                    <td className="num">{int(c.turnos)}</td>
                    <td className="num">{int(c.tokens)}{c.custo && Number(c.custo) > 0 && <div className="subtle" style={{ fontSize: 11 }}>≈ US$ {Number(c.custo).toFixed(2)}</div>}</td>
                    <td>
                      <input className="input-sm" type="number" min={0} max={999} defaultValue={c.priority} disabled={!podeAdmin} style={{ width: 70 }} aria-label={`Prioridade de ${c.name}`}
                        onBlur={(e) => Number(e.target.value) !== c.priority && rodar(() => atualizarContaIA(c.id, { priority: Number(e.target.value) }), "Prioridade salva")} />
                    </td>
                    <td>
                      {podeAdmin && (
                        <div className="cluster" style={{ gap: 4, flexWrap: "nowrap", justifyContent: "flex-end" }}>
                          {bloqueada && <button className="btn btn-ghost btn-xs" title="Liberar agora (se o limite já resetou)" onClick={() => rodar(() => atualizarContaIA(c.id, { liberar: true }), "Conta liberada")}><Unlock aria-hidden /></button>}
                          <button className="btn btn-ghost btn-xs" title="Refazer login" disabled={!workerOnline} onClick={() => setRelogin(c)}><KeyRound aria-hidden /><span className="sr-only">Refazer login</span></button>
                          <button className="btn btn-secondary btn-xs" onClick={() => rodar(() => atualizarContaIA(c.id, { status: c.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }), c.status === "ACTIVE" ? "Conta desativada" : "Conta ativada")}>
                            {c.status === "ACTIVE" ? "Desativar" : "Ativar"}
                          </button>
                          <button className="btn btn-ghost btn-xs" title="Remover" onClick={() => confirm(`Remover a conta “${c.name}” da plataforma?`) && rodar(() => removerContaIA(c.id), "Conta removida")}><Trash2 aria-hidden /><span className="sr-only">Remover</span></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="subtle caption">Menor prioridade é usada primeiro. O uso de 5 h/semana vem do próprio Claude/Codex a cada resposta. Contas importadas continuam funcionando nos outros apps (OMNI, terminal).</p>

      <ConnectAi open={conectar} onClose={() => setConectar(false)} />
      <ConnectAi open={!!relogin} onClose={() => setRelogin(null)} relogin={relogin ? { id: relogin.id, name: relogin.name, provider: relogin.provider } : undefined} />
    </>
  );
}

function Uso({ w }: { w?: { pct: number; resets_at: string | null } }) {
  if (!w) return <span className="subtle" title="Aparece depois da primeira resposta desta conta">sem dado</span>;
  const cls = w.pct >= 100 ? "err" : w.pct >= 80 ? "warn" : "";
  return (
    <div title={w.resets_at ? `Reinicia ${dateTime(w.resets_at)}` : undefined}>
      <div className={`bar ${cls}`}><i style={{ width: `${Math.min(100, w.pct)}%` }} /></div>
      <div className="subtle tabular" style={{ fontSize: 11, marginTop: 3 }} suppressHydrationWarning>{w.pct.toFixed(0)}%{w.resets_at && ` · reinicia ${ago(w.resets_at)}`}</div>
    </div>
  );
}
