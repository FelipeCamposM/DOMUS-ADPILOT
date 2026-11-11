"use client";

import { andarPeriodo, brl, inicioPeriodo, nomeMes, type PeriodoRec, type Receita, type ResumoReceitas } from "@domus-ads/core/financeiro";
import { gsap } from "gsap";
import { ArrowLeft, Building2, ChevronDown, ChevronLeft, ChevronRight, EyeOff, Globe, Landmark, Link2, Loader2, Radio, RotateCcw, Timer, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { CountUp } from "../motion/CountUp";
import { entrar, reduzido } from "../motion/entrar";
import { toast } from "../shell/toast";
import { usePulso } from "../shell/usePulso";
import { classificar } from "./actions";
import { Enche, Rosca } from "./graficos";

export type ReceitaNota = Receita & { nota: string | null };
export interface DadosReceitas {
  hoje: string; r: ResumoReceitas; anterior: number; media: number; desconsideradas: ReceitaNota[]; anteriores: { data: string; valor: number }[];
  notas: Record<string, string>; cores: Record<string, string>; contas: Record<string, string>; ultimaSync: string | null;
}

const ROXO = "#b46cff";
const PERIODOS: [PeriodoRec, string][] = [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]];
const NOME_PERIODO: Record<PeriodoRec, string> = { dia: "dia", semana: "semana", mes: "mês" };
const ORIGEM: Record<Receita["origem"], { rotulo: string; icone: typeof Globe; dica: string }> = {
  banco: { rotulo: "Banco", icone: Landmark, dica: "Entrada no extrato" },
  site: { rotulo: "Site · a liberar", icone: Timer, dica: "Venda paga no site; o dinheiro ainda não apareceu no banco" },
  conciliada: { rotulo: "Site + banco", icone: Link2, dica: "Venda do site e crédito no banco: a mesma receita, contada uma vez" },
};
const MOTIVOS = ["Metade de uma compra", "Reembolso", "Dinheiro de outra pessoa", "Transferência entre contas"];
const SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const COMPACTO = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dmy = (d: string) => `${dm(d)}/${d.slice(0, 4)}`;
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const difDias = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 864e5);
function rotulos(p: PeriodoRec, inicio: string, fim: string, hoje: string) {
  const atual = inicio === inicioPeriodo(p, hoje);
  const mes = `${cap(nomeMes(inicio))} ${inicio.slice(0, 4)}`;
  if (p === "dia") return { titulo: atual ? "Receitas hoje" : `Receitas de ${dm(inicio)}`, curto: dm(inicio), agora: atual ? "Hoje" : dm(inicio), antes: atual ? "Ontem" : "Dia anterior", vs: "ontem" };
  if (p === "semana") return { titulo: atual ? "Receitas da semana" : `Semana de ${dm(inicio)}`, curto: `${inicio.slice(8, 10)}–${dm(fim)}`, agora: atual ? "Esta semana" : `${dm(inicio)} a ${dm(fim)}`, antes: "Semana anterior", vs: "semana anterior" };
  return { titulo: atual ? "Receitas do mês" : `Receitas de ${mes}`, curto: `${nomeMes(inicio).slice(0, 3)}/${inicio.slice(2, 4)}`, agora: mes, antes: cap(nomeMes(andarPeriodo("mes", inicio, -1))), vs: "mês anterior" };
}

/** Sala de receita: PF + PJ + vendas dos sites num número só, sem contar duas vezes; atualiza sozinha. */
export function Receitas({ d }: { d: DadosReceitas }) {
  const { r } = d;
  const router = useRouter();
  const raiz = useRef<HTMLDivElement>(null);
  const numero = useRef<HTMLDivElement>(null);
  const seletor = useRef<HTMLDivElement>(null);
  const pilula = useRef<HTMLSpanElement>(null);
  const [nova, setNova] = useState<Receita | null>(null);
  const visto = useRef<{ inicio: string; ids: Set<string> } | null>(null);
  const aoVivo = r.inicio === inicioPeriodo(r.periodo, d.hoje);
  usePulso("financeiro", aoVivo ? 15_000 : 60_000, true, aoVivo);
  const cor = (f: string) => d.cores[f] ?? ROXO;
  const rot = rotulos(r.periodo, r.inicio, r.fim, d.hoje);
  // semana/mês em andamento: compara com o anterior até o mesmo ponto (dia 11 contra dia 11), não com ele inteiro
  const ate = aoVivo && r.periodo !== "dia" ? difDias(r.inicio, d.hoje) : null;
  const inicioAnt = andarPeriodo(r.periodo, r.inicio, -1);
  const base = ate == null ? d.anterior : d.anteriores.filter((a) => difDias(inicioAnt, a.data) <= ate).reduce((s, a) => s + a.valor, 0);
  const v = base > 0 ? (r.total - base) / base : null;
  const url = (p: PeriodoRec, data: string) => `/financeiro/receitas?p=${p}&d=${data}`;
  const proximo = andarPeriodo(r.periodo, r.inicio, 1);
  const positivas = r.entradas.filter((e) => e.valor > 0);

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    entrar(el.querySelectorAll("[data-enter]"), { y: 22 }, { stagger: 0.07 });
    if (reduzido()) return;
    const tl = gsap.timeline();
    tl.from(el.querySelector(".fin-rec-hud"), { y: 40, scale: 0.96, opacity: 0, duration: 0.9, ease: "expo.out", clearProps: "transform,opacity" }, 0.1)
      .from(el.querySelector(".fin-rec-hud-luz"), { scaleX: 0, duration: 1.1, ease: "expo.out", clearProps: "transform" }, 0.35)
      .from(el.querySelectorAll(".fin-rec-stat"), { y: 18, opacity: 0, duration: 0.6, ease: "power3.out", stagger: 0.08, clearProps: "transform,opacity" }, 0.5)
      .from(el.querySelectorAll(".fin-rec-fonte"), { y: 26, scale: 0.94, opacity: 0, duration: 0.7, ease: "back.out(1.6)", stagger: 0.07, clearProps: "transform,opacity" }, 0.6)
      .from(el.querySelectorAll(".fin-rec-feed > li"), { x: -18, opacity: 0, duration: 0.5, ease: "power3.out", stagger: 0.035, clearProps: "transform,opacity" }, 0.7);
    return () => { tl.progress(1).kill(); };
  }, [r.inicio, r.periodo]);

  // pílula do seletor desliza até o período ativo
  useLayoutEffect(() => {
    const alvo = seletor.current?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!alvo || !pilula.current) return;
    gsap.set(pilula.current, { x: alvo.offsetLeft, width: alvo.offsetWidth });
  }, [r.periodo]);

  // entrada nova enquanto a tela está aberta: o número pulsa e a entrada aparece num aviso
  useLayoutEffect(() => {
    const ids = new Set(r.entradas.map((e) => e.id));
    const antes = visto.current;
    visto.current = { inicio: r.inicio, ids };
    if (!antes || antes.inicio !== r.inicio) return;
    const chegou = r.entradas.find((e) => !antes.ids.has(e.id) && e.valor > 0);
    if (!chegou) return;
    setNova(chegou);
    if (!reduzido() && numero.current) gsap.fromTo(numero.current, { scale: 1.08, filter: "brightness(1.8)" }, { scale: 1, filter: "brightness(1)", duration: 1.4, ease: "elastic.out(1, 0.5)", clearProps: "transform,filter" });
    const t = setTimeout(() => setNova(null), 6000);
    return () => clearTimeout(t);
  }, [r.entradas, r.inicio]);

  const trocar = (p: PeriodoRec) => {
    const alvo = seletor.current?.querySelector<HTMLElement>(`[data-p="${p}"]`);
    if (alvo && pilula.current && !reduzido()) gsap.to(pilula.current, { x: alvo.offsetLeft, width: alvo.offsetWidth, duration: 0.45, ease: "expo.out" });
    router.push(url(p, aoVivo ? d.hoje : r.inicio)); // período atual segue em "hoje"; um passado abre no começo dele
  };

  const fontes = r.porFonte.map((f) => ({ ...f, cor: cor(f.nome) }));

  return (
    <div className="page fin fin-rec" ref={raiz}>
      <section className="fin-rec-sala">
        <div className="fin-rec-faixa" aria-hidden><i /><i /><i /></div>
        <header className="fin-rec-barra" data-enter>
          <Link href="/financeiro" className="fin-rec-voltar"><ArrowLeft aria-hidden />Financeiro</Link>
          <div className="fin-rec-placa">
            <img src="/domus-logo.png" alt="" width={26} height={26} />
            <b>Domus</b>
          </div>
          <div className="fin-rec-controles">
            <div className="fin-rec-periodos" ref={seletor} role="tablist" aria-label="Período">
              <span className="fin-rec-periodos-pilula" ref={pilula} aria-hidden />
              {PERIODOS.map(([p, l]) => <button key={p} data-p={p} role="tab" aria-current={r.periodo === p} onClick={() => trocar(p)}>{l}</button>)}
            </div>
            <div className="fin-rec-nav">
              <Link href={url(r.periodo, andarPeriodo(r.periodo, r.inicio, -1))} aria-label={`${cap(NOME_PERIODO[r.periodo])} anterior`}><ChevronLeft aria-hidden /></Link>
              <span>{rot.curto}</span>
              <Link href={url(r.periodo, proximo)} aria-label={`Próximo ${NOME_PERIODO[r.periodo]}`} aria-disabled={proximo > d.hoje} data-off={proximo > d.hoje || undefined}><ChevronRight aria-hidden /></Link>
            </div>
            {!aoVivo && <Link className="fin-rec-hoje" href={url(r.periodo, d.hoje)}>Hoje</Link>}
          </div>
        </header>

        <div className="fin-rec-cab" data-enter>
          <span className="fin-rec-sobre">Sala de receita <i>✦</i> {aoVivo ? "ao vivo" : "período fechado"}</span>
          <h1>{rot.titulo}</h1>
          <span className="fin-rec-hora">{aoVivo ? <Relogio /> : <>{dmy(r.inicio)}{r.fim !== r.inicio && <> <i>→</i> {dmy(r.fim)}</>}</>}</span>
        </div>

        <div className="fin-rec-hud">
          <span className="fin-rec-hud-canto" aria-hidden /><span className="fin-rec-hud-canto" aria-hidden /><span className="fin-rec-hud-canto" aria-hidden /><span className="fin-rec-hud-canto" aria-hidden />
          <span className="fin-rec-hud-lado" aria-hidden /><span className="fin-rec-hud-lado" aria-hidden />
          <div className="fin-rec-hud-topo"><span>Valor recebido {r.periodo === "dia" ? "no dia" : r.periodo === "semana" ? "na semana" : "no mês"}</span><span>{aoVivo ? "Domus · live 01" : "Domus · arquivo"}</span></div>
          <div className="fin-rec-valor-grande tabular" ref={numero} data-neg={r.total < 0 || undefined}>
            <em>R$</em><Valor v={r.total / 100} />
          </div>
          <div className="fin-rec-hud-pe">
            <span className="fin-rec-auto" data-on={aoVivo || undefined}><Radio aria-hidden />{aoVivo ? "Atualização automática" : "Período encerrado"}</span>
            <i aria-hidden />
            <span>
              {v != null && Number.isFinite(v) ? <b data-tom={v >= 0 ? "bom" : "ruim"}>{v >= 0 ? "+" : "−"}{Math.abs(Math.round(v * 100))}%</b> : <b>—</b>} vs {rot.vs}{ate != null && " até hoje"}
            </span>
          </div>
          <div className="fin-rec-trio">
            <span>PF <b className="tabular">{brl(r.pf)}</b></span>
            <span>PJ <b className="tabular">{brl(r.pj)}</b></span>
            <span>Site <b className="tabular">{brl(r.site)}</b><small>{r.vendas} {r.vendas === 1 ? "venda" : "vendas"}</small></span>
          </div>
        </div>
        <span className="fin-rec-hud-luz" aria-hidden />
        {nova && (
          <div className="fin-rec-toast" role="status" key={nova.id}>
            <b>+{brl(nova.valor)}</b><span>{nova.fonte} · {nova.descricao}</span>
          </div>
        )}
      </section>

      <section className="fin-rec-bloco" data-enter>
        <div className="fin-rec-bloco-cab">
          <div>
            <span className="fin-rec-sobre">Desempenho por {r.periodo === "dia" ? "dia" : r.periodo === "semana" ? "dia da semana" : "dia do mês"}</span>
            <h2>Tendência de receitas</h2>
            <p>{r.periodo === "dia" ? `Receita de cada dia, últimos ${r.serie.length} dias` : `Acumulado ao longo ${r.periodo === "semana" ? "da semana" : "do mês"}, comparado com ${r.periodo === "semana" ? "a anterior" : "o anterior"}`}</p>
          </div>
          <div className="fin-rec-legenda">
            <span><i data-k="agora" />{r.periodo === "dia" ? "Por dia" : rot.agora}</span>
            {r.periodo !== "dia" && <span><i data-k="antes" />{rot.antes}</span>}
            {r.periodo === "dia" && d.media > 0 && <span><i data-k="antes" />Média {brl(d.media)}</span>}
          </div>
        </div>
        <Tendencia r={r} anteriores={d.anteriores} hoje={d.hoje} media={d.media} />
        <div className="fin-rec-stats">
          <div className="fin-rec-stat"><small>Entradas registradas</small><b className="tabular">{String(positivas.length).padStart(2, "0")}</b><span>{r.periodo === "dia" ? "hoje" : `no ${NOME_PERIODO[r.periodo] === "mês" ? "mês" : "período"}`}</span></div>
          <div className="fin-rec-stat"><small>Ticket médio</small><b className="tabular"><CountUp value={positivas.length ? r.total / positivas.length / 100 : 0} kind="money" /></b><span>por entrada</span></div>
          <div className="fin-rec-stat"><small>Maior entrada</small><b className="tabular"><CountUp value={(r.maior?.valor ?? 0) / 100} kind="money" /></b><span>{r.maior ? r.maior.fonte : "nada ainda"}</span></div>
        </div>
        <p className="fin-rec-rodape"><i aria-hidden />Vendas do site e o crédito do Mercado Pago compõem o mesmo total: a mesma venda conta uma vez. Média por {NOME_PERIODO[r.periodo]}: {brl(d.media)}.</p>
      </section>

      {r.aLiberar > 0 && (
        <p className="fin-rec-nota" data-enter><Timer aria-hidden />{brl(r.aLiberar)} de vendas do site ainda não apareceram no banco. Já contam aqui; quando o crédito chegar, vira uma receita só.</p>
      )}

      <div className="fin-rec-fontes">
        {fontes.map((f) => <Fonte key={f.nome} nome={f.nome} valor={f.valor} cor={f.cor} total={r.total} />)}
        {!fontes.length && <div className="empty">Nenhuma receita neste {NOME_PERIODO[r.periodo]} ainda.</div>}
      </div>

      <div className="fin-grade-2 fin-grade-larga">
        <section className="panel fin-painel" data-enter>
          <header className="panel-head"><span className="panel-title">Entradas</span>
            <span className="caption subtle">{d.ultimaSync ? `Bancos atualizados ${new Date(d.ultimaSync).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Bancos nunca sincronizados"}</span></header>
          <ul className="fin-rec-feed">
            {r.entradas.map((e) => <Entrada key={e.id} e={e} cor={cor(e.fonte)} conta={e.contaId ? d.contas[e.contaId] : undefined} nota={d.notas[e.id]} nova={nova?.id === e.id} />)}
            {!r.entradas.length && <li className="subtle">Nada entrou neste {NOME_PERIODO[r.periodo]}.</li>}
          </ul>
          {d.desconsideradas.length > 0 && <Desconsideradas itens={d.desconsideradas} contas={d.contas} />}
        </section>
        <div className="fin-rec-lado">
          <section className="panel fin-painel fin-centro" data-enter>
            <Rosca fatias={fontes} total={r.total} rotulo="Receitas" />
          </section>
          <section className="panel fin-painel" data-enter>
            <header className="panel-head"><span className="panel-title">Últimos {r.serie.length} {r.periodo === "dia" ? "dias" : r.periodo === "semana" ? "semanas" : "meses"}</span><span className="caption subtle">Clique para abrir</span></header>
            <Colunas serie={r.serie} periodo={r.periodo} atual={r.inicio} ir={(i) => router.push(url(r.periodo, i))} />
          </section>
        </div>
      </div>
    </div>
  );
}

/** Data e hora de Brasília correndo (só no navegador, para não divergir do servidor). */
function Relogio() {
  const [t, setT] = useState<Date | null>(null);
  useEffect(() => {
    setT(new Date());
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  if (!t) return <span className="tabular">--/--/---- <i>✦</i> --:--:--</span>;
  const tz = { timeZone: "America/Sao_Paulo" } as const;
  return <span className="tabular">{t.toLocaleDateString("pt-BR", tz)} <i>✦</i> {t.toLocaleTimeString("pt-BR", tz)} <em>GMT-03</em></span>;
}

/** Valor sem o "R$" (que fica separado, em destaque), contando até o número. */
function Valor({ v }: { v: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const ant = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduzido()) { el.textContent = NUM.format(v); ant.current = v; return; }
    const o = { v: ant.current };
    const t = gsap.to(o, { v, duration: 2, ease: "expo.out", onUpdate: () => { el.textContent = NUM.format(o.v); } });
    ant.current = v;
    return () => { t.kill(); };
  }, [v]);
  return <span ref={ref}>{NUM.format(0)}</span>;
}

/** Linha da tendência: no dia, um ponto por dia; na semana/mês, o acumulado dia a dia contra o período anterior. */
function Tendencia({ r, anteriores, hoje, media }: { r: ResumoReceitas; anteriores: { data: string; valor: number }[]; hoje: string; media: number }) {
  const [foco, setFoco] = useState<number | null>(null);
  const { rot, cur, prev } = useMemo(() => {
    if (r.periodo === "dia") return { rot: r.serie.map((s) => dm(s.inicio)), cur: r.serie.map((s) => s.valor) as (number | null)[], prev: null };
    const n = r.periodo === "semana" ? 7 : difDias(r.inicio, andarPeriodo("mes", r.inicio, 1));
    // no mês vale a competência: uma entrada com data fora do mês cai na ponta mais próxima
    const acum = (xs: { data: string; valor: number }[], inicio: string) => {
      const a = new Array<number>(n).fill(0);
      for (const x of xs) a[Math.min(n - 1, Math.max(0, difDias(inicio, x.data)))] += x.valor;
      let s = 0;
      return a.map((v) => (s += v));
    };
    const ate = r.inicio === inicioPeriodo(r.periodo, hoje) ? difDias(r.inicio, hoje) : n - 1;
    return {
      rot: r.periodo === "semana" ? SEMANA : Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, "0")),
      cur: acum(r.entradas, r.inicio).map((v, i) => (i <= ate ? v : null)),
      prev: acum(anteriores, andarPeriodo(r.periodo, r.inicio, -1)),
    };
  }, [r, anteriores, hoje]);

  const n = rot.length;
  const topo = Math.max(100, ...cur.map((v) => v ?? 0), ...(prev ?? []), r.periodo === "dia" ? media : 0);
  const base = 10 ** Math.floor(Math.log10(topo / 4));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * base).find((s) => s * 4 >= topo) ?? base * 10;
  const max = passo * 4;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - Math.min(1, Math.max(0, v / max)) * 100;
  const linha = (vs: (number | null)[]) => vs.map((v, i) => (v == null ? "" : `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`)).join("");
  const u = cur.reduce<number>((a, v, i) => (v == null ? a : i), 0);
  const area = `${linha(cur)}L${x(u)},100L0,100Z`;
  const salto = Math.ceil(n / 12);
  const fmt = (v: number) => (v ? COMPACTO.format(v / 100) : "0");

  return (
    <div className="fin-rec-tend">
      <div className="fin-rec-tend-y" aria-hidden>{[4, 3, 2, 1, 0].map((k) => <span key={k} style={{ top: `${100 - k * 25}%` }}>{fmt(passo * k)}</span>)}</div>
      <div className="fin-rec-tend-area" onMouseLeave={() => setFoco(null)} role="img" aria-label="Tendência de receitas">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" key={`${r.periodo}${r.inicio}`}>
          <defs>
            <linearGradient id="fin-rec-ga" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="0" y2="100"><stop offset="0" stopColor={ROXO} stopOpacity=".5" /><stop offset="1" stopColor={ROXO} stopOpacity="0" /></linearGradient>
            <linearGradient id="fin-rec-gl" gradientUnits="userSpaceOnUse" x1="0" x2="100" y1="0" y2="0"><stop offset="0" stopColor="#7c3aed" /><stop offset=".7" stopColor="#c084fc" /><stop offset="1" stopColor="#f5d0fe" /></linearGradient>
          </defs>
          {[1, 2, 3].map((k) => <line key={k} className="fin-rec-tend-grade" x1="0" x2="100" y1={k * 25} y2={k * 25} />)}
          <line className="fin-rec-tend-base" x1="0" x2="100" y1="100" y2="100" />
          {prev && <path className="fin-rec-tend-ant" d={linha(prev)} />}
          {!prev && media > 0 && <line className="fin-rec-tend-ant" x1="0" x2="100" y1={y(media)} y2={y(media)} />}
          <g className="fin-rec-tend-desenho">
            <path className="fin-rec-tend-fill" d={area} />
            <path className="fin-rec-tend-linha" d={linha(cur)} />
          </g>
          <line className="fin-rec-tend-agora" x1={x(u)} x2={x(u)} y1="0" y2="100" />
          {foco != null && <line className="fin-rec-tend-guia" x1={x(foco)} x2={x(foco)} y1="0" y2="100" />}
        </svg>
        <span className="fin-rec-tend-ponto" style={{ left: `${x(u)}%`, top: `${y(cur[u] ?? 0)}%` }} aria-hidden />
        {foco != null && cur[foco] != null && <span className="fin-rec-tend-ponto fin-rec-tend-ponto-foco" style={{ left: `${x(foco)}%`, top: `${y(cur[foco]!)}%` }} aria-hidden />}
        <div className="fin-rec-tend-hit">
          {rot.map((_, i) => <i key={i} style={{ left: `${x(i)}%`, width: `${100 / n}%` }} onMouseEnter={() => setFoco(i)} />)}
        </div>
        {foco != null && (
          <div className="fin-dica fin-rec-tend-dica" style={{ left: `${Math.min(88, Math.max(12, x(foco)))}%` }}>
            <b>{r.periodo === "semana" ? `${SEMANA[foco]} · ${dm(andarPeriodo("dia", r.inicio, foco))}` : r.periodo === "mes" ? `Dia ${rot[foco]}` : rot[foco]}</b>
            <span>{cur[foco] == null ? "—" : brl(cur[foco]!)}{prev ? ` · antes ${brl(prev[foco] ?? 0)}` : ""}</span>
          </div>
        )}
      </div>
      <div className="fin-rec-tend-x" aria-hidden>
        {rot.map((l, i) => (i % salto === 0 || i === n - 1 ? <span key={i} style={{ left: `${x(i)}%` }}>{l}</span> : null))}
      </div>
    </div>
  );
}

/** Cartão de uma fonte: brilho segue o mouse, barra enche. */
function Fonte({ nome, valor, cor, total }: { nome: string; valor: number; cor: string; total: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mover = (e: React.MouseEvent) => {
    const b = ref.current!.getBoundingClientRect();
    ref.current!.style.setProperty("--mx", `${e.clientX - b.left}px`);
    ref.current!.style.setProperty("--my", `${e.clientY - b.top}px`);
  };
  return (
    <div className="fin-rec-fonte" ref={ref} onMouseMove={mover} style={{ "--f": cor } as React.CSSProperties}>
      <span className="fin-rec-fonte-nome"><i />{nome}</span>
      <b className="tabular"><CountUp value={valor / 100} kind="money" /></b>
      <Enche fracao={valor / (total || 1)} cor={cor} />
      <small>{Math.round((valor / (total || 1)) * 100)}% do total</small>
    </div>
  );
}

/** Linha do extrato de receitas; entradas do banco podem ser desconsideradas (ex.: metade de uma compra que alguém te passou). */
function Entrada({ e, cor, conta, nota, nova }: { e: Receita; cor: string; conta?: string; nota?: string; nova: boolean }) {
  const router = useRouter();
  const [abrir, setAbrir] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [indo, start] = useTransition();
  const o = ORIGEM[e.origem];
  const Icone = e.origem === "banco" ? (e.pessoa === "PJ" ? Building2 : Landmark) : Globe;
  const desconsiderar = () => start(async () => {
    const x = await classificar({ id: e.id, natureza: "ignorado", nota: motivo.trim() || null });
    if (!x.ok) { toast.err(x.error); return; }
    toast.ok(`${brl(e.valor)} não conta mais como receita`);
    setAbrir(false);
    router.refresh();
  });
  return (
    <li data-nova={nova || undefined} data-aberto={abrir || undefined}>
      <span className="fin-rec-ico" style={{ "--f": cor } as React.CSSProperties}><Icone aria-hidden /></span>
      <span className="fin-rec-txt">
        <b>{e.descricao}</b>
        <small>{dm(e.data)} · {e.fonte}{e.pessoa ? ` · ${e.pessoa}` : ""}{conta ? ` · ${conta}` : ""}{nota ? ` · “${nota}”` : ""}</small>
      </span>
      <span className="fin-rec-origem" data-o={e.origem} title={o.dica}><o.icone aria-hidden />{o.rotulo}</span>
      <span className="fin-rec-valor tabular">
        <b className={e.valor < 0 ? "neg" : "pos"}>{e.valor < 0 ? "−" : "+"}{brl(Math.abs(e.valor))}</b>
        {e.bruto != null && e.taxa ? <small>{brl(e.bruto)} − taxa {brl(e.taxa)}</small> : null}
      </span>
      {e.origem === "banco" && e.valor > 0 && (
        <button className="fin-rec-ignorar" onClick={() => setAbrir((x) => !x)} title="Desconsiderar: não é receita (ex.: metade de uma compra que alguém te passou)" aria-expanded={abrir}>
          {abrir ? <X aria-hidden /> : <EyeOff aria-hidden />}
        </button>
      )}
      {abrir && (
        <div className="fin-rec-ignorar-form">
          <span>Desconsiderar {brl(e.valor)}? Sai das receitas e da renda {e.pessoa ?? ""}; dá para voltar depois.</span>
          <div className="fin-rec-motivos">
            {MOTIVOS.map((m) => <button key={m} type="button" data-on={motivo === m || undefined} onClick={() => setMotivo(motivo === m ? "" : m)}>{m}</button>)}
          </div>
          <div className="fin-rec-ignorar-acoes">
            <input className="input" placeholder="Motivo (opcional), ex.: metade do tênis com a Juju" value={motivo} onChange={(x) => setMotivo(x.target.value)} maxLength={500} />
            <button className="btn btn-primary btn-sm" onClick={desconsiderar} disabled={indo}>{indo ? <Loader2 className="animate-spin" aria-hidden /> : <EyeOff aria-hidden />}Desconsiderar</button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Entradas desconsideradas no período: dá para voltar a contar. */
function Desconsideradas({ itens, contas }: { itens: ReceitaNota[]; contas: Record<string, string> }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [indo, start] = useTransition();
  const voltar = (id: string) => start(async () => {
    const x = await classificar({ id, natureza: "renda" });
    if (!x.ok) { toast.err(x.error); return; }
    toast.ok("Voltou a contar como receita");
    router.refresh();
  });
  return (
    <div className="fin-rec-descons">
      <button className="fin-rec-descons-cab" onClick={() => setAberto((x) => !x)} aria-expanded={aberto}>
        <EyeOff aria-hidden />{itens.length} desconsiderada{itens.length > 1 ? "s" : ""} · {brl(itens.reduce((a, i) => a + i.valor, 0))}
        <ChevronDown aria-hidden data-aberto={aberto || undefined} />
      </button>
      {aberto && (
        <ul>
          {itens.map((e) => (
            <li key={e.id}>
              <span className="fin-rec-txt"><b>{e.descricao}</b><small>{dm(e.data)}{e.contaId && contas[e.contaId] ? ` · ${contas[e.contaId]}` : ""}{e.nota ? ` · “${e.nota}”` : ""}</small></span>
              <s className="tabular">{brl(e.valor)}</s>
              <button className="btn btn-ghost btn-xs" onClick={() => voltar(e.id)} disabled={indo}><RotateCcw aria-hidden />Voltar a contar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Colunas dos últimos períodos: crescem em cascata; o período aberto acende. */
function Colunas({ serie, periodo, atual, ir }: { serie: { inicio: string; valor: number }[]; periodo: PeriodoRec; atual: string; ir: (inicio: string) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const [dica, setDica] = useState<number | null>(null);
  const W = 360, H = 160, P = 18;
  const max = Math.max(1, ...serie.map((s) => s.valor));
  const larg = (W - P * 2) / serie.length;
  const alt = (v: number) => (Math.max(0, v) / max) * (H - P * 2.4);
  useLayoutEffect(() => {
    if (!ref.current || reduzido()) return;
    const t = gsap.from(ref.current.querySelectorAll(".fin-rec-col"), { attr: { y: H - P, height: 0 }, duration: 0.9, ease: "expo.out", stagger: 0.04 });
    return () => { t.progress(1).kill(); };
  }, [serie]);
  const rotulo = (i: string) => (periodo === "mes" ? nomeMes(i).slice(0, 1).toUpperCase() : periodo === "semana" ? i.slice(8, 10) : i.slice(8, 10));
  const s = dica != null ? serie[dica] : null;
  return (
    <div className="fin-rec-colunas-caixa">
      <svg ref={ref} className="fin-rec-colunas" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Receitas por período">
        <defs><linearGradient id="fin-rec-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f0e2ff" /><stop offset="1" stopColor="#8b3dff" /></linearGradient></defs>
        {serie.map((x, i) => (
          <g key={x.inicio} className="fin-rec-mes" data-atual={x.inicio === atual || undefined} onClick={() => ir(x.inicio)}
            onMouseEnter={() => setDica(i)} onMouseLeave={() => setDica(null)}>
            <rect x={P + larg * i} y={0} width={larg} height={H} fill="transparent" />
            <rect className="fin-rec-col" x={P + larg * i + larg * 0.16} y={H - P - alt(x.valor)} width={larg * 0.68} height={alt(x.valor)} rx={4} />
            <text x={P + larg * i + larg / 2} y={H - 4} className="fin-rot">{rotulo(x.inicio)}</text>
          </g>
        ))}
      </svg>
      {s && <div className="fin-dica" style={{ left: `${((dica! + 0.5) / serie.length) * 100}%` }}><b>{periodo === "mes" ? `${nomeMes(s.inicio)} ${s.inicio.slice(0, 4)}` : periodo === "semana" ? `Semana de ${dm(s.inicio)}` : dm(s.inicio)}</b><span>{brl(s.valor)}</span></div>}
    </div>
  );
}
