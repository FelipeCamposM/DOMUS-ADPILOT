"use client";

import type { Assinatura, Categoria, Conexao, Conta, Etiqueta } from "@domus-ads/core/financeiro-db";
import { brl, nomeMes, somarMeses, type Insight, type Parcelado, type Pessoa, type Resumo } from "@domus-ads/core/financeiro";
import { gsap } from "gsap";
import { ArrowDownRight, ArrowUpRight, Briefcase, ChevronLeft, ChevronRight, RefreshCw, Settings2, User, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { CountUp } from "../motion/CountUp";
import { entrar, reduzido } from "../motion/entrar";
import { HeroFx } from "../shell/HeroFx";
import { usePulso } from "../shell/usePulso";
import { sincronizar } from "./actions";
import { ABAS, type Aba } from "./lista-abas";
import { Analises, Assinaturas, Cartoes, Parcelados, type Analise } from "./Abas";
import { Barras, Calor, Enche, Onda, Rosca } from "./graficos";
import { Insights } from "./Insights";
import { Transacoes, type TxFin } from "./Transacoes";

export interface DadosFin {
  pessoa: Pessoa; mes: string; mesHoje: string;
  resumo: Resumo; anterior: Resumo; media3: number; mediaCat: Record<string, number>;
  serie: { mes: string; renda: number; gastos: number; saldo: number }[];
  insights: Insight[]; futuro: { mes: string; valor: number }[];
  txs: TxFin[]; contas: Conta[]; categorias: Categoria[]; etiquetas: Etiqueta[]; assinaturas: Assinatura[]; parcelados: Parcelado[];
  conexoes: Conexao[]; analises: Analise[]; sincronizando: boolean; iaPronta: boolean;
}


const variacao = (a: number, b: number) => (b > 0 ? (a - b) / b : null);

export function Financeiro({ d, abaInicial }: { d: DadosFin; abaInicial: Aba }) {
  const [aba, setAbaEstado] = useState<Aba>(abaInicial);
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [indo, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const corpo = useRef<HTMLDivElement>(null);
  const abasRef = useRef<HTMLDivElement>(null);
  const pilula = useRef<HTMLSpanElement>(null);
  const gerando = d.analises.some((a) => a.status === "gerando");
  usePulso("financeiro", d.sincronizando || gerando ? 4000 : 30_000);

  const url = (o: { mes?: string; aba?: Aba }) => {
    const q = new URLSearchParams(sp.toString());
    if (o.mes) q.set("mes", o.mes.slice(0, 7));
    if (o.aba) q.set("aba", o.aba);
    return `${path}?${q}`;
  };
  const setAba = (a: Aba) => { setAbaEstado(a); window.history.replaceState(null, "", url({ aba: a })); };

  // pílula das abas desliza até a aba ativa
  useLayoutEffect(() => {
    const alvo = abasRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!alvo || !pilula.current) return;
    const v = { x: alvo.offsetLeft, width: alvo.offsetWidth };
    if (reduzido()) gsap.set(pilula.current, v); else gsap.to(pilula.current, { ...v, duration: 0.5, ease: "expo.out" });
  }, [aba]);
  // conteúdo da aba entra em cascata
  useLayoutEffect(() => entrar(corpo.current?.querySelectorAll(":scope > *") ?? [], { y: 18 }, { stagger: 0.06 }), [aba, d.mes]);

  const r = d.resumo;
  const pj = d.pessoa === "PJ";
  const proximo = somarMeses(d.mes, 1);
  const ultimaSync = d.conexoes.map((c) => c.ultima_sync).filter(Boolean).sort().at(-1);
  const comErro = d.conexoes.filter((c) => c.erro);

  return (
    <div className="page fin" data-pessoa={d.pessoa}>
      <div className="page-head fin-topo">
        <HeroFx />
        <div className="fin-topo-txt">
          <span className="eyebrow" data-enter>{pj ? <Briefcase aria-hidden /> : <User aria-hidden />} Financeiro · {pj ? "Pessoa jurídica" : "Pessoa física"}</span>
          <h1 className="page-title" data-enter>{nomeMes(d.mes).replace(/^./, (c) => c.toUpperCase())} <span className="fin-ano">{d.mes.slice(0, 4)}</span></h1>
          <div className="fin-saldo-hero" data-enter>
            <small>Saldo do mês</small>
            <b className="tabular" data-neg={r.saldo < 0 || undefined}><CountUp value={r.saldo / 100} kind="money" /></b>
            <span>{pj ? "Receita" : "Renda"} <CountUp value={r.renda / 100} kind="money" /> · Gastos <CountUp value={r.gastos / 100} kind="money" /></span>
          </div>
        </div>
        <div className="fin-topo-acoes" data-enter>
          <div className="fin-mes">
            <Link className="btn btn-ghost btn-sm" href={url({ mes: somarMeses(d.mes, -1) })} aria-label="Mês anterior"><ChevronLeft aria-hidden /></Link>
            <span>{nomeMes(d.mes).slice(0, 3)}/{d.mes.slice(2, 4)}</span>
            <Link className="btn btn-ghost btn-sm" href={url({ mes: proximo })} aria-label="Próximo mês" aria-disabled={proximo > somarMeses(d.mesHoje, 1)}
              style={proximo > somarMeses(d.mesHoje, 1) ? { pointerEvents: "none", opacity: 0.4 } : undefined}><ChevronRight aria-hidden /></Link>
            {d.mes !== d.mesHoje && <Link className="fin-hoje" href={url({ mes: d.mesHoje })}>hoje</Link>}
          </div>
          <button className="btn btn-primary btn-sm" disabled={indo || d.sincronizando} onClick={() => start(async () => { const x = await sincronizar(); setErro(x.ok ? null : x.error); if (x.ok) router.refresh(); })}>
            <RefreshCw aria-hidden className={d.sincronizando ? "fin-gira" : undefined} />{d.sincronizando ? "Sincronizando…" : "Sincronizar"}
          </button>
          <span className="fin-sync caption">{ultimaSync ? `Atualizado ${new Date(ultimaSync).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Nunca sincronizado"}</span>
        </div>
        <Onda valores={d.serie.map((s) => s.saldo)} />
      </div>

      {erro && <p className="fin-aviso" role="alert">{erro}</p>}
      {comErro.map((c) => <p key={c.item_id} className="fin-aviso">{c.banco ?? "Banco"}: {c.erro} <Link href="/financeiro/config">Ver conexões</Link></p>)}
      {!d.conexoes.length && (
        <div className="empty panel">
          <span className="icon-tile"><Wallet aria-hidden /></span>
          <b>Nenhum banco conectado</b>
          <span>Cole o Item ID de cada conexão da Pluggy em Configurações e sincronize.</span>
          <Link className="btn btn-primary btn-sm" href="/financeiro/config"><Settings2 aria-hidden />Conectar bancos</Link>
        </div>
      )}

      <div className="fin-abas" role="tablist" aria-label="Áreas do financeiro" ref={abasRef}>
        <span className="fin-abas-pilula" ref={pilula} aria-hidden />
        {ABAS.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={aba === v} onClick={() => setAba(v)}>
            {l}
            {v === "analises" && d.insights.filter((i) => i.nivel === "alerta").length > 0 && <span className="fin-abas-n">{d.insights.filter((i) => i.nivel === "alerta").length}</span>}
            {v === "assinaturas" && d.assinaturas.some((a) => a.status === "sugerida") && <span className="fin-abas-n" data-tom="info">{d.assinaturas.filter((a) => a.status === "sugerida").length}</span>}
          </button>
        ))}
      </div>

      <div ref={corpo} className="fin-corpo" key={aba}>
        {aba === "geral" && <Geral d={d} irMes={(m) => router.push(url({ mes: m }))} irAba={setAba} />}
        {aba === "gastos" && <Gastos d={d} />}
        {aba === "rendas" && <Rendas d={d} />}
        {aba === "cartoes" && <Cartoes d={d} />}
        {aba === "assinaturas" && <Assinaturas d={d} />}
        {aba === "parcelados" && <Parcelados d={d} />}
        {aba === "analises" && <Analises d={d} />}
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor, antes, inverso, kind = "money", icone }: { rotulo: string; valor: number | null; antes?: number | null; inverso?: boolean; kind?: "money" | "pct"; icone?: React.ReactNode }) {
  const v = valor != null && antes != null ? variacao(valor, antes) : null;
  const ruim = v != null && (inverso ? v > 0.05 : v < -0.05);
  const bom = v != null && (inverso ? v < -0.05 : v > 0.05);
  const ref = useRef<HTMLDivElement>(null);
  // brilho segue o mouse
  const mover = (e: React.MouseEvent) => {
    const b = ref.current!.getBoundingClientRect();
    ref.current!.style.setProperty("--mx", `${e.clientX - b.left}px`);
    ref.current!.style.setProperty("--my", `${e.clientY - b.top}px`);
  };
  return (
    <div className="fin-kpi" ref={ref} onMouseMove={mover}>
      <span className="fin-kpi-rot">{icone}{rotulo}</span>
      <b className="tabular">{valor == null ? "—" : <CountUp value={kind === "money" ? valor / 100 : valor} kind={kind} />}</b>
      {v != null && Number.isFinite(v) && (
        <span className="fin-kpi-var" data-tom={ruim ? "ruim" : bom ? "bom" : undefined}>
          {v >= 0 ? <ArrowUpRight aria-hidden /> : <ArrowDownRight aria-hidden />}{Math.abs(Math.round(v * 100))}% vs mês anterior
        </span>
      )}
    </div>
  );
}

function Geral({ d, irMes, irAba }: { d: DadosFin; irMes: (m: string) => void; irAba: (a: Aba) => void }) {
  const r = d.resumo;
  const cor = (nome: string) => d.categorias.find((c) => c.nome === nome)?.cor ?? "#6b6480";
  const assin = d.assinaturas.filter((a) => a.status === "confirmada").reduce((s, a) => s + a.valor_ultimo, 0);
  const parcelasMes = d.parcelados.filter((p) => p.inicio <= d.mes && p.fim >= d.mes).reduce((s, p) => s + p.valorParcela, 0);
  return (
    <>
      <div className="fin-kpis">
        <Kpi rotulo={d.pessoa === "PJ" ? "Receita" : "Renda"} valor={r.renda} antes={d.anterior.renda} />
        <Kpi rotulo="Gastos" valor={r.gastos} antes={d.anterior.gastos} inverso />
        <Kpi rotulo="Taxa de poupança" valor={r.poupanca} antes={d.anterior.poupanca} kind="pct" />
        <Kpi rotulo="Assinaturas / mês" valor={assin} />
        <Kpi rotulo="Parcelas no mês" valor={parcelasMes} />
        <Kpi rotulo="Juros e tarifas" valor={r.encargos} antes={d.anterior.encargos} inverso />
      </div>

      <section className="panel fin-painel">
        <header className="panel-head"><span className="panel-title">Últimos 12 meses</span><span className="caption subtle">Clique num mês para abrir · linha = saldo</span></header>
        <Barras serie={d.serie} mesAtual={d.mes} onMes={irMes} />
      </section>

      <div className="fin-grade-2">
        <section className="panel fin-painel">
          <header className="panel-head"><span className="panel-title">Para onde foi o dinheiro</span>
            <button className="btn btn-ghost btn-sm" onClick={() => irAba("gastos")}>Ver gastos</button></header>
          {r.porCategoria.length ? (
            <div className="fin-rosca-bloco">
              <Rosca fatias={r.porCategoria.slice(0, 9).map((c) => ({ ...c, cor: cor(c.nome) }))} total={r.gastos} rotulo="Gastos" />
              <ul className="fin-legenda">
                {r.porCategoria.slice(0, 8).map((c) => (
                  <li key={c.nome}><i style={{ background: cor(c.nome) }} />{c.nome}<b className="tabular">{brl(c.valor)}</b></li>
                ))}
              </ul>
            </div>
          ) : <div className="empty">Sem gastos neste mês.</div>}
        </section>
        <section className="panel fin-painel">
          <header className="panel-head"><span className="panel-title">Calendário de gastos</span>
            <span className="caption subtle">{r.maior ? `Maior: ${r.maior.merchant || r.maior.descricao} ${brl(r.maior.valor)}` : ""}</span></header>
          <Calor porDia={r.porDia} mes={d.mes} />
        </section>
      </div>

      <div className="fin-grade-2">
        <section className="panel fin-painel">
          <header className="panel-head"><span className="panel-title">O que o código achou</span>
            <button className="btn btn-ghost btn-sm" onClick={() => irAba("analises")}>Todas e IA</button></header>
          <Insights itens={d.insights.slice(0, 5)} />
        </section>
        <section className="panel fin-painel">
          <header className="panel-head"><span className="panel-title">Onde mais gastou</span><span className="caption subtle">Por loja</span></header>
          <ul className="fin-ranking">
            {r.topComerciantes.map((c, i) => (
              <li key={c.nome}>
                <span className="fin-ranking-n">{i + 1}</span>
                <span className="fin-ranking-txt"><b>{c.nome}</b><small>{c.vezes}× no mês</small><Enche fracao={c.valor / (r.topComerciantes[0]?.valor || 1)} /></span>
                <b className="tabular">{brl(c.valor)}</b>
              </li>
            ))}
            {!r.topComerciantes.length && <li className="subtle">Nada ainda.</li>}
          </ul>
          {r.porEtiqueta.length > 0 && (
            <div className="fin-etq-totais">
              {r.porEtiqueta.map((e) => {
                const x = d.etiquetas.find((y) => y.nome === e.nome);
                return <span key={e.nome} className="fin-etq-total" style={{ "--etq": x?.cor ?? "#e879f9" } as React.CSSProperties}>{x?.emoji} {e.nome}<b className="tabular">{brl(e.valor)}</b></span>;
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Gastos({ d }: { d: DadosFin }) {
  const r = d.resumo;
  // média dos 3 meses anteriores por categoria (para "acima do normal")
  const cats = r.porCategoria.map((c) => {
    const cat = d.categorias.find((x) => x.nome === c.nome);
    return { ...c, cor: cat?.cor ?? "#6b6480", orcamento: cat?.orcamento ?? null, media: d.mediaCat[c.nome] ?? null };
  });
  const max = cats[0]?.valor ?? 1;
  return (
    <>
      <div className="fin-grade-2 fin-grade-larga">
        <section className="panel fin-painel">
          <header className="panel-head"><span className="panel-title">Por categoria</span>
            <span className="caption subtle">Média de 3 meses: {brl(d.media3)}</span></header>
          <ul className="fin-cats">
            {cats.map((c) => {
              const estourou = c.orcamento != null && c.valor > c.orcamento;
              return (
                <li key={c.nome}>
                  <span className="fin-cats-nome"><i style={{ background: c.cor }} />{c.nome}</span>
                  <Enche fracao={c.orcamento ? c.valor / c.orcamento : c.valor / max} cor={c.cor} alerta={estourou} />
                  <span className="fin-cats-val tabular"><b>{brl(c.valor)}</b>{c.orcamento != null ? <small data-alerta={estourou || undefined}>de {brl(c.orcamento)}</small>
                    : c.media ? <small data-alerta={c.valor > c.media * 1.3 || undefined}>média {brl(c.media)}</small> : null}</span>
                </li>
              );
            })}
            {!cats.length && <li className="subtle">Sem gastos neste mês.</li>}
          </ul>
        </section>
        <section className="panel fin-painel fin-centro">
          <Rosca fatias={cats.slice(0, 10)} total={r.gastos} rotulo="Gastos do mês" />
          {r.estornos > 0 && <p className="caption subtle">Inclui {brl(r.estornos)} de estornos abatidos.</p>}
        </section>
      </div>
      <section className="panel fin-painel">
        <header className="panel-head"><span className="panel-title">Lançamentos</span><span className="caption subtle">Clique para categorizar, etiquetar (ex.: Juju) ou criar regra</span></header>
        <Transacoes txs={d.txs} categorias={d.categorias} etiquetas={d.etiquetas} contas={d.contas} naturezas={["gasto", "estorno", "fatura", "transferencia", "investimento", "ignorado"]} vazio="Nenhum gasto neste mês." />
      </section>
    </>
  );
}

function Rendas({ d }: { d: DadosFin }) {
  const r = d.resumo;
  const cor = (nome: string) => d.categorias.find((c) => c.nome === nome)?.cor ?? "#34d399";
  const pj = d.pessoa === "PJ";
  return (
    <>
      <div className="fin-grade-2 fin-grade-larga">
        <section className="panel fin-painel">
          <header className="panel-head"><span className="panel-title">{pj ? "Receita por fonte" : "Renda por fonte"}</span><span className="caption subtle">{brl(r.renda)} no mês</span></header>
          <ul className="fin-cats">
            {r.rendaPorCategoria.map((c) => (
              <li key={c.nome}>
                <span className="fin-cats-nome"><i style={{ background: cor(c.nome) }} />{c.nome}</span>
                <Enche fracao={c.valor / (r.rendaPorCategoria[0]?.valor || 1)} cor={cor(c.nome)} />
                <span className="fin-cats-val tabular"><b>{brl(c.valor)}</b><small>{Math.round((c.valor / (r.renda || 1)) * 100)}%</small></span>
              </li>
            ))}
            {!r.rendaPorCategoria.length && <li className="subtle">Nenhuma entrada neste mês.</li>}
          </ul>
        </section>
        <section className="panel fin-painel fin-centro">
          <Rosca fatias={r.rendaPorCategoria.map((c) => ({ ...c, cor: cor(c.nome) }))} total={r.renda} rotulo={pj ? "Receita" : "Renda"} />
        </section>
      </div>
      <section className="panel fin-painel">
        <header className="panel-head"><span className="panel-title">Entradas</span><span className="caption subtle">Transferências entre suas contas não contam como renda</span></header>
        <Transacoes txs={d.txs.filter((t) => t.tipo === "credito")} categorias={d.categorias} etiquetas={d.etiquetas} contas={d.contas} vazio="Nenhuma entrada neste mês." />
      </section>
    </>
  );
}
