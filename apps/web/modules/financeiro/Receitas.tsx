"use client";

import { andarPeriodo, brl, inicioPeriodo, nomeMes, type PeriodoRec, type Receita, type ResumoReceitas } from "@domus-ads/core/financeiro";
import { gsap } from "gsap";
import { ArrowDownRight, ArrowUpRight, Building2, ChevronDown, ChevronLeft, ChevronRight, EyeOff, Globe, Landmark, Link2, Loader2, RotateCcw, Timer, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { CountUp } from "../motion/CountUp";
import { entrar, reduzido } from "../motion/entrar";
import { HeroFx } from "../shell/HeroFx";
import { toast } from "../shell/toast";
import { usePulso } from "../shell/usePulso";
import { classificar } from "./actions";
import { Enche, Onda, Rosca } from "./graficos";

export type ReceitaNota = Receita & { nota: string | null };
export interface DadosReceitas {
  hoje: string; r: ResumoReceitas; anterior: number; media: number; desconsideradas: ReceitaNota[]; notas: Record<string, string>;
  cores: Record<string, string>; contas: Record<string, string>; ultimaSync: string | null;
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

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
function rotulos(p: PeriodoRec, inicio: string, fim: string, hoje: string) {
  const atual = inicio === inicioPeriodo(p, hoje);
  if (p === "dia") return { titulo: atual ? "Receitas de hoje" : `Receitas de ${dm(inicio)}`, curto: dm(inicio) };
  if (p === "semana") return { titulo: atual ? "Receitas desta semana" : `Receitas de ${dm(inicio)} a ${dm(fim)}`, curto: `${inicio.slice(8, 10)}–${dm(fim)}` };
  return { titulo: `Receitas de ${nomeMes(inicio)} ${inicio.slice(0, 4)}`, curto: `${nomeMes(inicio).slice(0, 3)}/${inicio.slice(2, 4)}` };
}

/** Receitas ao vivo: PF + PJ + vendas dos sites num número só, sem contar duas vezes; atualiza sozinha. */
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
  const v = d.anterior > 0 ? (r.total - d.anterior) / d.anterior : null;
  const rot = rotulos(r.periodo, r.inicio, r.fim, d.hoje);
  const url = (p: PeriodoRec, data: string) => `/financeiro/receitas?p=${p}&d=${data}`;
  const proximo = andarPeriodo(r.periodo, r.inicio, 1);

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    entrar(el.querySelectorAll("[data-enter]"), { y: 22 }, { stagger: 0.07 });
    if (reduzido()) return;
    const tl = gsap.timeline();
    tl.from(el.querySelectorAll(".fin-rec-fonte"), { y: 26, scale: 0.94, opacity: 0, duration: 0.7, ease: "back.out(1.6)", stagger: 0.07, clearProps: "transform,opacity" }, 0.2)
      .from(el.querySelectorAll(".fin-rec-feed > li"), { x: -18, opacity: 0, duration: 0.5, ease: "power3.out", stagger: 0.035, clearProps: "transform,opacity" }, 0.3);
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
    if (!reduzido() && numero.current) gsap.fromTo(numero.current, { scale: 1.1, filter: "brightness(1.9)" }, { scale: 1, filter: "brightness(1)", duration: 1.4, ease: "elastic.out(1, 0.5)", clearProps: "transform,filter" });
    const t = setTimeout(() => setNova(null), 6000);
    return () => clearTimeout(t);
  }, [r.entradas, r.inicio]);

  const trocar = (p: PeriodoRec) => {
    const alvo = seletor.current?.querySelector<HTMLElement>(`[data-p="${p}"]`);
    if (alvo && pilula.current && !reduzido()) gsap.to(pilula.current, { x: alvo.offsetLeft, width: alvo.offsetWidth, duration: 0.45, ease: "expo.out" });
    router.push(url(p, aoVivo ? d.hoje : r.inicio)); // período atual segue em "hoje"; um passado abre no começo dele
  };

  const fontes = r.porFonte.map((f) => ({ ...f, cor: cor(f.nome) }));
  const fita = r.entradas.filter((e) => e.valor > 0).slice(0, 12);

  return (
    <div className="page fin fin-rec" ref={raiz}>
      <div className="page-head fin-rec-palco">
        <HeroFx />
        <div className="fin-rec-particulas" aria-hidden>
          {Array.from({ length: 18 }, (_, i) => <i key={i} style={{ "--x": `${(i * 53) % 100}%`, "--t": `${6 + (i % 5) * 1.6}s`, "--a": `${-(i * 0.9)}s`, "--s": `${3 + (i % 4) * 2}px` } as React.CSSProperties} />)}
        </div>
        <div className="fin-rec-topo" data-enter>
          <span className="fin-rec-vivo" data-on={aoVivo || undefined}><i aria-hidden />{aoVivo ? "Ao vivo" : "Fechado"}</span>
          <div className="fin-rec-periodos" ref={seletor} role="tablist" aria-label="Período">
            <span className="fin-rec-periodos-pilula" ref={pilula} aria-hidden />
            {PERIODOS.map(([p, l]) => <button key={p} data-p={p} role="tab" aria-current={r.periodo === p} onClick={() => trocar(p)}>{l}</button>)}
          </div>
          <div className="fin-mes">
            <Link className="btn btn-ghost btn-sm" href={url(r.periodo, andarPeriodo(r.periodo, r.inicio, -1))} aria-label={`${cap(NOME_PERIODO[r.periodo])} anterior`}><ChevronLeft aria-hidden /></Link>
            <span>{rot.curto}</span>
            <Link className="btn btn-ghost btn-sm" href={url(r.periodo, proximo)} aria-label={`Próximo ${NOME_PERIODO[r.periodo]}`} aria-disabled={proximo > d.hoje}
              style={proximo > d.hoje ? { pointerEvents: "none", opacity: 0.4 } : undefined}><ChevronRight aria-hidden /></Link>
            {!aoVivo && <Link className="fin-hoje" href={url(r.periodo, d.hoje)}>hoje</Link>}
          </div>
        </div>

        <div className="fin-rec-centro">
          <span className="eyebrow" data-enter>{rot.titulo}</span>
          <div className="fin-rec-numero-caixa" data-enter>
            <span className="fin-rec-orbita" aria-hidden><i /></span><span className="fin-rec-orbita" aria-hidden><i /></span>
            <span className="fin-rec-anel" aria-hidden /><span className="fin-rec-anel" aria-hidden />
            <div className="fin-rec-numero tabular" ref={numero} data-neg={r.total < 0 || undefined}>
              <CountUp value={r.total / 100} kind="money" duration={2} />
            </div>
          </div>
          <div className="fin-rec-sub" data-enter>
            {v != null && Number.isFinite(v) && (
              <span className="fin-rec-var" data-tom={v >= 0 ? "bom" : "ruim"}>{v >= 0 ? <ArrowUpRight aria-hidden /> : <ArrowDownRight aria-hidden />}{Math.abs(Math.round(v * 100))}% vs {NOME_PERIODO[r.periodo]} anterior</span>
            )}
            <span>Média por {NOME_PERIODO[r.periodo]} <b className="tabular">{brl(d.media)}</b></span>
          </div>
          <div className="fin-rec-chips" data-enter>
            <span><small>Pessoa física</small><b className="tabular"><CountUp value={r.pf / 100} kind="money" /></b></span>
            <span><small>Pessoa jurídica</small><b className="tabular"><CountUp value={r.pj / 100} kind="money" /></b></span>
            <span><small>Vendas no site</small><b className="tabular"><CountUp value={r.site / 100} kind="money" /></b><em>{r.vendas} {r.vendas === 1 ? "venda" : "vendas"}</em></span>
          </div>
        </div>

        {fita.length > 0 && (
          <div className="fin-rec-fita" aria-hidden>
            <div style={{ "--dur": `${Math.max(24, fita.length * 5)}s` } as React.CSSProperties}>
              {[0, 1].map((k) => (
                <span key={k}>{fita.map((e) => <em key={`${k}${e.id}`}><i style={{ background: cor(e.fonte) }} /><b>+{brl(e.valor)}</b>{e.fonte} · {e.descricao}</em>)}</span>
              ))}
            </div>
          </div>
        )}
        {nova && (
          <div className="fin-rec-toast" role="status" key={nova.id}>
            <b>+{brl(nova.valor)}</b><span>{nova.fonte} · {nova.descricao}</span>
          </div>
        )}
        <Onda valores={r.serie.map((s) => s.valor)} cor="#e9d5ff" />
      </div>

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
