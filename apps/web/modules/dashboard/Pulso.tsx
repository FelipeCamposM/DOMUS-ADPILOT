"use client";

import { reais, type EtapaCrm } from "@domus-ads/core/mensagens";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, CalendarDays, Clapperboard, Globe, Megaphone, MessageCircleReply, Sparkles, Wallet,
} from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { InstagramIcon as Instagram, WhatsappIcon } from "../connections/Logos";
import { corEtapa } from "../mensagens/etapas";
import { Barras, Num } from "../mensagens/Leads";
import { entrar } from "../motion/entrar";

export interface DadosPulso {
  crm: {
    semana: number; anterior: number; hoje: number; suaVez: number; naoLidas: number; pipeline: number; ganhoMes: number; ganhosMes: number;
    dias: number[]; etapas: EtapaCrm[]; funil: Record<string, number>;
    recentes: { numero: string; nome: string; etapa: string; origem: string | null; site: string | null; valor: string | null; lead_em: string }[];
    agendadas: { id: string; para: string; nome: string | null; texto: string; quando: string }[];
  } | null;
  conteudo: {
    publicados: number; agendados: number; aprovar: number; jobs: number; falhas: number;
    posts: { id: string; tipo: string; legenda: string; quando: string }[];
    itens: { id: string; formato: string; tema: string; status: string; quando: string }[];
  };
}

const saudacao = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };
const hora = (d: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(d));
function rotuloDia(d: string) {
  const x = new Date(d).toDateString(), hoje = new Date(), am = new Date(); am.setDate(am.getDate() + 1);
  if (x === hoje.toDateString()) return "Hoje";
  if (x === am.toDateString()) return "Amanhã";
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "short" }).format(new Date(d));
}
function ha(d: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60_000));
  return min < 60 ? `há ${min} min` : min < 48 * 60 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} dias`;
}
const FORMATO: Record<string, string> = { FEED: "Post", CARROSSEL: "Carrossel", REELS: "Reels", STORY: "Story" };

type Evento = { id: string; quando: string; tipo: "msg" | "post" | "pauta"; titulo: string; sub: string; href: string };

/**
 * Topo da visão geral: saudação, atalhos, os números que importam hoje (CRM, conteúdo, anúncios), leads recentes
 * e a agenda dos próximos 14 dias (mensagens agendadas, posts e pautas do calendário).
 */
export function Pulso({ nome, crm, conteudo, ads }: {
  nome: string; crm: DadosPulso["crm"]; conteudo: DadosPulso["conteudo"]; ads: { gasto7: number; moeda: string; campanhas: number } | null;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const r = raiz.current;
    if (!r) return;
    const fins = [
      entrar(r.querySelectorAll(".vg-topo > *"), { y: 10 }, { stagger: 0.06 }),
      entrar(r.querySelectorAll(".vg-kpi"), { y: 18, scale: 0.97 }, { stagger: 0.05, delay: 0.08, duration: 0.6 }),
      entrar(r.querySelectorAll(".vg-bloco"), { y: 20 }, { stagger: 0.08, delay: 0.2, duration: 0.6 }),
      entrar(r.querySelectorAll(".vg-linha"), { x: -10 }, { stagger: 0.03, delay: 0.32, duration: 0.45 }),
    ];
    return () => fins.forEach((f) => f());
  }, []);

  const agenda: Evento[] = [
    ...(crm?.agendadas ?? []).map((a) => ({ id: `m${a.id}`, quando: a.quando, tipo: "msg" as const, titulo: `Mensagem para ${a.nome ?? a.para}`, sub: a.texto.split("\n")[0] ?? "", href: `/crm?c=${a.para}` })),
    ...conteudo.posts.map((p) => ({ id: `p${p.id}`, quando: p.quando, tipo: "post" as const, titulo: `${FORMATO[p.tipo] ?? p.tipo} no Instagram`, sub: p.legenda.split("\n")[0] || "sem legenda", href: "/instagram" })),
    ...conteudo.itens.map((i) => ({ id: `c${i.id}`, quando: i.quando, tipo: "pauta" as const, titulo: i.tema || `${FORMATO[i.formato] ?? i.formato} do calendário`, sub: i.status === "SUGERIDO" ? "sugestão da IA · falta aprovar" : i.status === "GERANDO" ? "gerando a arte" : "aprovado · a arte sai perto da hora", href: "/instagram/calendario" })),
  ].sort((a, b) => a.quando.localeCompare(b.quando)).slice(0, 10);

  const delta = crm && crm.anterior ? Math.round(((crm.semana - crm.anterior) / crm.anterior) * 100) : null;
  const totalFunil = crm ? Object.values(crm.funil).reduce((a, b) => a + b, 0) : 0;
  const etapaDe = (k: string) => crm?.etapas.find((e) => e.chave === k);

  return (
    <div className="vg" ref={raiz}>
      <header className="vg-topo">
        <div>
          <div className="eyebrow" suppressHydrationWarning>{new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date())} · {nome}</div>
          <h1 className="page-title" suppressHydrationWarning>{saudacao()} 👋</h1>
          <p className="muted small" style={{ margin: 0 }}>{resumo(crm, conteudo)}</p>
        </div>
        <nav className="vg-atalhos" aria-label="Atalhos">
          {crm && <Link href="/crm" className="btn btn-secondary btn-sm"><WhatsappIcon aria-hidden /> Mensagens</Link>}
          {crm && <Link href="/crm/leads" className="btn btn-secondary btn-sm"><Sparkles aria-hidden /> Leads</Link>}
          <Link href="/instagram/calendario" className="btn btn-secondary btn-sm"><CalendarDays aria-hidden /> Calendário</Link>
          <Link href="/studio" className="btn btn-secondary btn-sm"><Clapperboard aria-hidden /> Estúdio</Link>
        </nav>
      </header>

      {crm && crm.suaVez > 0 && (
        <Link href="/crm" className="vg-alerta">
          <span className="vg-alerta-ic"><MessageCircleReply aria-hidden /></span>
          <span><b>{crm.suaVez} conversa{crm.suaVez > 1 ? "s esperam" : " espera"} sua resposta</b><small>{crm.naoLidas ? `${crm.naoLidas} mensagem(ns) não lida(s)` : "a última mensagem é do cliente"} · lead respondido rápido fecha mais</small></span>
          <ArrowRight aria-hidden className="vg-alerta-seta" />
        </Link>
      )}

      <div className="vg-kpis">
        {crm && (
          <Kpi href="/crm/leads" hero icone={<Sparkles />} rotulo="Leads · 7 dias" valor={<Num v={crm.semana} />}
            sub={<>{delta != null && <span className="crm-delta" data-sobe={delta >= 0}>{delta >= 0 ? <ArrowUpRight aria-hidden /> : <ArrowDownRight aria-hidden />}{Math.abs(delta)}%</span>}<span>{crm.hoje} hoje · {crm.anterior} na semana anterior</span></>}
            extra={<Barras valores={crm.dias} />} />
        )}
        {crm && (
          <Kpi href="/crm" icone={<MessageCircleReply />} rotulo="Sua vez de responder" valor={<Num v={crm.suaVez} />} tom={crm.suaVez ? "alerta" : "ok"}
            sub={<span>{crm.naoLidas ? `${crm.naoLidas} não lida(s)` : "nenhuma não lida"}</span>} />
        )}
        {crm && (
          <Kpi href="/crm/leads" icone={<Wallet />} rotulo="Pipeline aberto" valor={<Num v={crm.pipeline} fmt={(n) => reais(n, true)} />}
            sub={<span>{crm.ganhosMes ? `${reais(crm.ganhoMes, true)} ganho no mês · ${crm.ganhosMes} negócio(s)` : "nenhum ganho no mês ainda"}</span>} />
        )}
        {ads && (
          <Kpi href="/campaigns" icone={<Megaphone />} rotulo="Investido · 7 dias" valor={<Num v={ads.gasto7} fmt={(n) => n.toLocaleString("pt-BR", { style: "currency", currency: ads.moeda, maximumFractionDigits: 0 })} />}
            sub={<span>{ads.campanhas} campanha(s) ativa(s)</span>} />
        )}
        <Kpi href="/instagram" icone={<Instagram />} rotulo="Posts agendados" valor={<Num v={conteudo.agendados} />}
          sub={<span>{conteudo.publicados} publicado(s) nos últimos 7 dias</span>} />
        <Kpi href="/instagram/calendario" icone={<CalendarDays />} rotulo="Pautas para aprovar" valor={<Num v={conteudo.aprovar} />} tom={conteudo.aprovar ? "alerta" : undefined}
          sub={<span>{conteudo.falhas ? `${conteudo.falhas} job(s) falharam em 24 h` : `${conteudo.jobs} job(s) na fila`}</span>} />
      </div>

      <div className="vg-grade" data-so-agenda={!crm}>
        {crm && (
          <section className="panel vg-bloco">
            <div className="panel-head">
              <span className="panel-title">Leads recentes</span>
              <Link href="/crm/leads" className="btn btn-ghost btn-xs">Abrir funil <ArrowRight aria-hidden /></Link>
            </div>
            {totalFunil > 0 && (
              <div className="crm-dist vg-funil">
                <div className="crm-dist-barra">
                  {crm.etapas.filter((e) => crm.funil[e.chave]).map((e) => <span key={e.chave} style={{ ...corEtapa(e), flexGrow: crm.funil[e.chave] }} title={`${e.nome}: ${crm.funil[e.chave]}`} />)}
                </div>
                <div className="crm-dist-leg">
                  {crm.etapas.filter((e) => crm.funil[e.chave]).map((e) => <span key={e.chave} style={corEtapa(e)}><i className="vg-bola" />{e.nome} <b>{crm.funil[e.chave]}</b></span>)}
                </div>
              </div>
            )}
            <ul className="vg-lista">
              {crm.recentes.map((l) => {
                const e = etapaDe(l.etapa);
                return (
                  <li key={l.numero} className="vg-linha">
                    <Link href={`/crm?c=${l.numero}`}>
                      <span className="vg-avatar" style={corEtapa(e)}>{l.nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}</span>
                      <span className="vg-txt"><b>{l.nome}</b><small>{l.origem ?? (l.site ? `site ${l.site}` : "formulário")}{l.valor ? ` · ${reais(l.valor, true)}` : ""}</small></span>
                      <span className="wa-etapa" style={corEtapa(e)}>{e?.nome ?? l.etapa}</span>
                      <small className="subtle vg-quando" suppressHydrationWarning>{ha(l.lead_em)}</small>
                    </Link>
                  </li>
                );
              })}
              {!crm.recentes.length && (
                <li className="vg-vazio"><Globe aria-hidden /><span>Nenhum lead ainda.<br /><Link href="/crm/sites">Ligue o formulário de um site</Link> para os leads caírem aqui.</span></li>
              )}
            </ul>
          </section>
        )}

        <section className="panel vg-bloco">
          <div className="panel-head">
            <span className="panel-title">Próximos 14 dias</span>
            <Link href="/instagram/calendario" className="btn btn-ghost btn-xs">Calendário <ArrowRight aria-hidden /></Link>
          </div>
          <ol className="vg-agenda">
            {agenda.map((ev, i) => {
              const Ic = ev.tipo === "msg" ? CalendarClock : ev.tipo === "post" ? Instagram : CalendarDays;
              const novoDia = i === 0 || rotuloDia(agenda[i - 1]!.quando) !== rotuloDia(ev.quando);
              return (
                <li key={ev.id} className="vg-linha" data-tipo={ev.tipo}>
                  {novoDia && <span className="vg-dia" suppressHydrationWarning>{rotuloDia(ev.quando)}</span>}
                  <Link href={ev.href}>
                    <span className="vg-hora" suppressHydrationWarning>{hora(ev.quando)}</span>
                    <span className="vg-ic"><Ic aria-hidden /></span>
                    <span className="vg-txt"><b>{ev.titulo}</b><small>{ev.sub}</small></span>
                  </Link>
                </li>
              );
            })}
            {!agenda.length && (
              <li className="vg-vazio"><CalendarClock aria-hidden /><span>Nada agendado.<br />Agende mensagens nas conversas ou gere um <Link href="/instagram/calendario">calendário de conteúdo</Link>.</span></li>
            )}
          </ol>
        </section>
      </div>
    </div>
  );
}

function resumo(crm: DadosPulso["crm"], c: DadosPulso["conteudo"]) {
  const p: string[] = [];
  if (crm) {
    if (crm.hoje) p.push(`${crm.hoje} lead${crm.hoje > 1 ? "s" : ""} hoje`);
    if (crm.suaVez) p.push(`${crm.suaVez} conversa${crm.suaVez > 1 ? "s" : ""} para responder`);
    if (crm.agendadas.length) p.push(`${crm.agendadas.length} mensagem(ns) agendada(s)`);
  }
  if (c.agendados) p.push(`${c.agendados} post(s) na fila`);
  if (c.aprovar) p.push(`${c.aprovar} pauta(s) para aprovar`);
  return p.length ? `${p.join(" · ")}.` : "Tudo em dia por aqui.";
}

function Kpi({ href, icone, rotulo, valor, sub, extra, hero, tom }: {
  href: string; icone: ReactNode; rotulo: string; valor: ReactNode; sub: ReactNode; extra?: ReactNode; hero?: boolean; tom?: "ok" | "alerta";
}) {
  return (
    <Link href={href} className="vg-kpi" data-hero={hero} data-tom={tom}>
      <span className="crm-kpi-rot">{icone}{rotulo}</span>
      <span className="crm-kpi-val">{valor}</span>
      <span className="crm-kpi-sub">{sub}</span>
      {extra}
    </Link>
  );
}
