"use client";

import { Check, Copy, KeyRound, Pause, Play, Plus, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { ago, int } from "@/lib/format";
import type { ContaOpcao, ContaSistema, DiaSistema, LinhaSistema } from "@/lib/sistemas";
import { CountUp } from "../motion/CountUp";
import { ProviderLogo } from "../settings/ConnectAi";
import { confirmar } from "../shell/confirmar";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { alternarSistema, criarSistema, salvarSistema, trocarChaveSistema } from "./actions";

type Chave = "hoje" | "semana" | "mes";
const PERIODOS: { k: Chave; rotulo: string }[] = [{ k: "hoje", rotulo: "Hoje" }, { k: "semana", rotulo: "7 dias" }, { k: "mes", rotulo: "30 dias" }];
// AdPilot na cor da marca; cada sistema conectado ganha uma cor fixa pela ordem de criação
const CORES = ["rgb(var(--c-brand))", "#60A5FA", "#F472B6", "#FBBF24", "#34D399", "#A78BFA", "#F87171", "#22D3EE"];
const cor = (i: number) => CORES[i % CORES.length]!;
const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} mi` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : int(n));

export function Sistemas({ linhas, porDia, porConta, contas }: { linhas: LinhaSistema[]; porDia: DiaSistema[]; porConta: ContaSistema[]; contas: ContaOpcao[] }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [periodo, setPeriodo] = useState<Chave>("semana");
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [chave, setChave] = useState<{ nome: string; chave: string } | null>(null);
  const [editando, setEditando] = useState<LinhaSistema | null>(null);

  const total = linhas.reduce((t, l) => ({ respostas: t.respostas + l[periodo].respostas, tokens: t.tokens + l[periodo].tokens, pct: t.pct + l[periodo].pct, erros: t.erros + l[periodo].erros }), { respostas: 0, tokens: 0, pct: 0, erros: 0 });
  const conectados = linhas.filter((l) => l.id);

  const criar = () => start(async () => {
    const r = await criarSistema(nome);
    if (!r.ok) return toast.err(r.error);
    setCriando(false); setChave({ nome, chave: r.data.chave }); setNome("");
    router.refresh();
  });
  const rodar = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => start(async () => {
    const r = await fn();
    if (r.ok) toast.ok(msg); else toast.err(r.error ?? "Erro");
    router.refresh();
  });
  const trocar = async (l: LinhaSistema) => {
    if (!(await confirmar(`Gerar uma chave nova para “${l.nome}”? A chave atual para de funcionar na hora e você vai precisar colar a nova no admin dele.`))) return;
    start(async () => {
      const r = await trocarChaveSistema(l.id!);
      if (!r.ok) return toast.err(r.error);
      setChave({ nome: l.nome, chave: r.data.chave });
      router.refresh();
    });
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <div className="cluster" role="tablist" aria-label="Período">
          {PERIODOS.map((p) => <button key={p.k} type="button" role="tab" className="chip" data-active={periodo === p.k} aria-selected={periodo === p.k} onClick={() => setPeriodo(p.k)}>{p.rotulo}</button>)}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setCriando(true)}><Plus aria-hidden /> Conectar sistema</button>
      </div>

      <div className="kpis" data-enter>
        <div className="kpi hero"><div className="kpi-label">Respostas da IA</div><div className="kpi-value"><CountUp value={total.respostas} kind="int" /></div></div>
        <div className="kpi"><div className="kpi-label">Tokens</div><div className="kpi-value">{tokens(total.tokens)}</div></div>
        <div className="kpi" title="Soma do quanto cada resposta subiu a janela de 5 h da conta usada. Estimativa: a janela é da conta inteira."><div className="kpi-label">Janela de 5 h gasta (estim.)</div><div className="kpi-value">{total.pct.toFixed(1).replace(".", ",")}%</div></div>
        <div className="kpi"><div className="kpi-label">Sistemas conectados</div><div className="kpi-value"><CountUp value={conectados.filter((l) => l.ativo).length} kind="int" /></div></div>
        {total.erros > 0 && <div className="kpi"><div className="kpi-label">Falhas</div><div className="kpi-value" style={{ color: "rgb(var(--c-error))" }}>{int(total.erros)}</div></div>}
      </div>

      <Grafico linhas={linhas} porDia={porDia} />

      <div className="panel" data-enter>
        <div className="panel-head"><span className="panel-title">Consumo por sistema · {PERIODOS.find((p) => p.k === periodo)!.rotulo.toLowerCase()}</span></div>
        <div className="table-wrap" style={{ border: 0 }}>
          <table className="data">
            <thead><tr><th>Sistema</th><th className="num">Respostas</th><th className="num">Tokens</th><th style={{ width: 200 }}>Parte do total</th><th className="num" title="Estimativa">Janela 5 h</th><th>Travas</th><th aria-label="Ações" /></tr></thead>
            <tbody>
              {linhas.map((l, i) => {
                const p = l[periodo];
                const parte = total.respostas ? p.respostas / total.respostas : 0;
                return (
                  <tr key={l.id ?? "adpilot"} className="anim-linha" style={{ "--i": i } as CSSProperties}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="sis-cor" style={{ background: cor(i) }} aria-hidden />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{l.nome} {!l.id && <span className="badge" style={{ marginLeft: 4 }}>próprio</span>}{l.id && !l.ativo && <span className="badge badge-warning" style={{ marginLeft: 4 }}>pausado</span>}</div>
                          <div className="subtle" style={{ fontSize: 11.5 }} suppressHydrationWarning>
                            {l.id ? `chave …${l.chave_fim} · ${l.ultimo_uso ? `último pedido ${ago(l.ultimo_uso)}` : "nunca usou"}` : "chat, consultor, Studio, campanhas e Instagram"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="num">{int(p.respostas)}{p.erros > 0 && <div className="error-text" style={{ fontSize: 11 }}>{p.erros} falha(s)</div>}</td>
                    <td className="num">{tokens(p.tokens)}</td>
                    <td><div className="bar"><i style={{ width: `${Math.round(parte * 100)}%`, background: cor(i) }} /></div><div className="subtle tabular" style={{ fontSize: 11, marginTop: 3 }}>{Math.round(parte * 100)}%</div></td>
                    <td className="num">{p.pct ? `${p.pct.toFixed(1).replace(".", ",")}%` : "—"}</td>
                    <td className="subtle" style={{ fontSize: 12 }}>
                      {l.id ? [l.limite_pct ? `para em ${l.limite_pct}% da janela` : null, l.contas ? `${l.contas.length} conta(s)` : "todas as contas"].filter(Boolean).join(" · ") : "—"}
                    </td>
                    <td>
                      {l.id && (
                        <div className="cluster" style={{ gap: 4, flexWrap: "nowrap", justifyContent: "flex-end" }}>
                          <button className="btn btn-ghost btn-xs" title="Ajustar" onClick={() => setEditando(l)}><SlidersHorizontal aria-hidden /><span className="sr-only">Ajustar {l.nome}</span></button>
                          <button className="btn btn-ghost btn-xs" title="Gerar chave nova" disabled={pend} onClick={() => trocar(l)}><KeyRound aria-hidden /><span className="sr-only">Gerar chave nova</span></button>
                          <button className="btn btn-secondary btn-xs" disabled={pend} onClick={() => rodar(() => alternarSistema(l.id!, !l.ativo), l.ativo ? "Sistema pausado" : "Sistema ativado")}>
                            {l.ativo ? <><Pause aria-hidden /> Pausar</> : <><Play aria-hidden /> Ativar</>}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <PorConta linhas={linhas} porConta={porConta} />

      <p className="subtle caption">
        A janela de 5 h é da conta inteira: o número por sistema é a soma de quanto ela subiu em cada resposta, então uso fora da plataforma no
        mesmo momento entra junto. Respostas e tokens são exatos. Sistemas pausados recebem erro na hora; os pedidos somem em 7 dias e o consumo fica.
      </p>

      <Dialog open={criando} onClose={() => setCriando(false)} title="Conectar sistema">
        <form className="stack" style={{ padding: 18, gap: 14 }} onSubmit={(e) => { e.preventDefault(); criar(); }}>
          <label className="field">
            <span className="label">Nome do sistema</span>
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: SIAPLUS" autoFocus maxLength={60} />
          </label>
          <p className="subtle caption">O AdPilot gera uma chave. Você cola a chave no admin do sistema (tela “Conectar ao AdPilot”) e ele passa a usar as contas de IA daqui.</p>
          <div className="cluster" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCriando(false)}>Cancelar</button>
            <button className="btn btn-primary btn-sm" disabled={pend || nome.trim().length < 2}>Gerar chave</button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!chave} onClose={() => setChave(null)} title={`Chave de ${chave?.nome ?? ""}`}>
        {chave && <ChaveNova chave={chave.chave} onClose={() => setChave(null)} />}
      </Dialog>

      <Dialog open={!!editando} onClose={() => setEditando(null)} title={`Ajustar ${editando?.nome ?? ""}`}>
        {editando && <Ajustes l={editando} contas={contas} pend={pend} onSalvar={(a) => start(async () => {
          const r = await salvarSistema(editando.id!, a);
          if (!r.ok) return toast.err(r.error);
          toast.ok("Ajustes salvos"); setEditando(null); router.refresh();
        })} />}
      </Dialog>
    </div>
  );
}

function ChaveNova({ chave, onClose }: { chave: string; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const url = typeof window === "undefined" ? "" : window.location.origin;
  const copiar = async (t: string) => { await navigator.clipboard.writeText(t); setCopiado(true); setTimeout(() => setCopiado(false), 1800); };
  return (
    <div className="stack" style={{ padding: 18, gap: 14 }}>
      <p>Copie agora: <b>a chave não aparece de novo</b>. Se perder, gere outra aqui.</p>
      <div className="sis-chave">
        <code>{chave}</code>
        <button className="btn btn-secondary btn-xs" onClick={() => copiar(chave)}>{copiado ? <><Check aria-hidden /> Copiada</> : <><Copy aria-hidden /> Copiar</>}</button>
      </div>
      <div className="subtle caption">No admin do sistema, em “Conectar ao AdPilot”, cole a chave. Endereço do AdPilot: <code>{url}</code></div>
      <div className="cluster" style={{ justifyContent: "flex-end" }}><button className="btn btn-primary btn-sm" onClick={onClose}>Pronto</button></div>
    </div>
  );
}

function Ajustes({ l, contas, pend, onSalvar }: { l: LinhaSistema; contas: ContaOpcao[]; pend: boolean; onSalvar: (a: { nome: string; limite_pct: number | null; contas: string[] | null }) => void }) {
  const [nome, setNome] = useState(l.nome);
  const [limite, setLimite] = useState(l.limite_pct ? String(l.limite_pct) : "");
  const [todas, setTodas] = useState(!l.contas);
  const [escolhidas, setEscolhidas] = useState<string[]>(l.contas ?? contas.map((c) => c.id));
  return (
    <form className="stack" style={{ padding: 18, gap: 16 }} onSubmit={(e) => { e.preventDefault(); onSalvar({ nome, limite_pct: limite ? Number(limite) : null, contas: todas ? null : escolhidas }); }}>
      <label className="field"><span className="label">Nome</span><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} /></label>
      <label className="field">
        <span className="label">Parar quando a janela de 5 h passar de (%)</span>
        <input className="input" type="number" min={1} max={100} step={1} value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="Sem limite" />
        <span className="subtle caption">Acima disso a conta não atende este sistema (o AdPilot continua usando). Ex.: 80 guarda 20% para você.</span>
      </label>
      <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 8 }}>Contas que podem atender</legend>
        <label className="cluster" style={{ gap: 8 }}><input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Todas (na ordem de prioridade)</label>
        {!todas && contas.map((c) => (
          <label key={c.id} className="cluster" style={{ gap: 8 }}>
            <input type="checkbox" checked={escolhidas.includes(c.id)} onChange={(e) => setEscolhidas(e.target.checked ? [...escolhidas, c.id] : escolhidas.filter((x) => x !== c.id))} />
            <ProviderLogo p={c.provider as "claude" | "codex"} size={20} /> {c.nome}{c.plano ? <span className="subtle"> · {c.plano}</span> : null}
          </label>
        ))}
      </fieldset>
      <div className="cluster" style={{ justifyContent: "flex-end" }}><button className="btn btn-primary btn-sm" disabled={pend}>Salvar</button></div>
    </form>
  );
}

/** Respostas por dia (30 dias), empilhadas por sistema. */
function Grafico({ linhas, porDia }: { linhas: LinhaSistema[]; porDia: DiaSistema[] }) {
  const dias = useMemo(() => {
    const hoje = new Date();
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(hoje); d.setDate(d.getDate() - 29 + i);
      const k = d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      return { k, partes: linhas.map((l) => porDia.find((x) => x.dia === k && x.id === l.id)?.n ?? 0) };
    });
  }, [linhas, porDia]);
  const max = Math.max(1, ...dias.map((d) => d.partes.reduce((a, b) => a + b, 0)));
  return (
    <div className="panel" data-enter>
      <div className="panel-head">
        <span className="panel-title">Respostas por dia · 30 dias</span>
        <div className="cluster" style={{ gap: 12 }}>
          {linhas.map((l, i) => <span key={l.id ?? "a"} className="subtle" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}><span className="sis-cor" style={{ background: cor(i) }} aria-hidden />{l.nome}</span>)}
        </div>
      </div>
      <div className="sis-grafico" role="img" aria-label="Respostas da IA por dia nos últimos 30 dias, por sistema">
        {dias.map((d, i) => {
          const soma = d.partes.reduce((a, b) => a + b, 0);
          return (
            <div key={d.k} className="sis-coluna" style={{ "--i": i } as CSSProperties} title={`${d.k.split("-").reverse().join("/")}: ${soma} resposta(s)\n${linhas.map((l, j) => d.partes[j] ? `${l.nome}: ${d.partes[j]}` : "").filter(Boolean).join("\n")}`}>
              <div className="sis-pilha" style={{ height: `${(soma / max) * 100}%` }}>
                {d.partes.map((n, j) => n ? <i key={j} style={{ flexGrow: n, background: cor(j) }} /> : null)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sis-eixo subtle"><span>30 dias atrás</span><span>hoje</span></div>
    </div>
  );
}

function PorConta({ linhas, porConta }: { linhas: LinhaSistema[]; porConta: ContaSistema[] }) {
  if (!porConta.length) return null;
  const nome = (id: string | null) => linhas.find((l) => l.id === id)?.nome ?? "Sistema removido";
  const idx = (id: string | null) => Math.max(0, linhas.findIndex((l) => l.id === id));
  return (
    <div className="panel" data-enter>
      <div className="panel-head"><span className="panel-title">Qual IA atendeu cada sistema · 30 dias</span></div>
      <div className="table-wrap" style={{ border: 0 }}>
        <table className="data">
          <thead><tr><th>Sistema</th><th>Conta</th><th>Plano</th><th className="num">Respostas</th><th className="num">Tokens</th><th className="num" title="Estimativa">Janela 5 h</th></tr></thead>
          <tbody>
            {porConta.map((c, i) => (
              <tr key={i}>
                <td><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span className="sis-cor" style={{ background: cor(idx(c.id)) }} aria-hidden />{nome(c.id)}</span></td>
                <td><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{c.provider && <ProviderLogo p={c.provider as "claude" | "codex"} size={20} />}{c.conta ?? "conta removida"}</span></td>
                <td>{c.plano ? <span className="badge">{c.plano}</span> : <span className="subtle">—</span>}</td>
                <td className="num">{int(c.n)}</td>
                <td className="num">{tokens(c.tokens)}</td>
                <td className="num">{c.pct ? `${c.pct.toFixed(1).replace(".", ",")}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
