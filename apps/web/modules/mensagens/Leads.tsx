"use client";

import { ETAPA_ENTRADA, formatarNumero, reais, type EtapaCrm } from "@domus-ads/core/mensagens";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import {
  ArrowDownRight, ArrowRightLeft, ArrowUpRight, CircleDollarSign, Clock, Flame, Globe, Hourglass, Megaphone, MessageCircle, Search,
  Settings2, SlidersHorizontal, Sparkles, Target, Timer, Trophy, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "../shell/toast";
import { definirEtapa, definirValor } from "./actions";
import { EditarFunil } from "./EditarFunil";
import { corEtapa } from "./etapas";

gsap.registerPlugin(Flip);

export interface Lead {
  numero: string; nome: string; etapa: string; site: string | null; valor: string | null;
  lead_em: string; etapa_em: string; mensagem: string | null; origem: string | null; email: string | null; utm: string | null; campanha: string | null;
  ultima: string | null; ultima_dir: string | null; respondeu: boolean; msgs: number; primeira_resp: string | null;
}

const H = 3_600_000;
const DIA = 24 * H;
const PERIODOS = [["hoje", "Hoje", DIA], ["7", "7 dias", 7 * DIA], ["30", "30 dias", 30 * DIA], ["90", "90 dias", 90 * DIA], ["tudo", "Tudo", Infinity]] as const;
type Periodo = (typeof PERIODOS)[number][0];
const SITUACOES = {
  todas: "Todas", esperando: "Sua vez de responder", esfriando: "Esfriando (+6 h)", respondeu: "Já responderam", silencio: "Nunca responderam", parado: "Parados (+7 dias)",
} as const;
type Situacao = keyof typeof SITUACOES;
const ORDENS = { recentes: "Mais recentes", antigos: "Mais antigos", valor: "Maior valor", parado: "Mais tempo parado", nome: "Nome (A–Z)" } as const;
type Ordem = keyof typeof ORDENS;
const VALORES = { todos: "Com ou sem valor", com: "Com valor", sem: "Sem valor" } as const;
type FiltroValor = keyof typeof VALORES;

const desde = (d: string) => Date.now() - new Date(d).getTime();
const num = (v: string | null) => (v ? Number(v) : 0);
/** Origem legível: o que o sistema mandou, o site do formulário ou "Manual" (marcado na conversa). */
const origemDe = (l: Lead) => l.origem ?? (l.site ? `Site ${l.site}` : "Manual");
/** A bola está com você: o lead escreveu por último, ou chegou e ninguém falou ainda. */
const suaVez = (l: Lead) => l.ultima_dir === "IN" || (!l.primeira_resp && l.ultima_dir !== "OUT");
const esfriando = (l: Lead) => suaVez(l) && desde(l.ultima ?? l.lead_em) > 6 * H;
const parado = (l: Lead) => desde(l.etapa_em) > 7 * DIA;
function tempo(ms: number) {
  const min = Math.max(0, Math.round(ms / 60_000));
  return min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
}
const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
const reduzido = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const alternar = (s: string[], v: string) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]);

/** Funil de leads: KPIs do período, filtros e quadro com colunas configuráveis. Arraste o cartão para mudar a etapa. */
export function Leads({ leads, etapas, sites }: { leads: Lead[]; etapas: EtapaCrm[]; sites: string[] }) {
  const router = useRouter();
  const [lista, setLista] = useState(leads);
  useEffect(() => setLista(leads), [leads]);
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [situacao, setSituacao] = useState<Situacao>("todas");
  const [filtroSites, setFiltroSites] = useState<string[]>([]);
  const [origens, setOrigens] = useState<string[]>([]);
  const [valor, setValor] = useState<FiltroValor>("todos");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [abrirFiltros, setAbrirFiltros] = useState(false);
  const [funil, setFunil] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [solto, setSolto] = useState<string | null>(null);
  const [, start] = useTransition();
  const quadro = useRef<HTMLDivElement>(null);
  const voo = useRef<Flip.FlipState | null>(null);

  const etapaDe = useMemo(() => new Map(etapas.map((e) => [e.chave, e])), [etapas]);
  // lead numa coluna que não existe mais cai na entrada
  const colunaDe = (l: Lead) => (etapaDe.has(l.etapa) ? l.etapa : ETAPA_ENTRADA);
  const tipoDe = (l: Lead) => etapaDe.get(colunaDe(l))?.tipo ?? "ABERTO";
  const aberto = (l: Lead) => tipoDe(l) === "ABERTO";
  const todasOrigens = useMemo(() => [...new Set(lista.map(origemDe))].sort(), [lista]);

  // filtros (menos o período): base para o período atual e o anterior (variação dos KPIs)
  const q = busca.trim().toLowerCase();
  const qNum = q.replace(/\D/g, "");
  const base = lista.filter((l) =>
    (!q || l.nome.toLowerCase().includes(q) || (qNum && l.numero.includes(qNum)) || l.mensagem?.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q) || l.campanha?.toLowerCase().includes(q))
    && (!filtroSites.length || (l.site && filtroSites.includes(l.site)))
    && (!origens.length || origens.includes(origemDe(l)))
    && (valor === "todos" || (valor === "com") === !!num(l.valor))
    && (situacao === "todas"
      || (situacao === "esperando" && aberto(l) && suaVez(l))
      || (situacao === "esfriando" && aberto(l) && esfriando(l))
      || (situacao === "respondeu" && l.respondeu)
      || (situacao === "silencio" && !l.respondeu)
      || (situacao === "parado" && aberto(l) && parado(l))));
  const janela = PERIODOS.find((p) => p[0] === periodo)![2];
  const noPeriodo = (l: Lead, de: number, ate = 0) => { const t = desde(l.lead_em); return t < de && t >= ate; };
  const ordenar = (a: Lead, b: Lead) =>
    ordem === "antigos" ? a.lead_em.localeCompare(b.lead_em)
    : ordem === "valor" ? num(b.valor) - num(a.valor)
    : ordem === "parado" ? a.etapa_em.localeCompare(b.etapa_em)
    : ordem === "nome" ? a.nome.localeCompare(b.nome, "pt-BR")
    : b.lead_em.localeCompare(a.lead_em);
  const vistos = base.filter((l) => noPeriodo(l, janela)).sort(ordenar);
  const anteriores = Number.isFinite(janela) ? base.filter((l) => noPeriodo(l, 2 * janela, janela)).length : null;
  const ativos = [busca.trim(), situacao !== "todas", filtroSites.length, origens.length, valor !== "todos"].filter(Boolean).length;
  const limpar = () => { setBusca(""); setSituacao("todas"); setFiltroSites([]); setOrigens([]); setValor("todos"); };

  // KPIs
  const ganhos = vistos.filter((l) => tipoDe(l) === "GANHO");
  const perdidos = vistos.filter((l) => tipoDe(l) === "PERDIDO");
  const abertos = vistos.filter(aberto);
  const pipeline = abertos.reduce((s, l) => s + num(l.valor), 0);
  const receita = ganhos.reduce((s, l) => s + num(l.valor), 0);
  const ganhosComValor = ganhos.filter((l) => num(l.valor)).length;
  const conversao = ganhos.length + perdidos.length ? ganhos.length / (ganhos.length + perdidos.length) : null;
  const respostas = vistos.filter((l) => l.primeira_resp).map((l) => new Date(l.primeira_resp!).getTime() - new Date(l.lead_em).getTime());
  const mediaResp = respostas.length ? respostas.reduce((s, t) => s + t, 0) / respostas.length : null;
  const em1h = respostas.length ? respostas.filter((t) => t <= H).length / respostas.length : null;
  const vez = abertos.filter(suaVez);
  const frios = vez.filter(esfriando).length;
  const variacao = anteriores ? (vistos.length - anteriores) / anteriores : null;
  const barras = (() => {
    const hoje = periodo === "hoje";
    const n = hoje ? 24 : Math.min(30, Number.isFinite(janela) ? janela / DIA : 30);
    const passo = hoje ? H : DIA;
    const b = Array.from({ length: n }, () => 0);
    for (const l of base) { const i = n - 1 - Math.floor(desde(l.lead_em) / passo); if (i >= 0 && i < n) b[i]!++; }
    return b;
  })();

  // mover: estado otimista + voo do cartão (Flip) até a coluna nova
  const mover = (numero: string, chave: string | null) => {
    const l = lista.find((x) => x.numero === numero);
    if (!l || l.etapa === chave) return;
    if (quadro.current && !reduzido()) voo.current = Flip.getState(quadro.current.querySelectorAll(".crm-card"));
    const antes = lista;
    setLista((ls) => (chave ? ls.map((x) => (x.numero === numero ? { ...x, etapa: chave, etapa_em: new Date().toISOString() } : x)) : ls.filter((x) => x.numero !== numero)));
    setSolto(numero);
    start(async () => {
      const r = await definirEtapa(numero, chave);
      if (!r.ok) { setLista(antes); return toast.err(r.error); }
      const e = chave ? etapaDe.get(chave) : null;
      if (e?.tipo === "GANHO") toast.ok(`${l.nome} fechou! 🎉`);
      else if (!chave) toast.ok(`${l.nome} saiu do funil`);
      router.refresh();
    });
  };

  useLayoutEffect(() => {
    const v = voo.current;
    if (!v || !quadro.current) return;
    voo.current = null;
    Flip.from(v, { targets: quadro.current.querySelectorAll(".crm-card"), duration: 0.55, ease: "power3.inOut", nested: true, prune: true,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.35 }) });
  }, [lista]);
  useEffect(() => { if (!solto) return; const t = setTimeout(() => setSolto(null), 1400); return () => clearTimeout(t); }, [solto]);

  // entrada: KPIs e cartões sobem em cascata
  const raiz = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!raiz.current || reduzido()) return;
    const ctx = gsap.context(() => {
      gsap.from(".crm-kpi", { y: 14, opacity: 0, duration: 0.6, stagger: 0.06, ease: "expo.out" });
      gsap.from(".crm-col", { y: 18, opacity: 0, duration: 0.6, stagger: 0.05, delay: 0.1, ease: "expo.out" });
      gsap.from(".crm-card", { y: 10, opacity: 0, duration: 0.45, stagger: 0.025, delay: 0.25, ease: "power2.out" });
    }, raiz);
    return () => ctx.revert();
  }, []);

  if (!leads.length && !lista.length) return (
    <div className="panel wa-vazio" style={{ padding: "48px 16px" }}>
      <Sparkles size={38} aria-hidden /><b>Nenhum lead ainda</b>
      <span className="subtle small" style={{ textAlign: "center", maxWidth: 420 }}>Conecte um site e cole o formulário. Quem preencher aparece aqui, na primeira coluna. Você também pode marcar qualquer conversa como lead.</span>
      <Link className="btn btn-primary btn-sm" style={{ marginTop: 6 }} href="/crm/sites"><Globe aria-hidden /> Conectar site</Link>
    </div>
  );

  const total = vistos.length || 1;
  return (
    <div className="crm-leads" ref={raiz}>
      <header className="crm-cab">
        <div>
          <h1 className="crm-titulo">Funil de vendas</h1>
          <p className="subtle small" style={{ margin: 0 }}>Arraste os cartões entre as colunas. Clique no nome para abrir a conversa.</p>
        </div>
        <div className="crm-periodos" role="tablist" aria-label="Período">
          {PERIODOS.map(([k, rot]) => <button key={k} role="tab" aria-selected={periodo === k} className="crm-periodo" onClick={() => setPeriodo(k)}>{rot}</button>)}
        </div>
      </header>

      <section className="crm-kpis" aria-label="Indicadores">
        <article className="crm-kpi crm-kpi-hero">
          <span className="crm-kpi-rot"><Sparkles aria-hidden /> Leads no período</span>
          <span className="crm-kpi-val"><Num v={vistos.length} /></span>
          <span className="crm-kpi-sub">
            {variacao !== null ? (
              <span className="crm-delta" data-sobe={variacao >= 0}>{variacao >= 0 ? <ArrowUpRight aria-hidden /> : <ArrowDownRight aria-hidden />}{Math.abs(Math.round(variacao * 100))}%</span>
            ) : null}
            <span>{anteriores !== null ? `vs. ${anteriores} no período anterior` : "desde o começo"}</span>
          </span>
          <Barras valores={barras} />
        </article>
        <article className="crm-kpi">
          <span className="crm-kpi-rot"><CircleDollarSign aria-hidden /> Pipeline aberto</span>
          <span className="crm-kpi-val"><Num v={pipeline} fmt={(n) => reais(n, true)} /></span>
          <span className="crm-kpi-sub">{abertos.length} em andamento · {abertos.filter((l) => num(l.valor)).length} com valor</span>
        </article>
        <article className="crm-kpi crm-kpi-anel">
          <Anel pct={conversao ?? 0} vazio={conversao === null} />
          <span className="crm-kpi-txt">
            <span className="crm-kpi-rot"><Target aria-hidden /> Conversão</span>
            <span className="crm-kpi-val">{conversao === null ? "—" : <Num v={conversao * 100} fmt={(n) => `${Math.round(n)}%`} />}</span>
            <span className="crm-kpi-sub">{ganhos.length} fechados de {ganhos.length + perdidos.length} decididos</span>
          </span>
        </article>
        <article className="crm-kpi">
          <span className="crm-kpi-rot"><Trophy aria-hidden /> Receita fechada</span>
          <span className="crm-kpi-val" data-tom="ok"><Num v={receita} fmt={(n) => reais(n, true)} /></span>
          <span className="crm-kpi-sub">Ticket médio {ganhosComValor ? reais(receita / ganhosComValor, true) : "—"}</span>
        </article>
        <article className="crm-kpi">
          <span className="crm-kpi-rot"><Timer aria-hidden /> 1ª resposta</span>
          <span className="crm-kpi-val">{mediaResp === null ? "—" : tempo(mediaResp)}</span>
          <span className="crm-kpi-sub">{em1h === null ? "Ninguém respondido ainda" : `${Math.round(em1h * 100)}% respondidos em até 1 h`}</span>
        </article>
        <button className="crm-kpi crm-kpi-acao" data-alerta={frios > 0} onClick={() => setSituacao(situacao === "esperando" ? "todas" : "esperando")} aria-pressed={situacao === "esperando"}>
          <span className="crm-kpi-rot">{frios ? <Flame aria-hidden /> : <Hourglass aria-hidden />} Sua vez de responder</span>
          <span className="crm-kpi-val"><Num v={vez.length} /></span>
          <span className="crm-kpi-sub">{frios ? `${frios} esfriando há mais de 6 h` : vez.length ? "Responda rápido: lead esfria" : "Tudo respondido 👏"}</span>
        </button>
      </section>

      {vistos.length > 0 && (
        <div className="crm-dist" aria-label="Leads por etapa">
          <div className="crm-dist-barra">
            {etapas.map((e) => { const n = vistos.filter((l) => colunaDe(l) === e.chave).length; return n ? <span key={e.chave} style={{ ...corEtapa(e), flexGrow: n }} title={`${e.nome}: ${n}`} /> : null; })}
          </div>
          <div className="crm-dist-leg">
            {etapas.map((e) => { const n = vistos.filter((l) => colunaDe(l) === e.chave).length; return <span key={e.chave} style={corEtapa(e)}><i />{e.nome} <b>{n}</b> <small>{Math.round((n / total) * 100)}%</small></span>; })}
          </div>
        </div>
      )}

      <div className="crm-barra">
        <label className="crm-busca"><Search size={15} aria-hidden /><input placeholder="Buscar nome, número, e-mail, mensagem ou campanha" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {busca && <button onClick={() => setBusca("")} aria-label="Limpar busca"><X size={14} /></button>}</label>
        <button className="btn btn-ghost btn-sm crm-filtros-btn" data-ativo={abrirFiltros || ativos > 0} onClick={() => setAbrirFiltros(!abrirFiltros)} aria-expanded={abrirFiltros}>
          <SlidersHorizontal aria-hidden /> Filtros{ativos ? <span className="crm-n">{ativos}</span> : null}
        </button>
        <select className="select crm-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
          {Object.entries(ORDENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => setFunil(true)}><Settings2 aria-hidden /> Colunas</button>
      </div>

      {abrirFiltros && (
        <div className="crm-filtros panel">
          <Grupo titulo="Situação">
            {Object.entries(SITUACOES).map(([k, v]) => <button key={k} className="chip" data-active={situacao === k} onClick={() => setSituacao(k as Situacao)}>{v}</button>)}
          </Grupo>
          {todasOrigens.length > 1 && <Grupo titulo="Origem">
            {todasOrigens.map((o) => <button key={o} className="chip" data-active={origens.includes(o)} onClick={() => setOrigens(alternar(origens, o))}>{o}</button>)}
          </Grupo>}
          {sites.length > 1 && <Grupo titulo="Site">
            {sites.map((s) => <button key={s} className="chip" data-active={filtroSites.includes(s)} onClick={() => setFiltroSites(alternar(filtroSites, s))}>{s}</button>)}
          </Grupo>}
          <Grupo titulo="Valor">
            {Object.entries(VALORES).map(([k, v]) => <button key={k} className="chip" data-active={valor === k} onClick={() => setValor(k as FiltroValor)}>{v}</button>)}
          </Grupo>
          {ativos > 0 && <button className="btn btn-ghost btn-xs" style={{ alignSelf: "flex-start" }} onClick={limpar}><X aria-hidden /> Limpar filtros</button>}
        </div>
      )}

      {!vistos.length && (
        <div className="crm-sem panel"><Search size={18} aria-hidden /> Nenhum lead {Number.isFinite(janela) ? "neste período" : ""}{ativos ? " com esses filtros" : ""}.
          {ativos > 0 && <button className="btn btn-ghost btn-xs" onClick={limpar}>Limpar filtros</button>}
          {periodo !== "tudo" && <button className="btn btn-ghost btn-xs" onClick={() => setPeriodo("tudo")}>Ver tudo</button>}</div>
      )}

      <div className="crm-quadro" ref={quadro} data-arrastando={!!arrastando} style={{ gridTemplateColumns: `repeat(${etapas.length}, minmax(268px, 1fr))` }}>
        {etapas.map((e) => {
          const itens = vistos.filter((l) => colunaDe(l) === e.chave);
          const soma = itens.reduce((s, l) => s + num(l.valor), 0);
          return (
            <section key={e.chave} className="crm-col" style={corEtapa(e)} data-alvo={alvo === e.chave} data-tipo={e.tipo} aria-label={e.nome}
              onDragOver={(ev) => { if (!arrastando) return; ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; if (alvo !== e.chave) setAlvo(e.chave); }}
              onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setAlvo(null); }}
              onDrop={(ev) => { ev.preventDefault(); setAlvo(null); setArrastando(null); const n = ev.dataTransfer.getData("text/plain"); if (n) mover(n, e.chave); }}>
              <header className="crm-col-topo">
                <span className="crm-col-nome"><i className="crm-ponto" />{e.nome}{e.tipo === "GANHO" ? <Trophy aria-hidden /> : null}</span>
                <span className="crm-col-n">{itens.length}</span>
                <span className="crm-col-info">
                  <span>{soma ? reais(soma, true) : "R$ —"}</span>
                  {e.dica && <small className="crm-trunc" title={e.dica}>{e.dica}</small>}
                </span>
                <span className="crm-col-prog"><span style={{ width: `${(itens.length / total) * 100}%` }} /></span>
              </header>
              <div className="crm-col-lista">
                {itens.map((l) => (
                  <Cartao key={l.numero} l={l} aberto={aberto(l)} etapas={etapas} solto={solto === l.numero} arrastando={arrastando === l.numero}
                    onArrastar={setArrastando} mover={mover} />
                ))}
                {!itens.length && <div className="crm-col-vazio">{arrastando ? "Solte aqui" : "Nenhum lead"}</div>}
              </div>
            </section>
          );
        })}
      </div>

      {funil && <EditarFunil etapas={etapas} contagem={Object.fromEntries(etapas.map((e) => [e.chave, lista.filter((l) => colunaDe(l) === e.chave).length]))} fechar={() => setFunil(false)} />}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div className="crm-grupo"><span className="crm-grupo-rot">{titulo}</span><div className="cluster" style={{ gap: 6 }}>{children}</div></div>;
}

function Cartao({ l, aberto, etapas, solto, arrastando, onArrastar, mover }: {
  l: Lead; aberto: boolean; etapas: EtapaCrm[]; solto: boolean; arrastando: boolean;
  onArrastar: (n: string | null) => void; mover: (n: string, e: string | null) => void;
}) {
  const vez = aberto && suaVez(l);
  const frio = aberto && esfriando(l);
  const diasParado = aberto && parado(l) ? Math.floor(desde(l.etapa_em) / DIA) : 0;
  return (
    <article className="crm-card" data-flip-id={l.numero} data-solto={solto} data-arrastando={arrastando} data-frio={frio} draggable
      onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", l.numero); ev.dataTransfer.effectAllowed = "move"; onArrastar(l.numero); }}
      onDragEnd={() => onArrastar(null)}>
      <div className="crm-card-topo">
        <span className="crm-avatar" aria-hidden>{iniciais(l.nome)}</span>
        <span className="crm-card-id">
          <Link href={`/crm?c=${l.numero}`} className="crm-card-nome crm-trunc" draggable={false}>{l.nome}</Link>
          <small className="crm-trunc">{formatarNumero(l.numero)}</small>
        </span>
        <small className="crm-card-ha" suppressHydrationWarning title={`Chegou em ${new Date(l.lead_em).toLocaleString("pt-BR")}`}><Clock aria-hidden />{tempo(desde(l.lead_em))}</small>
      </div>
      {l.mensagem && <p className="crm-card-msg">{l.mensagem}</p>}
      <div className="crm-card-tags">
        <span className="crm-tag" title="Origem"><Globe aria-hidden />{origemDe(l)}</span>
        {l.utm && <span className="crm-tag" title={l.campanha ? `Campanha: ${l.campanha}` : "Anúncio"}><Megaphone aria-hidden />{l.utm}</span>}
        {diasParado > 0 && <span className="crm-tag" data-tom="aviso" title="Tempo nesta etapa">Parado {diasParado} d</span>}
      </div>
      <footer className="crm-card-pe">
        <Valor l={l} />
        {frio ? <span className="crm-sit" data-tom="frio" suppressHydrationWarning><Flame aria-hidden /> esfriando {tempo(desde(l.ultima ?? l.lead_em))}</span>
          : vez ? <span className="crm-sit" data-tom="vez"><i /> sua vez</span>
          : l.respondeu ? <span className="crm-sit" data-tom="ok"><MessageCircle aria-hidden /> {l.msgs} msg</span>
          : aberto && l.primeira_resp ? <span className="crm-sit">aguardando lead</span> : null}
        <span className="crm-card-acoes">
          <Link href={`/crm?c=${l.numero}`} className="crm-icone" aria-label={`Conversar com ${l.nome}`} title="Abrir conversa" draggable={false}><MessageCircle aria-hidden /></Link>
          <label className="crm-icone" title="Mover para…">
            <ArrowRightLeft aria-hidden />
            <select value={l.etapa} onChange={(e) => mover(l.numero, e.target.value || null)} aria-label={`Mover ${l.nome} para`}>
              {etapas.map((e) => <option key={e.chave} value={e.chave}>{e.nome}</option>)}
              <option value="">Tirar do funil</option>
            </select>
          </label>
        </span>
      </footer>
    </article>
  );
}

/** Valor do negócio: clique para editar; Enter ou sair do campo salva. */
function Valor({ l }: { l: Lead }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [pend, start] = useTransition();
  const inicial = l.valor ? Number(l.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  const salvar = (texto: string) => {
    setEdit(false);
    if (texto.trim() === inicial) return;
    start(async () => {
      const r = await definirValor(l.numero, texto);
      if (!r.ok) return toast.err(r.error);
      router.refresh();
    });
  };
  if (edit) return (
    <input className="crm-valor-in" autoFocus inputMode="decimal" placeholder="R$ 0,00" defaultValue={inicial}
      onBlur={(e) => salvar(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEdit(false); }} aria-label={`Valor de ${l.nome}`} />
  );
  return (
    <button className="crm-valor" data-vazio={!num(l.valor)} onClick={() => setEdit(true)} aria-busy={pend} title="Valor do negócio">
      {num(l.valor) ? reais(l.valor!, true) : "+ valor"}
    </button>
  );
}

/** Número que conta até o valor novo (GSAP). */
function Num({ v, fmt = (n) => Math.round(n).toLocaleString("pt-BR") }: { v: number; fmt?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const atual = useRef(0);
  const f = useRef(fmt);
  f.current = fmt;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduzido()) { atual.current = v; el.textContent = f.current(v); return; }
    const o = { n: atual.current };
    const t = gsap.to(o, { n: v, duration: 1, ease: "power3.out", onUpdate: () => { atual.current = o.n; el.textContent = f.current(o.n); } });
    return () => { t.kill(); };
  }, [v]);
  return <span ref={ref}>{fmt(0)}</span>;
}

/** Leads por dia (ou por hora, em "Hoje"), barras que crescem. */
function Barras({ valores }: { valores: number[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const max = Math.max(1, ...valores);
  const chave = valores.join();
  useEffect(() => {
    if (!ref.current || reduzido()) return;
    const t = gsap.fromTo(ref.current.querySelectorAll("rect"), { scaleY: 0 }, { scaleY: 1, transformOrigin: "50% 100%", duration: 0.7, stagger: 0.015, ease: "expo.out" });
    return () => { t.kill(); };
  }, [chave]);
  return (
    <svg ref={ref} className="crm-spark" viewBox={`0 0 ${valores.length * 8} 40`} preserveAspectRatio="none" aria-hidden>
      {valores.map((v, i) => { const h = v ? Math.max(3, (v / max) * 38) : 1.5; return <rect key={i} x={i * 8 + 1} y={40 - h} width={6} height={h} rx={2} data-zero={!v} />; })}
    </svg>
  );
}

/** Anel da conversão (traço anima até a porcentagem). */
function Anel({ pct, vazio }: { pct: number; vazio: boolean }) {
  const ref = useRef<SVGCircleElement>(null);
  const C = 2 * Math.PI * 26;
  useEffect(() => {
    if (!ref.current) return;
    const fim = C * (1 - (vazio ? 0 : pct));
    if (reduzido()) { ref.current.style.strokeDashoffset = String(fim); return; }
    const t = gsap.to(ref.current, { strokeDashoffset: fim, duration: 1.1, ease: "power3.out" });
    return () => { t.kill(); };
  }, [pct, vazio, C]);
  return (
    <svg className="crm-anel" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="26" className="crm-anel-fundo" />
      <circle ref={ref} cx="32" cy="32" r="26" className="crm-anel-traco" strokeDasharray={C} strokeDashoffset={C} />
    </svg>
  );
}
