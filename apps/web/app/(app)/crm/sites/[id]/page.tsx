import { contaServico, db, escolherGsc, periodos, propriedadesGsc, relatorioGa4, relatorioGsc, tokenGoogle, type RelatorioGa, type RelatorioGsc } from "@domus-ads/core";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Radio } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { int, pct } from "@/lib/format";
import { TrendChart } from "@/modules/dashboard/TrendChart";
import { CountUp, type CountFormat } from "@/modules/motion/CountUp";

export const metadata = { title: "CRM · Estatísticas do site" };

const DIAS = [7, 28, 90] as const;
const DISPOSITIVO: Record<string, string> = { desktop: "Computador", mobile: "Celular", tablet: "Tablet", "smart tv": "TV" };
const origem = (s: string) => (s === "(direct) / (none)" ? "Direto (digitou ou favorito)" : s.replace(" / (none)", "").replace("(not set)", "não identificado"));
const tempo = (s: number) => `${Math.floor(s / 60)}min ${String(Math.round(s % 60)).padStart(2, "0")}s`;

type Cartao = { label: string; atual: number | null; anterior: number | null; kind: CountFormat; menorMelhor?: boolean; texto?: string; dica?: string };

/** Página de um site: visitas (GA4), buscas (Search Console) e leads do formulário, contra o período anterior de mesmo tamanho. */
export default async function EstatisticasSitePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dias?: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const sp = (await searchParams).dias;
  const dias = DIAS.find((d) => String(d) === sp) ?? 28;
  const sql = db();
  const [site] = await sql<{ id: string; nome: string; dominios: string[]; ga4_propriedade: string | null; gsc_site: string | null }[]>`
    select id, nome, dominios, ga4_propriedade, gsc_site from ads.lead_sites where id = ${id.data}`;
  if (!site) notFound();

  const { atual, anterior } = periodos(dias);
  const sa = await contaServico().catch(() => null);
  const token = sa ? await tokenGoogle(sa).catch((e: Error) => e) : null;
  const erroConta = !sa ? "Conecte a conta de serviço do Google em CRM → Sites." : token instanceof Error ? token.message : null;
  const tk = typeof token === "string" ? token : null;
  // Search Console: o cadastrado no site, senão acha sozinho pelo domínio (inclusive subdomínio de uma propriedade de domínio)
  const gscSite = site.gsc_site ?? (tk && site.dominios.length ? escolherGsc(await propriedadesGsc(tk).catch(() => []), site.dominios) : null);
  // sem domínios cadastrados, a propriedade de domínio fica só com o domínio dela (sem os subdomínios)
  const hosts = site.dominios.length ? site.dominios : gscSite?.startsWith("sc-domain:") ? [gscSite.slice(10)] : [];
  const [ga, gsc, [leads]] = await Promise.all([
    site.ga4_propriedade && tk ? relatorioGa4(tk, site.ga4_propriedade, dias).catch((e: Error) => e) : null,
    gscSite && tk ? relatorioGsc(tk, gscSite, dias, hosts).catch((e: Error) => e) : null,
    sql<{ atual: number; anterior: number }[]>`
      select count(*) filter (where lead_em >= ${atual.ini}::date and lead_em < ${atual.fim}::date + 1)::int as atual,
             count(*) filter (where lead_em >= ${anterior.ini}::date and lead_em < ${anterior.fim}::date + 1)::int as anterior
      from ads.whatsapp_contatos where lead_site = ${site.id}`,
  ]);

  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <div className="page-head" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <Link href="/crm/sites" className="subtle small" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><ArrowLeft size={14} aria-hidden /> Sites</Link>
          <h1 className="page-title" data-enter>{site.nome}</h1>
          <div className="subtle small">{site.dominios.join(", ") || "sem domínio cadastrado"}</div>
        </div>
        <div className="cluster" style={{ gap: 8 }}>
          {ga && !(ga instanceof Error) && <span className="chip" title="Pessoas com o site aberto nos últimos 30 minutos"><Radio size={13} aria-hidden /> <b>{int(ga.agora)}</b>&nbsp;no site agora</span>}
          <nav className="cluster" aria-label="Período" style={{ gap: 4, padding: 3, borderRadius: 12, border: "1px solid rgb(var(--c-border))", background: "rgb(var(--c-bg-surface))" }}>
            {DIAS.map((d) => <Link key={d} href={`?dias=${d}`} className="chip" data-active={d === dias} aria-current={d === dias ? "page" : undefined} style={{ height: 28, border: 0 }}>{d} dias</Link>)}
          </nav>
        </div>
      </div>

      {erroConta && <div className="panel" style={{ padding: 16 }}><p className="error-text" style={{ margin: 0 }}>{erroConta}</p></div>}

      <Secao titulo="Visitas" fonte="Google Analytics 4" vazio={!site.ga4_propriedade ? "Cadastre o ID da propriedade do GA4 no site (CRM → Sites → editar)." : null} erro={ga instanceof Error ? ga.message : null}>
        {ga && !(ga instanceof Error) && <Visitas ga={ga} leads={leads ?? { atual: 0, anterior: 0 }} dias={dias} />}
      </Secao>

      <Secao titulo="Buscas no Google" fonte={`Search Console · dados até 2 dias atrás${hosts.length ? ` · só ${hosts.join(", ")}` : ""}`}
        vazio={!gscSite ? (site.dominios.length ? `Nenhuma propriedade do Search Console da conta cobre ${site.dominios.join(", ")}. Dê acesso Restrito ao e-mail da conta na propriedade do site.` : "Cadastre o domínio do site (CRM → Sites → editar).") : null} erro={gsc instanceof Error ? gsc.message : null}>
        {gsc && !(gsc instanceof Error) && <Buscas gsc={gsc} dias={dias} />}
      </Secao>
    </div>
  );
}

function Secao({ titulo, fonte, vazio, erro, children }: { titulo: string; fonte: string; vazio: string | null; erro: string | null; children: React.ReactNode }) {
  return (
    <section className="stack" style={{ gap: 12, marginTop: 24 }}>
      <h2 className="crm-h2">{titulo} <span className="subtle small" style={{ fontWeight: 500 }}>{fonte}</span></h2>
      {vazio ? <div className="panel subtle small" style={{ padding: 16 }}>{vazio}</div>
        : erro ? <div className="panel" style={{ padding: 16 }}><p className="error-text" style={{ margin: 0 }}>{erro}</p></div> : children}
    </section>
  );
}

function Visitas({ ga, leads, dias }: { ga: RelatorioGa; leads: { atual: number; anterior: number }; dias: number }) {
  const taxa = (l: number, u: number) => (u > 0 ? l / u : null);
  return (
    <>
      <Cartoes dias={dias} itens={[
        { label: "Usuários", atual: ga.atual.activeUsers, anterior: ga.anterior.activeUsers, kind: "int" },
        { label: "Novos usuários", atual: ga.atual.newUsers, anterior: ga.anterior.newUsers, kind: "int" },
        { label: "Sessões", atual: ga.atual.sessions, anterior: ga.anterior.sessions, kind: "int" },
        { label: "Visualizações", atual: ga.atual.screenPageViews, anterior: ga.anterior.screenPageViews, kind: "int" },
        { label: "Engajamento", atual: ga.atual.engagementRate, anterior: ga.anterior.engagementRate, kind: "pct", dica: "Sessões com 10s+, 2+ páginas ou um evento-chave" },
        { label: "Tempo médio", atual: ga.atual.averageSessionDuration, anterior: ga.anterior.averageSessionDuration, kind: "int", texto: tempo(ga.atual.averageSessionDuration) },
        { label: "Eventos-chave", atual: ga.atual.keyEvents, anterior: ga.anterior.keyEvents, kind: "int", dica: "Conversões marcadas no GA4" },
        { label: "Leads do formulário", atual: leads.atual, anterior: leads.anterior, kind: "int", dica: "Quem preencheu o formulário do AdPilot neste site" },
        { label: "Visita → lead", atual: taxa(leads.atual, ga.atual.activeUsers), anterior: taxa(leads.anterior, ga.anterior.activeUsers), kind: "pct", dica: "Leads ÷ usuários" },
      ]} />
      <TrendChart data={ga.porDia} metricas={[{ key: "usuarios", label: "Usuários" }, { key: "sessoes", label: "Sessões" }, { key: "visualizacoes", label: "Visualizações" }]} />
      <div className="grid-auto" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 12 }}>
        <Tabela titulo="De onde vêm" colunas={["Origem / mídia", "Sessões", "Usuários", "Eventos-chave"]} linhas={ga.origens.map((o) => [origem(o.nome), o.sessoes, o.usuarios, o.eventos])} />
        <Tabela titulo="Páginas mais vistas" colunas={["Página", "Visualizações", "Usuários"]} linhas={ga.paginas.map((p) => [p.nome, p.visualizacoes, p.usuarios])} />
        <Tabela titulo="Dispositivos" colunas={["Dispositivo", "Usuários"]} linhas={ga.dispositivos.map((d) => [DISPOSITIVO[d.nome] ?? d.nome, d.usuarios])} />
        <Tabela titulo="Cidades" colunas={["Cidade", "Usuários"]} linhas={ga.cidades.map((c) => [c.nome, c.usuarios])} />
      </div>
    </>
  );
}

function Buscas({ gsc, dias }: { gsc: RelatorioGsc; dias: number }) {
  const fmtPos = (v: number) => v.toFixed(1).replace(".", ",");
  return (
    <>
      <Cartoes dias={dias} itens={[
        { label: "Cliques", atual: gsc.atual.cliques, anterior: gsc.anterior.cliques, kind: "int" },
        { label: "Impressões", atual: gsc.atual.impressoes, anterior: gsc.anterior.impressoes, kind: "compact", dica: "Vezes que o site apareceu numa busca" },
        { label: "CTR", atual: gsc.atual.ctr, anterior: gsc.anterior.ctr, kind: "pct", dica: "Cliques ÷ impressões" },
        { label: "Posição média", atual: gsc.atual.posicao || null, anterior: gsc.anterior.posicao || null, kind: "int", menorMelhor: true, texto: gsc.atual.posicao ? fmtPos(gsc.atual.posicao) : "—" },
      ]} />
      {gsc.porDia.length > 0 && <TrendChart data={gsc.porDia} metricas={[{ key: "cliques", label: "Cliques" }, { key: "impressoes", label: "Impressões" }]} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))", gap: 12 }}>
        <Tabela titulo="O que buscaram" colunas={["Busca", "Cliques", "Impressões", "CTR", "Posição"]} linhas={gsc.buscas.map((b) => [b.nome, b.cliques, b.impressoes, pct(b.ctr), fmtPos(b.posicao)])} />
        <Tabela titulo="Páginas que aparecem" colunas={["Página", "Cliques", "Impressões", "CTR", "Posição"]} linhas={gsc.paginas.map((p) => [p.nome.replace(/^https?:\/\/[^/]+/, "") || "/", p.cliques, p.impressoes, pct(p.ctr), fmtPos(p.posicao)])} />
      </div>
    </>
  );
}

function Cartoes({ itens, dias }: { itens: Cartao[]; dias: number }) {
  return (
    <div className="kpis">
      {itens.map((c) => {
        const delta = c.atual != null && c.anterior != null && c.anterior !== 0 ? (c.atual - c.anterior) / Math.abs(c.anterior) : null;
        const bom = delta != null && (c.menorMelhor ? delta < 0 : delta > 0);
        return (
          <div key={c.label} className="kpi spotlight" data-enter="scale" title={c.dica}>
            <div className="kpi-label">{c.label}</div>
            <div className="kpi-value">{c.texto ?? <CountUp value={c.atual} kind={c.kind} />}</div>
            <div className={`delta ${delta == null || Math.abs(delta) < 0.005 ? "subtle" : bom ? "up" : "down"}`} style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2 }} title={`Comparado aos ${dias} dias anteriores`}>
              {delta == null ? "sem base de comparação" : (
                <>
                  {delta >= 0 ? <ArrowUpRight size={13} aria-hidden /> : <ArrowDownRight size={13} aria-hidden />}
                  {`${(Math.abs(delta) * 100).toFixed(1).replace(".", ",")}%`}
                  <span className="subtle" style={{ fontWeight: 500 }}>&nbsp;vs. anterior</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Tabela de ranking: a 1ª coluna numérica ganha uma barra com a fatia do total. */
function Tabela({ titulo, colunas, linhas }: { titulo: string; colunas: string[]; linhas: (string | number)[][] }) {
  const total = linhas.reduce((s, l) => s + (typeof l[1] === "number" ? l[1] : 0), 0);
  return (
    <div className="panel" data-enter>
      <div className="panel-head"><div className="panel-title">{titulo}</div></div>
      {linhas.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead><tr>{colunas.map((c, i) => <th key={c} className={i ? "num" : undefined}>{c}</th>)}</tr></thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i}>
                  <td style={{ maxWidth: 280 }}>
                    <div className="crm-trunc" title={String(l[0])}>{l[0] || "—"}</div>
                    {total > 0 && typeof l[1] === "number" && <div className="bar" style={{ marginTop: 4, height: 4 }}><i style={{ width: `${(l[1] / total) * 100}%` }} /></div>}
                  </td>
                  {l.slice(1).map((v, j) => <td key={j} className="num">{typeof v === "number" ? int(v) : v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="subtle small" style={{ padding: "0 18px 16px" }}>Sem dados no período.</p>}
    </div>
  );
}
