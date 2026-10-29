"use client";

import { ETAPA_ENTRADA, filtroCrmSchema, formatarNumero, reais, type EtapaCrm, type FiltroSalvo, type FiltrosCrm } from "@domus-ads/core/mensagens";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import {
  ArrowDownRight, ArrowRightLeft, ArrowUpRight, Bookmark, CalendarClock, Check, ChevronDown, CircleDollarSign, Clock, ExternalLink, Flame, Globe, Hourglass, Link2,
  Mail, Megaphone, MessageCircle, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Star, Target, Timer, Trash2, Trophy, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { WhatsappIcon } from "../connections/Logos";
import { entrar, reduzido } from "../motion/entrar";
import { confirmar } from "../shell/confirmar";
import { Dialog } from "../shell/Dialog";
import { Popover } from "../shell/Popover";
import { toast } from "../shell/toast";
import { apagarFiltro, definirEtapa, definirValor, favoritarFiltro, salvarFiltro } from "./actions";
import { EditarFunil } from "./EditarFunil";
import { corEtapa, EtapaSeletor } from "./etapas";

gsap.registerPlugin(Flip);

export interface Lead {
  numero: string; nome: string; etapa: string; site: string | null; valor: string | null;
  lead_em: string; etapa_em: string; mensagem: string | null; origem: string | null; email: string | null; utm: string | null; campanha: string | null;
  pagina: string | null; consentimento_em: string | null;
  ultima: string | null; ultima_dir: string | null; respondeu: boolean; msgs: number; primeira_resp: string | null;
}

const H = 3_600_000;
const DIA = 24 * H;
const PERIODOS: [FiltrosCrm["periodo"], string, number][] = [["hoje", "Hoje", DIA], ["7", "7 dias", 7 * DIA], ["30", "30 dias", 30 * DIA], ["90", "90 dias", 90 * DIA], ["tudo", "Tudo", Infinity]];
const SITUACOES: Record<FiltrosCrm["situacao"], string> = {
  todas: "Todas", esperando: "Sua vez de responder", esfriando: "Esfriando (+6 h)", respondeu: "Já responderam", silencio: "Nunca responderam", parado: "Parados (+7 dias)",
};
const ORDENS: Record<FiltrosCrm["ordem"], string> = { recentes: "Mais recentes", antigos: "Mais antigos", valor: "Maior valor", parado: "Mais tempo parado", nome: "Nome (A–Z)" };
const VALORES: Record<FiltrosCrm["valor"], string> = { todos: "Com ou sem valor", com: "Com valor", sem: "Sem valor" };
const PADRAO = filtroCrmSchema.parse({});
const janelaDe = (p: FiltrosCrm["periodo"]) => PERIODOS.find((x) => x[0] === p)![2];
/** Mesmos filtros (ordem dos sites/origens não importa). */
const chaveFiltro = (f: FiltrosCrm) => JSON.stringify({ ...f, busca: f.busca.trim(), sites: [...f.sites].sort(), origens: [...f.origens].sort() });
/** Quantos filtros (fora período e ordem) estão ligados. */
const ligados = (f: FiltrosCrm) => [f.busca.trim(), f.situacao !== "todas", f.sites.length, f.origens.length, f.valor !== "todos"].filter(Boolean).length;

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
const dataHora = (d: string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
const alternar = (s: string[], v: string) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]);

/** O lead passa nos filtros (menos o período)? `aberto` = está numa coluna em andamento. */
function combina(l: Lead, f: FiltrosCrm, aberto: boolean) {
  const q = f.busca.trim().toLowerCase();
  const qNum = q.replace(/\D/g, "");
  return (!q || l.nome.toLowerCase().includes(q) || (!!qNum && l.numero.includes(qNum)) || !!l.mensagem?.toLowerCase().includes(q) || !!l.email?.toLowerCase().includes(q) || !!l.campanha?.toLowerCase().includes(q))
    && (!f.sites.length || (!!l.site && f.sites.includes(l.site)))
    && (!f.origens.length || f.origens.includes(origemDe(l)))
    && (f.valor === "todos" || (f.valor === "com") === !!num(l.valor))
    && (f.situacao === "todas"
      || (f.situacao === "esperando" && aberto && suaVez(l))
      || (f.situacao === "esfriando" && aberto && esfriando(l))
      || (f.situacao === "respondeu" && l.respondeu)
      || (f.situacao === "silencio" && !l.respondeu)
      || (f.situacao === "parado" && aberto && parado(l)));
}
const noPeriodo = (l: Lead, de: number, ate = 0) => { const t = desde(l.lead_em); return t < de && t >= ate; };
type Chip = [string, () => void];

/** Funil de leads: KPIs do período, filtros e quadro com colunas configuráveis. Arraste o cartão para mudar a etapa; clique para ver tudo. */
export function Leads({ leads, etapas, sites, salvos }: { leads: Lead[]; etapas: EtapaCrm[]; sites: string[]; salvos: FiltroSalvo[] }) {
  const router = useRouter();
  const [lista, setLista] = useState(leads);
  useEffect(() => setLista(leads), [leads]);
  // abre com o filtro favorito aplicado
  const [f, setF] = useState<FiltrosCrm>(() => salvos.find((x) => x.favorito)?.filtros ?? PADRAO);
  const mudar = (p: Partial<FiltrosCrm>) => setF((x) => ({ ...x, ...p }));
  const [modalFiltros, setModalFiltros] = useState(false);
  const [funil, setFunil] = useState(false);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [solto, setSolto] = useState<string | null>(null);
  const [, start] = useTransition();
  const raiz = useRef<HTMLDivElement>(null);
  const quadro = useRef<HTMLDivElement>(null);
  const voo = useRef<Flip.FlipState | null>(null);

  const etapaDe = useMemo(() => new Map(etapas.map((e) => [e.chave, e])), [etapas]);
  // lead numa coluna que não existe mais cai na entrada
  const colunaDe = (l: Lead) => (etapaDe.has(l.etapa) ? l.etapa : ETAPA_ENTRADA);
  const tipoDe = (l: Lead) => etapaDe.get(colunaDe(l))?.tipo ?? "ABERTO";
  const aberto = (l: Lead) => tipoDe(l) === "ABERTO";
  const todasOrigens = useMemo(() => [...new Set(lista.map(origemDe))].sort(), [lista]);

  const janela = janelaDe(f.periodo);
  const base = lista.filter((l) => combina(l, f, aberto(l)));
  const ordenar = (a: Lead, b: Lead) =>
    f.ordem === "antigos" ? a.lead_em.localeCompare(b.lead_em)
    : f.ordem === "valor" ? num(b.valor) - num(a.valor)
    : f.ordem === "parado" ? a.etapa_em.localeCompare(b.etapa_em)
    : f.ordem === "nome" ? a.nome.localeCompare(b.nome, "pt-BR")
    : b.lead_em.localeCompare(a.lead_em);
  const vistos = base.filter((l) => noPeriodo(l, janela)).sort(ordenar);
  const anteriores = Number.isFinite(janela) ? base.filter((l) => noPeriodo(l, 2 * janela, janela)).length : null;
  const ativos = ligados(f);
  const contar = (r: FiltrosCrm) => lista.filter((l) => combina(l, r, aberto(l)) && noPeriodo(l, janelaDe(r.periodo))).length;

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
    const hoje = f.periodo === "hoje";
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
    if (!chave) setDetalhe(null);
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
    const t = Flip.from(v, { targets: quadro.current.querySelectorAll(".crm-card"), duration: 0.55, ease: "power3.inOut", nested: true, prune: true });
    return () => { t.progress(1).kill(); };
  }, [lista]);
  useEffect(() => { if (!solto) return; const t = setTimeout(() => setSolto(null), 1400); return () => clearTimeout(t); }, [solto]);
  // arrasto que terminou fora (soltou fora da janela, trocou de página): nada fica "segurado"
  useEffect(() => {
    const fim = () => { setArrastando(null); setAlvo(null); };
    window.addEventListener("dragend", fim);
    window.addEventListener("drop", fim);
    return () => { window.removeEventListener("dragend", fim); window.removeEventListener("drop", fim); };
  }, []);

  // entrada em cascata; a limpeza pula para o fim (nada fica escondido ou torto)
  useLayoutEffect(() => {
    const r = raiz.current;
    if (!r) return;
    const fins = [
      entrar(r.querySelectorAll(".crm-kpi"), { y: 16 }, { stagger: 0.06 }),
      entrar(r.querySelectorAll(".crm-dist, .crm-barra"), { y: 10 }, { stagger: 0.05, delay: 0.15 }),
      entrar(r.querySelectorAll(".crm-col"), { y: 22 }, { stagger: 0.05, delay: 0.12 }),
      entrar(r.querySelectorAll(".crm-card"), { y: 12, scale: 0.97 }, { stagger: 0.03, delay: 0.3, duration: 0.5 }),
    ];
    return () => fins.forEach((fim) => fim());
  }, []);

  if (!lista.length) return (
    <div className="panel wa-vazio" style={{ padding: "48px 16px" }}>
      <Sparkles size={38} aria-hidden /><b>Nenhum lead ainda</b>
      <span className="subtle small" style={{ textAlign: "center", maxWidth: 420 }}>Conecte um site e cole o formulário. Quem preencher aparece aqui, na primeira coluna. Você também pode marcar qualquer conversa como lead.</span>
      <Link className="btn btn-primary btn-sm" style={{ marginTop: 6 }} href="/crm/sites"><Globe aria-hidden /> Conectar site</Link>
    </div>
  );

  const total = vistos.length || 1;
  const aberta = detalhe ? lista.find((l) => l.numero === detalhe) : null;
  const chips: Chip[] = [
    ...(f.busca.trim() ? [[`“${f.busca.trim()}”`, () => mudar({ busca: "" })] as Chip] : []),
    ...(f.situacao !== "todas" ? [[SITUACOES[f.situacao], () => mudar({ situacao: "todas" })] as Chip] : []),
    ...f.origens.map((o): Chip => [o, () => mudar({ origens: f.origens.filter((x) => x !== o) })]),
    ...f.sites.map((s): Chip => [`Site ${s}`, () => mudar({ sites: f.sites.filter((x) => x !== s) })]),
    ...(f.valor !== "todos" ? [[VALORES[f.valor], () => mudar({ valor: "todos" })] as Chip] : []),
  ];

  return (
    <div className="crm-leads" ref={raiz}>
      <header className="crm-cab">
        <div>
          <h1 className="crm-titulo">Funil de vendas</h1>
          <p className="subtle small" style={{ margin: 0 }}>Arraste os cartões entre as colunas. Clique num cartão para ver tudo sobre o lead.</p>
        </div>
        <Segmento valor={f.periodo} onChange={(periodo) => mudar({ periodo })} />
      </header>

      <section className="crm-kpis" aria-label="Indicadores">
        <article className="crm-kpi crm-kpi-hero">
          <span className="crm-kpi-rot"><Sparkles aria-hidden /> Leads no período</span>
          <span className="crm-kpi-val"><Num v={vistos.length} /></span>
          <span className="crm-kpi-sub">
            {variacao !== null && <span className="crm-delta" data-sobe={variacao >= 0}>{variacao >= 0 ? <ArrowUpRight aria-hidden /> : <ArrowDownRight aria-hidden />}{Math.abs(Math.round(variacao * 100))}%</span>}
            <span>{anteriores !== null ? `vs. ${anteriores} no período anterior` : "desde o começo"}</span>
          </span>
          <Barras valores={barras} />
        </article>
        <article className="crm-kpi">
          <span className="crm-kpi-rot"><CircleDollarSign aria-hidden /> Pipeline aberto</span>
          <span className="crm-kpi-val"><Num v={pipeline} fmt={(n) => reais(n, true)} /></span>
          <span className="crm-kpi-sub">{abertos.length} em andamento · {abertos.filter((l) => num(l.valor)).length} com valor</span>
        </article>
        <article className="crm-kpi">
          <span className="crm-kpi-rot"><Target aria-hidden /> Conversão</span>
          <span className="crm-kpi-anel">
            <Anel pct={conversao ?? 0} vazio={conversao === null} />
            <span className="crm-kpi-val">{conversao === null ? "—" : <Num v={conversao * 100} fmt={(n) => `${Math.round(n)}%`} />}</span>
          </span>
          <span className="crm-kpi-sub">{ganhos.length} fechados de {ganhos.length + perdidos.length} decididos</span>
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
        <button className="crm-kpi crm-kpi-acao" data-alerta={frios > 0} onClick={() => mudar({ situacao: f.situacao === "esperando" ? "todas" : "esperando" })} aria-pressed={f.situacao === "esperando"}>
          <span className="crm-kpi-rot">{frios ? <Flame aria-hidden /> : <Hourglass aria-hidden />} Sua vez</span>
          <span className="crm-kpi-val"><Num v={vez.length} /></span>
          <span className="crm-kpi-sub">{frios ? `${frios} esfriando há +6 h` : vez.length ? "Responda rápido: lead esfria" : "Tudo respondido 👏"}</span>
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
        <label className="crm-busca"><Search size={15} aria-hidden /><input placeholder="Buscar nome, número, e-mail, mensagem ou campanha" value={f.busca} onChange={(e) => mudar({ busca: e.target.value })} />
          {f.busca && <button onClick={() => mudar({ busca: "" })} aria-label="Limpar busca"><X size={14} /></button>}</label>
        <FiltrosSalvos salvos={salvos} atual={f} aplicar={setF} />
        <button className="crm-btn" data-ativo={ativos > 0} onClick={() => setModalFiltros(true)}>
          <SlidersHorizontal aria-hidden /> Filtros{ativos ? <span className="crm-n">{ativos}</span> : null}
        </button>
        <span className="crm-barra-dir">
          <label className="crm-btn crm-ordem"><span className="subtle">Ordenar:</span> {ORDENS[f.ordem]}<ChevronDown aria-hidden />
            <select value={f.ordem} onChange={(e) => mudar({ ordem: e.target.value as FiltrosCrm["ordem"] })} aria-label="Ordenar">
              {Object.entries(ORDENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button className="crm-btn" onClick={() => setFunil(true)}><Settings2 aria-hidden /> Colunas</button>
        </span>
      </div>

      {chips.length > 0 && (
        <div className="crm-chips-ativos">
          {chips.map(([rot, tirar]) => <button key={rot} className="crm-chip-ativo" onClick={tirar}>{rot}<X aria-hidden /></button>)}
          <button className="crm-limpar" onClick={() => setF({ ...PADRAO, periodo: f.periodo, ordem: f.ordem })}>Limpar tudo</button>
        </div>
      )}

      {!vistos.length && (
        <div className="crm-sem panel"><Search size={18} aria-hidden /> Nenhum lead {Number.isFinite(janela) ? "neste período" : ""}{ativos ? " com esses filtros" : ""}.
          {f.periodo !== "tudo" && <button className="btn btn-ghost btn-xs" onClick={() => mudar({ periodo: "tudo" })}>Ver todo o período</button>}</div>
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
                    onArrastar={setArrastando} mover={mover} abrir={() => setDetalhe(l.numero)} />
                ))}
                {!itens.length && <div className="crm-col-vazio">{arrastando ? "Solte aqui" : "Nenhum lead"}</div>}
              </div>
            </section>
          );
        })}
      </div>

      {aberta && <LeadDetalhe l={aberta} etapas={etapas} aberto={aberto(aberta)} mover={mover} fechar={() => setDetalhe(null)} />}
      {modalFiltros && <ModalFiltros inicial={f} origens={todasOrigens} sites={sites} contar={contar} aplicar={(r) => { setF(r); setModalFiltros(false); }} fechar={() => setModalFiltros(false)} />}
      {funil && <EditarFunil etapas={etapas} contagem={Object.fromEntries(etapas.map((e) => [e.chave, lista.filter((l) => colunaDe(l) === e.chave).length]))} fechar={() => setFunil(false)} />}
    </div>
  );
}

/** Período em pílulas; o indicador desliza (GSAP) até a opção escolhida. */
function Segmento({ valor, onChange }: { valor: FiltrosCrm["periodo"]; onChange: (p: FiltrosCrm["periodo"]) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const ind = useRef<HTMLSpanElement>(null);
  const primeira = useRef(true);
  useLayoutEffect(() => {
    const b = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!b || !ind.current) return;
    const pos = { x: b.offsetLeft, width: b.offsetWidth };
    if (primeira.current || reduzido()) { gsap.set(ind.current, pos); primeira.current = false; return; }
    gsap.to(ind.current, { ...pos, duration: 0.45, ease: "expo.out" });
  }, [valor]);
  return (
    <div className="crm-periodos" ref={ref} role="tablist" aria-label="Período">
      <span className="crm-periodos-ind" ref={ind} aria-hidden />
      {PERIODOS.map(([k, rot]) => <button key={k} role="tab" aria-selected={valor === k} className="crm-periodo" onClick={() => onChange(k)}>{rot}</button>)}
    </div>
  );
}

/** Menu dos filtros salvos: aplicar, favoritar (abre já aplicado), apagar e salvar o atual. */
function FiltrosSalvos({ salvos, atual, aplicar }: { salvos: FiltroSalvo[]; atual: FiltrosCrm; aplicar: (f: FiltrosCrm) => void }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [pend, start] = useTransition();
  const chave = chaveFiltro(atual);
  const ativo = salvos.find((x) => chaveFiltro(x.filtros) === chave);
  const padrao = chave === chaveFiltro(PADRAO);
  const feito = (r: { ok: true } | { ok: false; error: string }, msg?: string) => { if (!r.ok) return toast.err(r.error); if (msg) toast.ok(msg); router.refresh(); };
  const usar = (f: FiltrosCrm) => { aplicar(f); setAberto(false); };
  const salvar = () => start(async () => {
    const r = await salvarFiltro(nome, atual);
    if (r.ok) setNome("");
    feito(r, "Filtro salvo");
  });
  return (
    <span style={{ position: "relative" }}>
      <button className="crm-btn crm-salvos-btn" data-favorito={!!ativo?.favorito} onClick={() => setAberto(!aberto)} aria-haspopup="menu" aria-expanded={aberto}>
        {ativo?.favorito ? <Star className="crm-estrela-on" aria-hidden /> : <Bookmark aria-hidden />}
        <span className="crm-trunc">{ativo?.nome ?? (padrao ? "Todos os leads" : "Filtro personalizado")}</span>
        <ChevronDown aria-hidden />
      </button>
      <Popover open={aberto} onClose={() => setAberto(false)} width={320}>
        <div className="crm-salvos">
          <span className="crm-salvos-rot">Filtros salvos</span>
          <button className="menu-item crm-salvo" data-ativo={padrao} onClick={() => usar(PADRAO)}><Sparkles aria-hidden /><span>Todos os leads</span>{padrao && <Check className="crm-salvo-ok" aria-hidden />}</button>
          {salvos.map((x) => (
            <div key={x.id} className="crm-salvo" data-ativo={ativo?.id === x.id} data-favorito={x.favorito}>
              <button className="crm-salvo-nome" onClick={() => usar(x.filtros)}>
                <span className="crm-trunc">{x.nome}</span>
                {ativo?.id === x.id && <Check className="crm-salvo-ok" aria-hidden />}
              </button>
              <button className="crm-salvo-acao crm-salvo-estrela" aria-pressed={x.favorito} disabled={pend}
                title={x.favorito ? "Favorito: abre já aplicado. Clique para tirar" : "Favoritar: a página abre com este filtro"} aria-label={x.favorito ? `Tirar ${x.nome} dos favoritos` : `Favoritar ${x.nome}`}
                onClick={() => start(async () => feito(await favoritarFiltro(x.favorito ? null : x.id), x.favorito ? undefined : `“${x.nome}” agora abre sempre aplicado`))}><Star aria-hidden /></button>
              <button className="crm-salvo-acao crm-salvo-x" aria-label={`Apagar ${x.nome}`} title="Apagar" disabled={pend}
                onClick={async () => { if (await confirmar(`Apagar o filtro “${x.nome}”?`)) start(async () => feito(await apagarFiltro(x.id))); }}><Trash2 aria-hidden /></button>
            </div>
          ))}
          <div className="etapa-menu-sep" />
          {ativo || padrao ? <p className="crm-salvos-dica">Mude os filtros (botão Filtros, busca ou período) para salvar uma combinação nova.</p> : (
            <form className="crm-salvos-novo" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
              <input className="input" value={nome} maxLength={40} placeholder="Nome para o filtro atual" onChange={(e) => setNome(e.target.value)} aria-label="Nome do filtro" />
              <button className="btn btn-primary btn-xs" disabled={pend || !nome.trim()}>Salvar</button>
            </form>
          )}
        </div>
      </Popover>
    </span>
  );
}

/** Todos os filtros num modal; o botão mostra quantos leads ficam antes de aplicar. */
function ModalFiltros({ inicial, origens, sites, contar, aplicar, fechar }: {
  inicial: FiltrosCrm; origens: string[]; sites: string[]; contar: (f: FiltrosCrm) => number; aplicar: (f: FiltrosCrm) => void; fechar: () => void;
}) {
  const [r, setR] = useState(inicial);
  const m = (p: Partial<FiltrosCrm>) => setR((x) => ({ ...x, ...p }));
  const n = contar(r);
  const corpo = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => entrar(corpo.current?.querySelectorAll(".crm-mf-grupo") ?? [], { y: 10 }, { stagger: 0.05, delay: 0.1, duration: 0.45 }), []);
  return (
    <Dialog open onClose={fechar} title="Filtros">
      <div className="crm-mf" ref={corpo}>
        <Bloco titulo="Período" icone={<CalendarClock aria-hidden />}>
          {PERIODOS.map(([k, rot]) => <Opcao key={k} on={r.periodo === k} onClick={() => m({ periodo: k })}>{rot}</Opcao>)}
        </Bloco>
        <Bloco titulo="Situação" icone={<Hourglass aria-hidden />}>
          {Object.entries(SITUACOES).map(([k, v]) => <Opcao key={k} on={r.situacao === k} onClick={() => m({ situacao: k as FiltrosCrm["situacao"] })}>{v}</Opcao>)}
        </Bloco>
        {origens.length > 0 && <Bloco titulo="Origem" icone={<Globe aria-hidden />} dica="Escolha uma ou mais">
          {origens.map((o) => <Opcao key={o} on={r.origens.includes(o)} onClick={() => m({ origens: alternar(r.origens, o) })}>{o}</Opcao>)}
        </Bloco>}
        {sites.length > 1 && <Bloco titulo="Site" icone={<Link2 aria-hidden />} dica="Escolha um ou mais">
          {sites.map((s) => <Opcao key={s} on={r.sites.includes(s)} onClick={() => m({ sites: alternar(r.sites, s) })}>{s}</Opcao>)}
        </Bloco>}
        <Bloco titulo="Valor do negócio" icone={<CircleDollarSign aria-hidden />}>
          {Object.entries(VALORES).map(([k, v]) => <Opcao key={k} on={r.valor === k} onClick={() => m({ valor: k as FiltrosCrm["valor"] })}>{v}</Opcao>)}
        </Bloco>
        <Bloco titulo="Ordenar" icone={<ArrowRightLeft aria-hidden />}>
          {Object.entries(ORDENS).map(([k, v]) => <Opcao key={k} on={r.ordem === k} onClick={() => m({ ordem: k as FiltrosCrm["ordem"] })}>{v}</Opcao>)}
        </Bloco>
      </div>
      <footer className="crm-mf-pe">
        <button className="btn btn-ghost btn-sm" onClick={() => setR({ ...PADRAO, busca: r.busca })}>Limpar</button>
        <button className="btn btn-primary btn-sm" onClick={() => aplicar(r)}><Check aria-hidden /> Mostrar {n} lead{n === 1 ? "" : "s"}</button>
      </footer>
    </Dialog>
  );
}
function Bloco({ titulo, icone, dica, children }: { titulo: string; icone: ReactNode; dica?: string; children: ReactNode }) {
  return (
    <fieldset className="crm-mf-grupo">
      <legend>{icone}{titulo}{dica && <small>{dica}</small>}</legend>
      <div className="crm-mf-opcoes">{children}</div>
    </fieldset>
  );
}
const Opcao = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" className="crm-opcao" aria-pressed={on} onClick={onClick}>{on && <Check aria-hidden />}{children}</button>
);

function Cartao({ l, aberto, etapas, solto, arrastando, onArrastar, mover, abrir }: {
  l: Lead; aberto: boolean; etapas: EtapaCrm[]; solto: boolean; arrastando: boolean;
  onArrastar: (n: string | null) => void; mover: (n: string, e: string | null) => void; abrir: () => void;
}) {
  const vez = aberto && suaVez(l);
  const frio = aberto && esfriando(l);
  const diasParado = aberto && parado(l) ? Math.floor(desde(l.etapa_em) / DIA) : 0;
  const parar = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <article className="crm-card" data-flip-id={l.numero} data-solto={solto} data-arrastando={arrastando} data-frio={frio} draggable
      tabIndex={0} role="button" aria-label={`${l.nome}: ver detalhes`} onClick={abrir} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrir(); } }}
      onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", l.numero); ev.dataTransfer.effectAllowed = "move"; onArrastar(l.numero); }}
      onDragEnd={() => onArrastar(null)}>
      <div className="crm-card-topo">
        <span className="crm-avatar" aria-hidden>{iniciais(l.nome)}</span>
        <span className="crm-card-id">
          <b className="crm-card-nome crm-trunc">{l.nome}</b>
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
        <span onClick={parar} onKeyDown={parar}><Valor l={l} /></span>
        <Situacao l={l} aberto={aberto} vez={vez} frio={frio} />
        <span className="crm-card-acoes" onClick={parar} onKeyDown={parar}>
          <Link href={`/crm?c=${l.numero}`} className="crm-icone crm-icone-wa" aria-label={`Conversar com ${l.nome} no WhatsApp`} title="Abrir conversa no WhatsApp" draggable={false}><WhatsappIcon aria-hidden /></Link>
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

function Situacao({ l, aberto, vez, frio }: { l: Lead; aberto: boolean; vez: boolean; frio: boolean }) {
  return frio ? <span className="crm-sit" data-tom="frio" suppressHydrationWarning><Flame aria-hidden /> esfriando {tempo(desde(l.ultima ?? l.lead_em))}</span>
    : vez ? <span className="crm-sit" data-tom="vez"><i /> sua vez</span>
    : l.respondeu ? <span className="crm-sit" data-tom="ok"><MessageCircle aria-hidden /> {l.msgs} msg</span>
    : aberto && l.primeira_resp ? <span className="crm-sit">aguardando lead</span> : null;
}

/** Ficha do lead: etapa, valor, tempos, origem, mensagem e atalhos. */
function LeadDetalhe({ l, etapas, aberto, mover, fechar }: { l: Lead; etapas: EtapaCrm[]; aberto: boolean; mover: (n: string, e: string | null) => void; fechar: () => void }) {
  const e = etapas.find((x) => x.chave === l.etapa);
  const corpo = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => entrar(corpo.current?.querySelectorAll("[data-surge]") ?? [], { y: 12 }, { stagger: 0.05, delay: 0.08, duration: 0.5 }), []);
  const resp = l.primeira_resp ? new Date(l.primeira_resp).getTime() - new Date(l.lead_em).getTime() : null;
  return (
    <Dialog open onClose={fechar} title="Lead">
      <div className="crm-ficha" ref={corpo} style={corEtapa(e)}>
        <header className="crm-ficha-topo" data-surge>
          <span className="crm-avatar crm-avatar-g" aria-hidden>{iniciais(l.nome)}</span>
          <span className="crm-ficha-id">
            <b>{l.nome}</b>
            <span className="subtle small">{formatarNumero(l.numero)}{l.email ? ` · ${l.email}` : ""}</span>
          </span>
        </header>
        <div className="crm-ficha-linha" data-surge>
          <EtapaSeletor etapas={etapas} valor={l.etapa} onChange={(k) => mover(l.numero, k)} nenhum="Tirar do funil" align="left" />
          <Valor l={l} />
          <Situacao l={l} aberto={aberto} vez={aberto && suaVez(l)} frio={aberto && esfriando(l)} />
        </div>
        <div className="crm-ficha-acoes" data-surge>
          <Link href={`/crm?c=${l.numero}`} className="btn btn-primary btn-sm crm-btn-wa"><WhatsappIcon aria-hidden /> Conversar no WhatsApp</Link>
          {l.email && <a href={`mailto:${l.email}`} className="btn btn-ghost btn-sm"><Mail aria-hidden /> E-mail</a>}
        </div>
        <dl className="crm-ficha-nums" data-surge>
          <div><dt>Chegou</dt><dd suppressHydrationWarning>{dataHora(l.lead_em)}</dd><small suppressHydrationWarning>há {tempo(desde(l.lead_em))}</small></div>
          <div><dt>Nesta etapa</dt><dd suppressHydrationWarning>{tempo(desde(l.etapa_em))}</dd><small>{e?.nome ?? "—"}</small></div>
          <div><dt>1ª resposta</dt><dd>{resp === null ? "Ainda não" : tempo(resp)}</dd><small>{resp === null ? "ninguém falou com o lead" : "depois que chegou"}</small></div>
          <div><dt>Mensagens</dt><dd>{l.msgs}</dd><small suppressHydrationWarning>{l.ultima ? `última há ${tempo(desde(l.ultima))}` : "nenhuma ainda"}</small></div>
        </dl>
        {l.mensagem && <blockquote className="crm-ficha-msg" data-surge><MessageCircle aria-hidden />{l.mensagem}</blockquote>}
        <ul className="crm-ficha-info" data-surge>
          <li><Globe aria-hidden /><span>Origem</span><b>{origemDe(l)}</b></li>
          {l.site && <li><Link2 aria-hidden /><span>Site</span><b>{l.site}</b></li>}
          {l.pagina && <li><ExternalLink aria-hidden /><span>Página</span><a href={l.pagina} target="_blank" rel="noreferrer" className="crm-trunc">{l.pagina.replace(/^https?:\/\//, "")}</a></li>}
          {(l.utm || l.campanha) && <li><Megaphone aria-hidden /><span>Anúncio</span><b>{[l.utm, l.campanha].filter(Boolean).join(" · ")}</b></li>}
          {l.consentimento_em && <li><ShieldCheck aria-hidden /><span>Consentimento</span><b suppressHydrationWarning>aceitou contato em {dataHora(l.consentimento_em)}</b></li>}
        </ul>
      </div>
    </Dialog>
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
    <button type="button" className="crm-valor" data-vazio={!num(l.valor)} onClick={() => setEdit(true)} aria-busy={pend} title="Valor do negócio">
      {num(l.valor) ? reais(l.valor!, true) : "+ valor"}
    </button>
  );
}

/** Número que conta até o valor novo (GSAP). */
export function Num({ v, fmt = (n) => Math.round(n).toLocaleString("pt-BR") }: { v: number; fmt?: (n: number) => string }) {
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
    return () => { t.progress(1).kill(); };
  }, [v]);
  return <span ref={ref}>{fmt(0)}</span>;
}

/** Leads por dia (ou por hora, em "Hoje"), barras que crescem. */
export function Barras({ valores }: { valores: number[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const max = Math.max(1, ...valores);
  const chave = valores.join();
  useEffect(() => {
    if (!ref.current || reduzido()) return;
    const t = gsap.fromTo(ref.current.querySelectorAll("rect"), { scaleY: 0 }, { scaleY: 1, transformOrigin: "50% 100%", duration: 0.7, stagger: 0.015, ease: "expo.out" });
    return () => { t.progress(1).kill(); };
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
  const C = 2 * Math.PI * 18;
  useEffect(() => {
    if (!ref.current) return;
    const fim = C * (1 - (vazio ? 0 : pct));
    if (reduzido()) { ref.current.style.strokeDashoffset = String(fim); return; }
    const t = gsap.to(ref.current, { strokeDashoffset: fim, duration: 1.1, ease: "power3.out" });
    return () => { t.progress(1).kill(); };
  }, [pct, vazio, C]);
  return (
    <svg className="crm-anel" viewBox="0 0 44 44" aria-hidden>
      <circle cx="22" cy="22" r="18" className="crm-anel-fundo" />
      <circle ref={ref} cx="22" cy="22" r="18" className="crm-anel-traco" strokeDasharray={C} strokeDashoffset={C} />
    </svg>
  );
}
