"use client";

import { brl, nomeMes } from "@domus-ads/core/financeiro";
import { Bot, Check, CreditCard, EyeOff, Landmark, Repeat, Sparkles, Trash2, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { analisarComIA, removerAnalise, statusAssinatura } from "./actions";
import type { DadosFin } from "./Financeiro";
import { Medidor } from "./graficos";
import { Insights } from "./Insights";

export interface Analise { id: string; mes: string; pergunta: string | null; resposta: string | null; status: "gerando" | "pronta" | "erro"; erro: string | null; created_at: string }

const dia = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }) : "—");

/** Cartão com inclinação 3D que segue o mouse e brilho de vidro. */
function CartaoVisual({ nome, banco, cor, final, bandeira, children }: { nome: string; banco: string; cor: string; final: string | null; bandeira: string | null; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const mover = (e: React.MouseEvent) => {
    const el = ref.current!, b = el.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
    el.style.setProperty("--rx", `${-y * 14}deg`);
    el.style.setProperty("--ry", `${x * 18}deg`);
    el.style.setProperty("--gx", `${(x + 0.5) * 100}%`);
    el.style.setProperty("--gy", `${(y + 0.5) * 100}%`);
  };
  const sair = () => { ref.current!.style.setProperty("--rx", "0deg"); ref.current!.style.setProperty("--ry", "0deg"); };
  return (
    <div className="fin-cartao" ref={ref} onMouseMove={mover} onMouseLeave={sair} style={{ "--cc": cor } as React.CSSProperties}>
      <div className="fin-cartao-topo"><b>{banco}</b><span>{bandeira ?? ""}</span></div>
      <span className="fin-cartao-chip" aria-hidden />
      <div className="fin-cartao-num tabular">•••• •••• •••• {final ?? "••••"}</div>
      <div className="fin-cartao-nome">{nome}</div>
      {children}
    </div>
  );
}

export function Cartoes({ d }: { d: DadosFin }) {
  const cartoes = d.contas.filter((c) => c.tipo === "CREDIT" && !c.oculta);
  const contas = d.contas.filter((c) => c.tipo === "BANK" && !c.oculta);
  const fatura = (id: string) => d.txs.filter((t) => t.contaId === id && t.competencia === d.mes).reduce((a, t) => a + (t.natureza === "gasto" ? t.valor : t.natureza === "estorno" ? -t.valor : 0), 0);
  const saldoTotal = contas.reduce((a, c) => a + (c.saldo ?? 0), 0);
  return (
    <>
      {cartoes.length > 0 && (
        <section className="panel fin-painel">
          <header className="panel-head"><span className="panel-title"><CreditCard size={15} aria-hidden /> Cartões de crédito</span>
            <span className="caption subtle">Fatura de {nomeMes(d.mes)} e limite</span></header>
          <div className="fin-cartoes">
            {cartoes.map((c) => {
              const f = fatura(c.id);
              return (
                <div key={c.id} className="fin-cartao-bloco">
                  <CartaoVisual nome={c.apelido || c.nome} banco={c.banco ?? ""} cor={c.banco_cor ?? "#7420e0"} final={c.numero?.slice(-4) ?? null} bandeira={c.bandeira} />
                  <div className="fin-cartao-info">
                    {c.limite ? <Medidor fracao={(c.limite_usado ?? 0) / c.limite} rotulo="do limite usado" sub={`${brl(c.limite_usado ?? 0)} de ${brl(c.limite)}`} /> : null}
                    <dl>
                      <div><dt>Fatura do mês</dt><dd className="tabular">{brl(f)}</dd></div>
                      <div><dt>Fecha dia</dt><dd>{c.dia_fechamento ?? "—"}</dd></div>
                      <div><dt>Vence dia</dt><dd>{c.dia_vencimento ?? "—"}</dd></div>
                      <div><dt>Disponível</dt><dd className="tabular">{c.limite != null ? brl(c.limite - (c.limite_usado ?? 0)) : "—"}</dd></div>
                    </dl>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <section className="panel fin-painel">
        <header className="panel-head"><span className="panel-title"><Landmark size={15} aria-hidden /> Contas</span>
          <span className="caption subtle">Saldo somado: <b className="tabular">{brl(saldoTotal)}</b></span></header>
        <ul className="fin-contas">
          {contas.map((c) => (
            <li key={c.id} style={{ "--cc": c.banco_cor ?? "#7420e0" } as React.CSSProperties}>
              {c.banco_logo ? <img src={c.banco_logo} alt="" width={34} height={34} /> : <span className="fin-contas-logo" aria-hidden>{(c.banco ?? "?").charAt(0)}</span>}
              <span><b>{c.apelido || c.banco}</b><small>{c.nome}{c.numero ? ` · ${c.numero}` : ""}</small></span>
              <b className={`tabular ${(c.saldo ?? 0) < 0 ? "neg" : ""}`}>{c.saldo != null ? brl(c.saldo) : "—"}</b>
            </li>
          ))}
          {!contas.length && <li className="subtle">Nenhuma conta corrente nesta aba.</li>}
        </ul>
      </section>
    </>
  );
}

export function Assinaturas({ d }: { d: DadosFin }) {
  const [indo, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const confirmadas = d.assinaturas.filter((a) => a.status === "confirmada");
  const sugeridas = d.assinaturas.filter((a) => a.status === "sugerida");
  const ignoradas = d.assinaturas.filter((a) => a.status === "ignorada");
  const mensal = confirmadas.reduce((s, a) => s + a.valor_ultimo, 0);
  const cor = (id: number | null) => d.categorias.find((c) => c.id === id)?.cor ?? "#a855ff";
  const mudar = (id: number, s: string) => start(async () => { const r = await statusAssinatura(id, s); setErro(r.ok ? null : r.error); });

  const Tile = ({ a }: { a: (typeof d.assinaturas)[number] }) => {
    const subiu = a.valor_ultimo > a.valor_medio * 1.05;
    return (
      <div className="fin-assin" data-status={a.status} style={{ "--ac": cor(a.categoria_id) } as React.CSSProperties}>
        <span className="fin-assin-ico" aria-hidden>{a.nome.trim().charAt(0).toUpperCase()}</span>
        <b className="fin-assin-nome">{a.nome}</b>
        <span className="fin-assin-valor tabular">{brl(a.valor_ultimo)}<small>/mês</small></span>
        <small className="fin-assin-meta">
          {a.dia_cobranca ? `todo dia ${a.dia_cobranca}` : ""} · {a.ocorrencias}× desde {dia(a.primeira)}
          {subiu && <em> · subiu de {brl(a.valor_medio)}</em>}
        </small>
        <span className="fin-assin-acoes">
          {a.status !== "confirmada" && <button className="btn btn-secondary btn-sm" disabled={indo} onClick={() => mudar(a.id, "confirmada")}><Check aria-hidden />É assinatura</button>}
          {a.status !== "ignorada" && <button className="btn btn-ghost btn-sm" disabled={indo} onClick={() => mudar(a.id, "ignorada")} aria-label={`Ignorar ${a.nome}`}><EyeOff aria-hidden />{a.status === "sugerida" ? "Não é" : ""}</button>}
          {a.status === "ignorada" && <button className="btn btn-ghost btn-sm" disabled={indo} onClick={() => mudar(a.id, "sugerida")}>Restaurar</button>}
        </span>
      </div>
    );
  };

  return (
    <>
      {erro && <p className="fin-aviso" role="alert">{erro}</p>}
      <div className="fin-kpis fin-kpis-3">
        <div className="fin-kpi"><span className="fin-kpi-rot"><Repeat size={14} aria-hidden />Por mês</span><b className="tabular">{brl(mensal)}</b></div>
        <div className="fin-kpi"><span className="fin-kpi-rot">Por ano</span><b className="tabular">{brl(mensal * 12)}</b></div>
        <div className="fin-kpi"><span className="fin-kpi-rot">Assinaturas ativas</span><b className="tabular">{confirmadas.length}</b></div>
      </div>
      {sugeridas.length > 0 && (
        <section className="panel fin-painel">
          <header className="panel-head"><span className="panel-title"><Sparkles size={15} aria-hidden /> Parecem assinatura</span>
            <span className="caption subtle">Cobranças que se repetem todo mês: confirme ou descarte</span></header>
          <div className="fin-assins">{sugeridas.map((a) => <Tile key={a.id} a={a} />)}</div>
        </section>
      )}
      <section className="panel fin-painel">
        <header className="panel-head"><span className="panel-title">Suas assinaturas</span><span className="caption subtle">Marque outras em Gastos → abrir lançamento → É assinatura</span></header>
        {confirmadas.length ? <div className="fin-assins">{confirmadas.map((a) => <Tile key={a.id} a={a} />)}</div> : <div className="empty">Nenhuma confirmada ainda.</div>}
      </section>
      {ignoradas.length > 0 && (
        <details className="panel fin-painel fin-ignoradas">
          <summary className="panel-head"><span className="panel-title">Ignoradas ({ignoradas.length})</span></summary>
          <div className="fin-assins">{ignoradas.map((a) => <Tile key={a.id} a={a} />)}</div>
        </details>
      )}
    </>
  );
}

export function Parcelados({ d }: { d: DadosFin }) {
  const abertos = d.parcelados.filter((p) => p.restantes > 0);
  const quitados = d.parcelados.filter((p) => p.restantes === 0).slice(0, 12);
  const max = Math.max(1, ...d.futuro.map((f) => f.valor));
  const totalRestante = abertos.reduce((a, p) => a + p.valorRestante, 0);
  return (
    <>
      <div className="fin-kpis fin-kpis-3">
        <div className="fin-kpi"><span className="fin-kpi-rot">Ainda a pagar</span><b className="tabular">{brl(totalRestante)}</b></div>
        <div className="fin-kpi"><span className="fin-kpi-rot">Próxima fatura</span><b className="tabular">{brl(d.futuro[0]?.valor ?? 0)}</b></div>
        <div className="fin-kpi"><span className="fin-kpi-rot">Compras parceladas</span><b className="tabular">{abertos.length}</b></div>
      </div>
      <section className="panel fin-painel">
        <header className="panel-head"><span className="panel-title">Já comprometido nas próximas faturas</span><span className="caption subtle">Só parcelas, sem os gastos novos</span></header>
        <div className="fin-futuro">
          {d.futuro.map((f, i) => (
            <div key={f.mes} className="fin-futuro-col" title={`${nomeMes(f.mes)}: ${brl(f.valor)}`}>
              <span className="fin-futuro-v tabular">{f.valor ? brl(f.valor).replace(/,\d+$/, "") : ""}</span>
              <span className="fin-futuro-barra" style={{ height: `${(f.valor / max) * 100}%`, "--i": i } as React.CSSProperties} />
              <small>{nomeMes(f.mes).slice(0, 3)}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="panel fin-painel">
        <header className="panel-head"><span className="panel-title">Em aberto</span><span className="caption subtle">Maior saldo devedor primeiro</span></header>
        <ul className="fin-parcelas">
          {abertos.map((p) => (
            <li key={p.chave}>
              <span className="fin-parcelas-txt"><b>{p.descricao}</b><small>{p.categoria ?? "Sem categoria"} · comprado {dia(p.compraEm)} · termina {nomeMes(p.fim).slice(0, 3)}/{p.fim.slice(2, 4)}</small></span>
              <span className="fin-parcelas-prog">
                <span className="fin-parcelas-pontos" aria-label={`${p.pagas} de ${p.total} pagas`}>
                  {Array.from({ length: Math.min(p.total, 24) }, (_, i) => <i key={i} data-paga={i < p.pagas || undefined} />)}
                </span>
                <small className="tabular">{p.pagas}/{p.total} · {brl(p.valorParcela)}/mês</small>
              </span>
              <b className="tabular">{brl(p.valorRestante)}</b>
            </li>
          ))}
          {!abertos.length && <li className="subtle">Nenhuma compra parcelada em aberto. 🎉</li>}
        </ul>
        {quitados.length > 0 && <p className="caption subtle" style={{ padding: "0 18px 16px" }}>Quitados recentemente: {quitados.map((p) => p.descricao).join(", ")}</p>}
      </section>
    </>
  );
}

export function Analises({ d }: { d: DadosFin }) {
  const [pergunta, setPergunta] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [indo, start] = useTransition();
  const gerando = d.analises.some((a) => a.status === "gerando");
  const pedir = () => start(async () => {
    const r = await analisarComIA({ pessoa: d.pessoa, mes: d.mes, pergunta: pergunta.trim() || undefined });
    setErro(r.ok ? null : r.error);
    if (r.ok) setPergunta("");
  });
  const SUGESTOES = d.pessoa === "PJ"
    ? ["Quanto posso retirar por mês com segurança?", "Meus impostos estão proporcionais à receita?", "Como reduzir custos fixos da empresa?"]
    : ["Onde dá para cortar R$ 500 por mês?", "Quanto gastei com a Juju e é sustentável?", "Monte um orçamento para o próximo mês"];
  return (
    <div className="fin-grade-2 fin-grade-larga">
      <section className="panel fin-painel">
        <header className="panel-head"><span className="panel-title">Análise automática</span><span className="caption subtle">Calculada por código a cada visita</span></header>
        <Insights itens={d.insights} />
      </section>
      <section className="panel fin-painel fin-ia">
        <header className="panel-head"><span className="panel-title"><Bot size={15} aria-hidden /> Analisar com IA</span><span className="caption subtle">Vai o resumo do mês, sem nomes de banco nem números de conta</span></header>
        <div className="fin-ia-form">
          <textarea className="input" rows={3} maxLength={1000} value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Pergunte algo (opcional) ou peça a análise completa do mês" />
          <div className="fin-ia-sug">{SUGESTOES.map((s) => <button key={s} className="chip" onClick={() => setPergunta(s)}>{s}</button>)}</div>
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            {!d.iaPronta ? <span className="caption subtle">Conecte uma conta de IA em Configurações.</span> : <span className="caption subtle">Roda no worker com sua assinatura de IA.</span>}
            <button className="btn btn-primary btn-sm" disabled={indo || gerando || !d.iaPronta} onClick={pedir}><Sparkles aria-hidden />{gerando ? "Analisando…" : "Analisar " + nomeMes(d.mes)}</button>
          </div>
          {erro && <p className="fin-aviso" role="alert">{erro}</p>}
        </div>
        <div className="fin-ia-lista">
          {d.analises.map((a) => (
            <article key={a.id} className="fin-ia-item" data-status={a.status}>
              <header>
                <span><b>{nomeMes(a.mes).replace(/^./, (c) => c.toUpperCase())}/{a.mes.slice(2, 4)}</b>{a.pergunta ? ` · “${a.pergunta}”` : " · análise completa"}</span>
                <span className="cluster" style={{ gap: 6 }}>
                  <small>{new Date(a.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
                  <button className="btn btn-ghost btn-sm" aria-label="Apagar análise" onClick={() => start(async () => { await removerAnalise(a.id); })}><Trash2 aria-hidden /></button>
                </span>
              </header>
              {a.status === "gerando" && <div className="fin-ia-gerando"><span className="spinner-dots"><i /><i /><i /></span> A IA está lendo seus números…</div>}
              {a.status === "erro" && <p className="fin-aviso"><X aria-hidden />{a.erro}</p>}
              {a.resposta && <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{a.resposta}</ReactMarkdown></div>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

