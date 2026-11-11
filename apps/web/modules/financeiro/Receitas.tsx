"use client";

import { brl, nomeMes, somarMeses, type Receita, type ResumoReceitas } from "@domus-ads/core/financeiro";
import { gsap } from "gsap";
import { ArrowDownRight, ArrowUpRight, Building2, ChevronLeft, ChevronRight, Globe, Landmark, Link2, Timer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { CountUp } from "../motion/CountUp";
import { entrar, reduzido } from "../motion/entrar";
import { HeroFx } from "../shell/HeroFx";
import { usePulso } from "../shell/usePulso";
import { Enche, Onda, Rosca, RENDA } from "./graficos";

export interface DadosReceitas {
  mes: string; mesHoje: string; r: ResumoReceitas; anterior: number; media: number;
  cores: Record<string, string>; contas: Record<string, string>; ultimaSync: string | null;
}

const ORIGEM: Record<Receita["origem"], { rotulo: string; icone: typeof Globe; dica: string }> = {
  banco: { rotulo: "Banco", icone: Landmark, dica: "Entrada no extrato" },
  site: { rotulo: "Site · a liberar", icone: Timer, dica: "Venda paga no site; o dinheiro ainda não apareceu no banco" },
  conciliada: { rotulo: "Site + banco", icone: Link2, dica: "Venda do site e crédito no banco: a mesma receita, contada uma vez" },
};

/** Receitas ao vivo: PF + PJ + vendas dos sites num número só, sem contar duas vezes; atualiza sozinha. */
export function Receitas({ d }: { d: DadosReceitas }) {
  const { r } = d;
  const raiz = useRef<HTMLDivElement>(null);
  const numero = useRef<HTMLDivElement>(null);
  const [nova, setNova] = useState<Receita | null>(null);
  const visto = useRef<{ mes: string; ids: Set<string> } | null>(null);
  const aoVivo = d.mes === d.mesHoje;
  usePulso("financeiro", aoVivo ? 15_000 : 60_000, true, aoVivo);
  const cor = (f: string) => d.cores[f] ?? RENDA;
  const v = d.anterior > 0 ? (r.total - d.anterior) / d.anterior : null;

  useLayoutEffect(() => entrar(raiz.current?.querySelectorAll("[data-enter]") ?? [], { y: 22 }, { stagger: 0.07 }), [d.mes]);

  // entrada nova enquanto a tela está aberta: o número pulsa e a entrada sobe como um aviso
  useLayoutEffect(() => {
    const ids = new Set(r.entradas.map((e) => e.id));
    const antes = visto.current;
    visto.current = { mes: d.mes, ids };
    if (!antes || antes.mes !== d.mes) return;
    const chegou = r.entradas.find((e) => !antes.ids.has(e.id) && e.valor > 0);
    if (!chegou) return;
    setNova(chegou);
    if (!reduzido() && numero.current) gsap.fromTo(numero.current, { scale: 1.08, filter: "brightness(1.8)" }, { scale: 1, filter: "brightness(1)", duration: 1.4, ease: "elastic.out(1, 0.5)", clearProps: "transform,filter" });
    const t = setTimeout(() => setNova(null), 6000);
    return () => clearTimeout(t);
  }, [r.entradas, d.mes]);

  const url = (m: string) => `/financeiro/receitas?mes=${m.slice(0, 7)}`;
  const proximo = somarMeses(d.mes, 1);
  const fontes = r.porFonte.map((f) => ({ ...f, cor: cor(f.nome) }));

  return (
    <div className="page fin fin-rec" ref={raiz}>
      <div className="page-head fin-rec-palco">
        <HeroFx />
        <div className="fin-rec-topo" data-enter>
          <span className="fin-rec-vivo" data-on={aoVivo || undefined}><i aria-hidden />{aoVivo ? "Ao vivo" : "Fechado"}</span>
          <div className="fin-mes">
            <Link className="btn btn-ghost btn-sm" href={url(somarMeses(d.mes, -1))} aria-label="Mês anterior"><ChevronLeft aria-hidden /></Link>
            <span>{nomeMes(d.mes).slice(0, 3)}/{d.mes.slice(2, 4)}</span>
            <Link className="btn btn-ghost btn-sm" href={url(proximo)} aria-label="Próximo mês" aria-disabled={proximo > d.mesHoje}
              style={proximo > d.mesHoje ? { pointerEvents: "none", opacity: 0.4 } : undefined}><ChevronRight aria-hidden /></Link>
          </div>
        </div>
        <div className="fin-rec-centro">
          <span className="eyebrow" data-enter>Receitas de {nomeMes(d.mes)} {d.mes.slice(0, 4)}</span>
          <div className="fin-rec-numero tabular" ref={numero} data-enter data-neg={r.total < 0 || undefined}>
            <span className="fin-rec-anel" aria-hidden /><span className="fin-rec-anel" aria-hidden />
            <CountUp value={r.total / 100} kind="money" duration={2} />
          </div>
          <div className="fin-rec-sub" data-enter>
            {v != null && Number.isFinite(v) && (
              <span className="fin-rec-var" data-tom={v >= 0 ? "bom" : "ruim"}>{v >= 0 ? <ArrowUpRight aria-hidden /> : <ArrowDownRight aria-hidden />}{Math.abs(Math.round(v * 100))}% vs {nomeMes(somarMeses(d.mes, -1))}</span>
            )}
            <span>Média 12 meses <b className="tabular">{brl(d.media)}</b></span>
          </div>
          <div className="fin-rec-chips" data-enter>
            <span><small>Pessoa física</small><b className="tabular"><CountUp value={r.pf / 100} kind="money" /></b></span>
            <span><small>Pessoa jurídica</small><b className="tabular"><CountUp value={r.pj / 100} kind="money" /></b></span>
            <span><small>Vendas no site</small><b className="tabular"><CountUp value={r.site / 100} kind="money" /></b><em>{r.vendas} {r.vendas === 1 ? "venda" : "vendas"}</em></span>
          </div>
        </div>
        {nova && (
          <div className="fin-rec-toast" role="status" key={nova.id}>
            <b>+{brl(nova.valor)}</b><span>{nova.fonte} · {nova.descricao}</span>
          </div>
        )}
        <Onda valores={r.serie.map((s) => s.valor)} cor="#34d399" />
      </div>

      {r.aLiberar > 0 && (
        <p className="fin-rec-nota" data-enter><Timer aria-hidden />{brl(r.aLiberar)} de vendas do site ainda não apareceram no banco. Já contam aqui; quando o crédito chegar, vira uma receita só.</p>
      )}

      <div className="fin-rec-fontes" data-enter>
        {fontes.map((f) => (
          <div key={f.nome} className="fin-rec-fonte" style={{ "--f": f.cor } as React.CSSProperties}>
            <span className="fin-rec-fonte-nome"><i />{f.nome}</span>
            <b className="tabular"><CountUp value={f.valor / 100} kind="money" /></b>
            <Enche fracao={f.valor / (r.total || 1)} cor={f.cor} />
            <small>{Math.round((f.valor / (r.total || 1)) * 100)}% do mês</small>
          </div>
        ))}
        {!fontes.length && <div className="empty">Nenhuma receita neste mês ainda.</div>}
      </div>

      <div className="fin-grade-2 fin-grade-larga">
        <section className="panel fin-painel" data-enter>
          <header className="panel-head"><span className="panel-title">Entradas</span>
            <span className="caption subtle">{d.ultimaSync ? `Bancos atualizados ${new Date(d.ultimaSync).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Bancos nunca sincronizados"}</span></header>
          <ul className="fin-rec-feed">
            {r.entradas.map((e) => {
              const o = ORIGEM[e.origem];
              const Icone = e.origem === "banco" ? (e.pessoa === "PJ" ? Building2 : Landmark) : Globe;
              return (
                <li key={e.id} data-nova={nova?.id === e.id || undefined}>
                  <span className="fin-rec-ico" style={{ "--f": cor(e.fonte) } as React.CSSProperties}><Icone aria-hidden /></span>
                  <span className="fin-rec-txt">
                    <b>{e.descricao}</b>
                    <small>{e.data.slice(8, 10)}/{e.data.slice(5, 7)} · {e.fonte}{e.pessoa ? ` · ${e.pessoa}` : ""}{e.contaId && d.contas[e.contaId] ? ` · ${d.contas[e.contaId]}` : ""}</small>
                  </span>
                  <span className="fin-rec-origem" data-o={e.origem} title={o.dica}><o.icone aria-hidden />{o.rotulo}</span>
                  <span className="fin-rec-valor tabular">
                    <b className={e.valor < 0 ? "neg" : "pos"}>{e.valor < 0 ? "−" : "+"}{brl(Math.abs(e.valor))}</b>
                    {e.bruto != null && e.taxa ? <small>{brl(e.bruto)} − taxa {brl(e.taxa)}</small> : null}
                  </span>
                </li>
              );
            })}
            {!r.entradas.length && <li className="subtle">Nada entrou neste mês.</li>}
          </ul>
        </section>
        <div className="fin-rec-lado">
          <section className="panel fin-painel fin-centro" data-enter>
            <Rosca fatias={fontes} total={r.total} rotulo="Receitas" />
          </section>
          <section className="panel fin-painel" data-enter>
            <header className="panel-head"><span className="panel-title">12 meses</span><span className="caption subtle">Clique para abrir o mês</span></header>
            <Colunas serie={r.serie} mes={d.mes} />
          </section>
        </div>
      </div>
    </div>
  );
}

/** Colunas dos 12 meses: crescem em cascata; o mês aberto acende. */
function Colunas({ serie, mes }: { serie: { mes: string; valor: number }[]; mes: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const router = useRouter();
  const W = 360, H = 150, P = 18;
  const max = Math.max(1, ...serie.map((s) => s.valor));
  const larg = (W - P * 2) / serie.length;
  const alt = (v: number) => (Math.max(0, v) / max) * (H - P * 2);
  useLayoutEffect(() => {
    if (!ref.current || reduzido()) return;
    const t = gsap.from(ref.current.querySelectorAll(".fin-rec-col"), { attr: { y: H - P, height: 0 }, duration: 0.8, ease: "expo.out", stagger: 0.04 });
    return () => { t.progress(1).kill(); };
  }, [serie]);
  return (
    <svg ref={ref} className="fin-rec-colunas" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Receitas dos últimos 12 meses">
      {serie.map((s, i) => (
        <g key={s.mes} className="fin-rec-mes" data-atual={s.mes === mes || undefined} onClick={() => router.push(`/financeiro/receitas?mes=${s.mes.slice(0, 7)}`)}>
          <title>{`${nomeMes(s.mes)} ${s.mes.slice(0, 4)}: ${brl(s.valor)}`}</title>
          <rect className="fin-rec-col" x={P + larg * i + larg * 0.18} y={H - P - alt(s.valor)} width={larg * 0.64} height={alt(s.valor)} rx={4} />
          <text x={P + larg * i + larg / 2} y={H - 4} className="fin-rot">{nomeMes(s.mes).slice(0, 1)}</text>
        </g>
      ))}
    </svg>
  );
}
