"use client";

import { brl, nomeMes, somarMeses, type Geral as DadosGeral, type Pessoa } from "@domus-ads/core/financeiro";
import { gsap } from "gsap";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, CreditCard, Info, Landmark, Radio, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { entrar, reduzido } from "../motion/entrar";
import { usePulso } from "../shell/usePulso";
import { CartaoVisual } from "./Abas";
import { Barras, Medidor, Rosca } from "./graficos";
import { Insights } from "./Insights";
import { ABAS_GERAL, type AbaGeral } from "./lista-abas";
import { Colunas, Fonte, Relogio, Valor } from "./Receitas";

export interface ContaVG {
  id: string; tipo: "BANK" | "CREDIT"; pessoa: Pessoa; nome: string; detalhe: string; banco: string; cor: string | null; logo: string | null;
  saldo: number | null; limite: number | null; usado: number | null; fecha: number | null; vence: number | null; final: string | null; bandeira: string | null;
}
export interface DadosVG { mes: string; mesHoje: string; hoje: string; g: DadosGeral; contas: ContaVG[]; ultimaSync: string | null }

const PALETA = ["#b46cff", "#34d399", "#38bdf8", "#f472b6", "#fbbf24", "#a3e635", "#fb7185", "#22d3ee", "#c4b5fd", "#fdba74"];
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const outras = (xs: { nome: string; valor: number }[]) => xs.filter((x) => x.valor).map((x) => `${x.nome} ${brl(x.valor)}`).join(" · ");

/** Tudo junto: o dinheiro de todas as contas PF + PJ, em abas (saldos, cartões, saídas, entradas, análises), no visual da sala de receitas. */
export function Geral({ d, abaInicial }: { d: DadosVG; abaInicial: AbaGeral }) {
  const { g } = d;
  const router = useRouter();
  const [aba, setAbaEstado] = useState<AbaGeral>(abaInicial);
  const raiz = useRef<HTMLDivElement>(null);
  const corpo = useRef<HTMLDivElement>(null);
  const seletor = useRef<HTMLDivElement>(null);
  const pilula = useRef<HTMLSpanElement>(null);
  usePulso("financeiro", 60_000);

  const url = (mes: string, a: AbaGeral = aba) => `/financeiro/geral?mes=${mes.slice(0, 7)}&aba=${a}`;
  const setAba = (a: AbaGeral) => { setAbaEstado(a); window.history.replaceState(null, "", url(d.mes, a)); };
  const mesTxt = `${cap(nomeMes(d.mes))} ${d.mes.slice(0, 4)}`;
  const atual = d.mes === d.mesHoje;
  const proximo = somarMeses(d.mes, 1);
  const cor = (id: string) => PALETA[Math.max(0, d.contas.findIndex((c) => c.id === id)) % PALETA.length]!;
  const mov = (id: string) => g.mov.find((m) => m.contaId === id)!;
  const bancos = d.contas.filter((c) => c.tipo === "BANK");
  const cartoes = d.contas.filter((c) => c.tipo === "CREDIT");
  const porPessoa = (p: Pessoa, v: (c: ContaVG) => number) => d.contas.filter((c) => c.pessoa === p).reduce((a, c) => a + v(c), 0);
  const fatura = (id: string) => Math.max(0, mov(id).saiu);
  const faturas = cartoes.reduce((a, c) => a + fatura(c.id), 0);
  const saldoDe = (c: ContaVG) => (c.tipo === "BANK" ? c.saldo ?? 0 : 0);
  const dividaDe = (c: ContaVG) => g.dividas[c.id] ?? 0;

  const hud: Record<AbaGeral, { rot: string; valor: number; trio: [string, number][]; vs?: number }> = {
    saldos: { rot: "Dinheiro em conta agora", valor: g.saldo, trio: [["PF", porPessoa("PF", saldoDe)], ["PJ", porPessoa("PJ", saldoDe)], ["Patrimônio", g.patrimonio]] },
    cartoes: { rot: "Devido nos cartões agora", valor: g.divida, trio: [["PF", porPessoa("PF", dividaDe)], ["PJ", porPessoa("PJ", dividaDe)], [`Faturas de ${nomeMes(d.mes)}`, faturas]] },
    saidas: { rot: `Saiu em ${mesTxt}`, valor: g.saiu, vs: g.media3.saiu, trio: [["PF", porPessoa("PF", (c) => mov(c.id).saiu)], ["PJ", porPessoa("PJ", (c) => mov(c.id).saiu)], ["Média 3 meses", g.media3.saiu]] },
    entradas: { rot: `Entrou em ${mesTxt}`, valor: g.entrou, vs: g.media3.entrou, trio: [["PF", porPessoa("PF", (c) => mov(c.id).entrou)], ["PJ", porPessoa("PJ", (c) => mov(c.id).entrou)], ["Média 3 meses", g.media3.entrou]] },
    analises: { rot: `Resultado de ${mesTxt}`, valor: g.entrou - g.saiu, trio: [["Entrou", g.entrou], ["Saiu", g.saiu], ["Patrimônio", g.patrimonio]] },
  };
  const h = hud[aba];
  const v = h.vs ? (h.valor - h.vs) / h.vs : null;
  const inversa = aba === "saidas";

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    entrar(el.querySelectorAll("[data-enter]"), { y: 22 }, { stagger: 0.07 });
    if (reduzido()) return;
    const tl = gsap.timeline();
    tl.from(el.querySelector(".fin-rec-hud"), { y: 40, scale: 0.96, opacity: 0, duration: 0.9, ease: "expo.out", clearProps: "transform,opacity" }, 0.1)
      .from(el.querySelector(".fin-rec-hud-luz"), { scaleX: 0, duration: 1.1, ease: "expo.out", clearProps: "transform" }, 0.35);
    return () => { tl.progress(1).kill(); };
  }, []);
  // conteúdo da aba entra em cascata; pílula desliza até a aba
  useLayoutEffect(() => entrar(corpo.current?.querySelectorAll(":scope > *") ?? [], { y: 18 }, { stagger: 0.06 }), [aba]);
  useLayoutEffect(() => {
    const alvo = seletor.current?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!alvo || !pilula.current) return;
    const p = { x: alvo.offsetLeft, width: alvo.offsetWidth };
    if (reduzido()) gsap.set(pilula.current, p); else gsap.to(pilula.current, { ...p, duration: 0.45, ease: "expo.out" });
  }, [aba]);

  return (
    <div className="page fin fin-rec" ref={raiz}>
      <section className="fin-rec-sala">
        <div className="fin-rec-faixa" aria-hidden><i /><i /><i /></div>
        <header className="fin-rec-barra" data-enter>
          <Link href="/financeiro/receitas" className="fin-rec-voltar"><TrendingUp aria-hidden />Sala de receitas</Link>
          <div className="fin-rec-placa">
            <img src="/domus-logo.png" alt="" width={26} height={26} />
            <b>Domus</b>
          </div>
          <div className="fin-rec-controles">
            <div className="fin-rec-periodos" ref={seletor} role="tablist" aria-label="Áreas">
              <span className="fin-rec-periodos-pilula" ref={pilula} aria-hidden />
              {ABAS_GERAL.map(([a, l]) => <button key={a} role="tab" aria-current={aba === a} onClick={() => setAba(a)}>{l}</button>)}
            </div>
            <div className="fin-rec-nav">
              <Link href={url(somarMeses(d.mes, -1))} aria-label="Mês anterior"><ChevronLeft aria-hidden /></Link>
              <span>{nomeMes(d.mes).slice(0, 3)}/{d.mes.slice(2, 4)}</span>
              <Link href={url(proximo)} aria-label="Próximo mês" aria-disabled={proximo > d.mesHoje} data-off={proximo > d.mesHoje || undefined}><ChevronRight aria-hidden /></Link>
            </div>
            {!atual && <Link className="fin-rec-hoje" href={url(d.mesHoje)}>Hoje</Link>}
          </div>
        </header>

        <div className="fin-rec-cab" data-enter>
          <span className="fin-rec-sobre">Financeiro <i>✦</i> PF + PJ, todas as contas</span>
          <h1>Tudo junto</h1>
          <span className="fin-rec-hora"><Relogio /></span>
        </div>

        <div className="fin-rec-hud">
          <span className="fin-rec-hud-canto" aria-hidden /><span className="fin-rec-hud-canto" aria-hidden /><span className="fin-rec-hud-canto" aria-hidden /><span className="fin-rec-hud-canto" aria-hidden />
          <span className="fin-rec-hud-lado" aria-hidden /><span className="fin-rec-hud-lado" aria-hidden />
          <div className="fin-rec-hud-topo"><span>{h.rot}</span><span>Domus · {ABAS_GERAL.find(([a]) => a === aba)![1].toLowerCase()}</span></div>
          <div className="fin-rec-valor-grande tabular" data-neg={h.valor < 0 || undefined}>
            <em>R$</em><Valor v={h.valor / 100} />
          </div>
          <div className="fin-rec-hud-pe">
            <span className="fin-rec-auto" data-on={atual || undefined}><Radio aria-hidden />{d.ultimaSync ? `Bancos atualizados ${new Date(d.ultimaSync).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Bancos nunca sincronizados"}</span>
            {v != null && Number.isFinite(v) && <>
              <i aria-hidden />
              <span><b data-tom={(inversa ? v <= 0 : v >= 0) ? "bom" : "ruim"}>{v >= 0 ? "+" : "−"}{Math.abs(Math.round(v * 100))}%</b> vs média{atual && " (mês em andamento)"}</span>
            </>}
          </div>
          <div className="fin-rec-trio">
            {h.trio.map(([r, x]) => <span key={r}>{r} <b className="tabular">{brl(x)}</b></span>)}
          </div>
        </div>
        <span className="fin-rec-hud-luz" aria-hidden />
      </section>

      <div ref={corpo} className="fin-corpo" key={aba}>
        {aba === "saldos" && <>
          <div className="fin-rec-fontes">
            {bancos.map((c) => <Fonte key={c.id} nome={`${c.nome} · ${c.pessoa}`} valor={c.saldo ?? 0} cor={cor(c.id)} total={g.saldo} />)}
            {!bancos.length && <div className="empty">Nenhuma conta corrente. Conecte os bancos em <Link href="/financeiro/config">Configurações</Link>.</div>}
          </div>
          <div className="fin-grade-2 fin-grade-larga">
            <section className="panel fin-painel">
              <header className="panel-head"><span className="panel-title"><Landmark size={15} aria-hidden /> Contas</span><span className="caption subtle">Saldo somado: <b className="tabular">{brl(g.saldo)}</b></span></header>
              <ul className="fin-contas">
                {bancos.map((c) => (
                  <li key={c.id} style={{ "--cc": c.cor ?? cor(c.id) } as React.CSSProperties}>
                    {c.logo ? <img src={c.logo} alt="" width={34} height={34} /> : <span className="fin-contas-logo" aria-hidden>{(c.banco || "?").charAt(0)}</span>}
                    <span><b>{c.nome} · {c.pessoa}</b><small>{c.detalhe}</small></span>
                    <b className={`tabular ${(c.saldo ?? 0) < 0 ? "neg" : ""}`}>{c.saldo != null ? brl(c.saldo) : "—"}</b>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel fin-painel fin-centro">
              <Rosca fatias={bancos.filter((c) => (c.saldo ?? 0) > 0).map((c) => ({ nome: c.nome, valor: c.saldo!, cor: cor(c.id) }))} total={g.saldo} rotulo="Em conta" />
            </section>
          </div>
        </>}

        {aba === "cartoes" && <>
          <div className="fin-rec-fontes">
            {cartoes.map((c) => <Fonte key={c.id} nome={`${c.nome} · ${c.pessoa}`} valor={dividaDe(c)} cor={cor(c.id)} total={g.divida} sub={<small>Fatura de {nomeMes(d.mes)}: {brl(fatura(c.id))}</small>} />)}
            {!cartoes.length && <div className="empty">Nenhum cartão de crédito conectado.</div>}
          </div>
          {cartoes.length > 0 && (
            <section className="panel fin-painel">
              <header className="panel-head"><span className="panel-title"><CreditCard size={15} aria-hidden /> Cartões</span><span className="caption subtle">Dívida = limite usado (inclui parcelas futuras)</span></header>
              <div className="fin-cartoes">
                {cartoes.map((c) => (
                  <div key={c.id} className="fin-cartao-bloco">
                    <CartaoVisual nome={`${c.nome} · ${c.pessoa}`} banco={c.banco} cor={c.cor ?? "#7420e0"} final={c.final} bandeira={c.bandeira} />
                    <div className="fin-cartao-info">
                      {c.limite ? <Medidor fracao={(c.usado ?? 0) / c.limite} rotulo="do limite usado" sub={`${brl(c.usado ?? 0)} de ${brl(c.limite)}`} /> : null}
                      <dl>
                        <div><dt>Dívida total</dt><dd className="tabular">{brl(dividaDe(c))}</dd></div>
                        <div><dt>Fatura de {nomeMes(d.mes)}</dt><dd className="tabular">{brl(fatura(c.id))}</dd></div>
                        <div><dt>Fecha / vence</dt><dd>{c.fecha ?? "—"} / {c.vence ?? "—"}</dd></div>
                        <div><dt>Disponível</dt><dd className="tabular">{c.limite != null ? brl(c.limite - (c.usado ?? 0)) : "—"}</dd></div>
                      </dl>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>}

        {(aba === "saidas" || aba === "entradas") && <Fluxo saida={aba === "saidas"} d={d} cor={cor} ir={(m) => router.push(url(m))} />}

        {aba === "analises" && <>
          <div className="fin-rec-stats">
            <div className="fin-rec-stat"><small>Patrimônio líquido</small><b className="tabular">{brl(g.patrimonio)}</b><span>saldos − dívida dos cartões</span></div>
            <div className="fin-rec-stat"><small>Entrada média</small><b className="tabular">{brl(g.media3.entrou)}</b><span>por mês, últimos 3</span></div>
            <div className="fin-rec-stat"><small>Saída média</small><b className="tabular">{brl(g.media3.saiu)}</b><span>por mês, últimos 3</span></div>
          </div>
          <div className="fin-grade-2">
            <section className="panel fin-painel">
              <header className="panel-head"><span className="panel-title">O que chama atenção</span><span className="caption subtle">Calculado das contas, sem IA</span></header>
              <Insights itens={g.insights} />
            </section>
            <section className="panel fin-painel">
              <header className="panel-head"><span className="panel-title">Últimos 12 meses</span><span className="caption subtle">Entrou × saiu · linha = resultado</span></header>
              <Barras serie={g.serie} mesAtual={d.mes} onMes={(m) => router.push(url(m))} />
            </section>
          </div>
        </>}
      </div>
    </div>
  );
}

/** Saídas ou entradas do mês: cada conta e tudo junto; o que não conta (fatura, transferência…) aparece à parte. */
function Fluxo({ saida, d, cor, ir }: { saida: boolean; d: DadosVG; cor: (id: string) => string; ir: (mes: string) => void }) {
  const { g } = d;
  const total = saida ? g.saiu : g.entrou;
  const linhas = d.contas
    .map((c) => { const m = g.mov.find((x) => x.contaId === c.id)!; return { c, valor: saida ? m.saiu : m.entrou, fora: outras(saida ? m.outrasSaidas : m.outrasEntradas) }; })
    .filter((l) => l.valor || l.fora)
    .sort((a, b) => b.valor - a.valor);
  const nome = saida ? "Saídas" : "Entradas";
  return <>
    <div className="fin-rec-fontes">
      {linhas.map(({ c, valor, fora }) => (
        <Fonte key={c.id} nome={`${c.nome} · ${c.pessoa}${c.tipo === "CREDIT" ? " · cartão" : ""}`} valor={valor} cor={cor(c.id)} total={total}
          sub={<small title={fora || undefined}>{Math.round((valor / (total || 1)) * 100)}% do total{fora ? ` · fora: ${fora}` : ""}</small>} />
      ))}
      {!linhas.length && <div className="empty">Nada {saida ? "saiu" : "entrou"} em {nomeMes(d.mes)}.</div>}
    </div>
    <p className="fin-rec-nota" style={{ color: "rgb(var(--c-text-secondary))", background: "rgb(var(--c-bg-inset))", borderColor: "rgb(var(--c-border))" }}>
      <Info aria-hidden />
      {saida
        ? "Saída = gastos menos estornos. Pagar a fatura e mover dinheiro entre suas contas não contam de novo (aparecem como “fora”)."
        : <>Entrada = renda dos bancos. Retirada da PJ e transferências entre suas contas não contam (aparecem como “fora”). Vendas do site ainda sem crédito ficam na <Link href="/financeiro/receitas">Sala de receitas</Link>.</>}
    </p>
    <div className="fin-grade-2">
      <section className="panel fin-painel fin-centro">
        <Rosca fatias={linhas.filter((l) => l.valor > 0).map((l) => ({ nome: l.c.nome, valor: l.valor, cor: cor(l.c.id) }))} total={total} rotulo={nome} />
      </section>
      <section className="panel fin-painel">
        <header className="panel-head"><span className="panel-title">{nome} · 12 meses</span><span className="caption subtle">Clique para abrir o mês</span></header>
        <Colunas serie={g.serie.map((s) => ({ inicio: s.mes, valor: saida ? s.gastos : s.renda }))} periodo="mes" atual={d.mes} ir={ir} />
      </section>
    </div>
    <section className="panel fin-painel">
      <header className="panel-head"><span className="panel-title">{saida ? <ArrowUpRight size={15} aria-hidden /> : <ArrowDownLeft size={15} aria-hidden />} Por conta</span><span className="caption subtle">{brl(total)} em {nomeMes(d.mes)}</span></header>
      <ul className="fin-contas">
        {linhas.map(({ c, valor, fora }) => (
          <li key={c.id} style={{ "--cc": c.cor ?? cor(c.id) } as React.CSSProperties}>
            {c.logo ? <img src={c.logo} alt="" width={34} height={34} /> : <span className="fin-contas-logo" aria-hidden>{(c.banco || "?").charAt(0)}</span>}
            <span><b>{c.nome} · {c.pessoa}{c.tipo === "CREDIT" ? " · cartão" : ""}</b><small>{fora ? `Fora do total: ${fora}` : c.detalhe}</small></span>
            <b className="tabular">{brl(valor)}</b>
          </li>
        ))}
      </ul>
    </section>
  </>;
}
