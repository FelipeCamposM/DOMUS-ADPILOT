import { contaServico, db, escolherGsc, periodos, propriedadesGsc, relatorioGa4, relatorioGsc, tokenGoogle, type RelatorioGa, type RelatorioGsc } from "@domus-ads/core";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Laptop, Radio, Smartphone, Tablet, Tv } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { int, pct } from "@/lib/format";
import { GoogleAnalyticsLogo, SearchConsoleLogo } from "@/modules/connections/Logos";
import { TrendChart } from "@/modules/dashboard/TrendChart";
import { CountUp, type CountFormat } from "@/modules/motion/CountUp";
import { HeroFx } from "@/modules/shell/HeroFx";

export const metadata = { title: "CRM · Estatísticas do site" };

const DIAS = [7, 28, 90] as const;
const DISPOSITIVO: Record<string, [string, typeof Laptop, string]> = {
  desktop: ["Computador", Laptop, "var(--p-400)"], mobile: ["Celular", Smartphone, "#F9AB00"], tablet: ["Tablet", Tablet, "#4285F4"], "smart tv": ["TV", Tv, "#34A853"],
};
const origem = (s: string) => (s === "(direct) / (none)" ? "Direto (digitou ou favorito)" : s.replace(" / (none)", "").replace("(not set)", "não identificado"));
const tempo = (s: number) => `${Math.floor(s / 60)}min ${String(Math.round(s % 60)).padStart(2, "0")}s`;
const fmtPos = (v: number) => v.toFixed(1).replace(".", ",");

type Cartao = { label: string; atual: number | null; anterior: number | null; kind: CountFormat; menorMelhor?: boolean; texto?: string; dica?: string; hero?: boolean };
type Aba = "ga" | "gsc";

/** Página de um site: abas Google Analytics (visitas + leads) e Search Console (buscas). Só a aba aberta vai ao Google. */
export default async function EstatisticasSitePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dias?: string; aba?: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const sp = await searchParams;
  const dias = DIAS.find((d) => String(d) === sp.dias) ?? 28;
  const sql = db();
  const [site] = await sql<{ id: string; nome: string; dominios: string[]; ga4_propriedade: string | null; gsc_site: string | null }[]>`
    select id, nome, dominios, ga4_propriedade, gsc_site from ads.lead_sites where id = ${id.data}`;
  if (!site) notFound();
  const aba: Aba = sp.aba === "gsc" || (sp.aba !== "ga" && !site.ga4_propriedade) ? "gsc" : "ga";
  const url = (p: { dias?: number; aba?: Aba }) => `?aba=${p.aba ?? aba}&dias=${p.dias ?? dias}`;

  const sa = await contaServico().catch(() => null);
  const token = sa ? await tokenGoogle(sa).catch((e: Error) => e) : null;
  const erroConta = !sa ? "Conecte a conta de serviço do Google em CRM → Sites." : token instanceof Error ? token.message : null;
  const tk = typeof token === "string" ? token : null;

  let conteudo: React.ReactNode;
  if (aba === "ga") {
    const { atual, anterior } = periodos(dias);
    const [ga, [leads]] = await Promise.all([
      site.ga4_propriedade && tk ? relatorioGa4(tk, site.ga4_propriedade, dias).catch((e: Error) => e) : null,
      sql<{ atual: number; anterior: number }[]>`
        select count(*) filter (where lead_em >= ${atual.ini}::date and lead_em < ${atual.fim}::date + 1)::int as atual,
               count(*) filter (where lead_em >= ${anterior.ini}::date and lead_em < ${anterior.fim}::date + 1)::int as anterior
        from ads.whatsapp_contatos where lead_site = ${site.id}`,
    ]);
    conteudo = (
      <>
        <Fonte logo={<GoogleAnalyticsLogo size={30} />} titulo="Google Analytics 4" sub={site.ga4_propriedade ? `Propriedade ${site.ga4_propriedade} · até hoje` : "não ligado"}
          href={site.ga4_propriedade ? `https://analytics.google.com/analytics/web/#/p${site.ga4_propriedade}/reports/intelligenthome` : null}
          extra={ga && !(ga instanceof Error) ? <span className="st-aovivo" title="Pessoas com o site aberto nos últimos 30 minutos"><Radio size={13} aria-hidden /> <b>{int(ga.agora)}</b> no site agora</span> : null} />
        {!site.ga4_propriedade ? <Vazio texto="Cadastre o ID da propriedade do GA4 no site (CRM → Sites → editar)." />
          : ga instanceof Error ? <Vazio texto={ga.message} erro />
          : ga ? <Visitas ga={ga} leads={leads ?? { atual: 0, anterior: 0 }} dias={dias} /> : null}
      </>
    );
  } else {
    // o cadastrado no site, senão acha sozinho pelo domínio (subdomínio cai na propriedade do domínio principal)
    const gscSite = site.gsc_site ?? (tk && site.dominios.length ? escolherGsc(await propriedadesGsc(tk).catch(() => []), site.dominios) : null);
    // sem domínios cadastrados, a propriedade de domínio fica só com o domínio dela (sem os subdomínios)
    const hosts = site.dominios.length ? site.dominios : gscSite?.startsWith("sc-domain:") ? [gscSite.slice(10)] : [];
    const gsc = gscSite && tk ? await relatorioGsc(tk, gscSite, dias, hosts).catch((e: Error) => e) : null;
    conteudo = (
      <>
        <Fonte logo={<SearchConsoleLogo size={30} />} titulo="Google Search Console"
          sub={gscSite ? `${gscSite.replace("sc-domain:", "")}${hosts.length ? ` · só ${hosts.join(", ")}` : ""} · dados até 2 dias atrás` : "não ligado"}
          href={gscSite ? `https://search.google.com/search-console?resource_id=${encodeURIComponent(gscSite)}` : null} />
        {!gscSite ? <Vazio texto={site.dominios.length ? `Nenhuma propriedade do Search Console da conta cobre ${site.dominios.join(", ")}. Dê acesso Restrito ao e-mail da conta na propriedade do site.` : "Cadastre o domínio do site (CRM → Sites → editar)."} />
          : gsc instanceof Error ? <Vazio texto={gsc.message} erro />
          : gsc ? <Buscas gsc={gsc} dias={dias} /> : null}
      </>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <div className="page-head">
        <HeroFx />
        <Link className="eyebrow" href="/crm/sites" data-enter>CRM · Sites</Link>
        <div>
          <h1 className="page-title" data-enter>{site.nome}</h1>
          <p className="page-sub" style={{ margin: "8px 0 0" }}>{site.dominios.join(" · ") || "sem domínio cadastrado"}</p>
        </div>
        <nav className="cluster" aria-label="Período" style={{ gap: 6 }}>
          {DIAS.map((d) => <Link key={d} href={url({ dias: d })} className="chip" data-active={d === dias} aria-current={d === dias ? "page" : undefined} style={{ height: 30 }}>{d} dias</Link>)}
        </nav>
      </div>

      {erroConta && <Vazio texto={erroConta} erro />}

      <nav className="st-abas" aria-label="Fonte dos dados" data-enter>
        <Link href={url({ aba: "ga" })} className="st-aba" aria-current={aba === "ga" ? "page" : undefined}>
          <GoogleAnalyticsLogo size={26} />
          <span><b>Google Analytics</b><small>Visitas, origem e leads</small></span>
        </Link>
        <Link href={url({ aba: "gsc" })} className="st-aba" aria-current={aba === "gsc" ? "page" : undefined}>
          <SearchConsoleLogo size={26} />
          <span><b>Search Console</b><small>Buscas no Google</small></span>
        </Link>
      </nav>

      <div className="stack" style={{ gap: 14 }} key={aba}>{conteudo}</div>
    </div>
  );
}

function Fonte({ logo, titulo, sub, href, extra }: { logo: React.ReactNode; titulo: string; sub: string; href: string | null; extra?: React.ReactNode }) {
  return (
    <div className="st-fonte" data-enter>
      <span className="st-fonte-logo">{logo}</span>
      <span className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
        <b>{titulo}</b>
        <span className="subtle caption crm-trunc">{sub}</span>
      </span>
      {extra}
      {href && <a className="btn btn-ghost btn-xs" href={href} target="_blank" rel="noreferrer">Abrir no Google <ExternalLink aria-hidden /></a>}
    </div>
  );
}

function Vazio({ texto, erro }: { texto: string; erro?: boolean }) {
  return <div className="panel" style={{ padding: 18 }}>{erro ? <p className="error-text" style={{ margin: 0 }}>{texto}</p> : <span className="subtle small">{texto}</span>}</div>;
}

function Visitas({ ga, leads, dias }: { ga: RelatorioGa; leads: { atual: number; anterior: number }; dias: number }) {
  const taxa = (l: number, u: number) => (u > 0 ? l / u : null);
  const totDisp = ga.dispositivos.reduce((s, d) => s + d.usuarios, 0);
  return (
    <>
      <Cartoes dias={dias} itens={[
        { label: "Usuários", atual: ga.atual.activeUsers, anterior: ga.anterior.activeUsers, kind: "int", hero: true },
        { label: "Novos usuários", atual: ga.atual.newUsers, anterior: ga.anterior.newUsers, kind: "int" },
        { label: "Sessões", atual: ga.atual.sessions, anterior: ga.anterior.sessions, kind: "int" },
        { label: "Visualizações", atual: ga.atual.screenPageViews, anterior: ga.anterior.screenPageViews, kind: "int" },
        { label: "Engajamento", atual: ga.atual.engagementRate, anterior: ga.anterior.engagementRate, kind: "pct", dica: "Sessões com 10s+, 2+ páginas ou um evento-chave" },
        { label: "Tempo médio", atual: ga.atual.averageSessionDuration, anterior: ga.anterior.averageSessionDuration, kind: "int", texto: tempo(ga.atual.averageSessionDuration) },
        { label: "Eventos-chave", atual: ga.atual.keyEvents, anterior: ga.anterior.keyEvents, kind: "int", dica: "Conversões marcadas no GA4" },
        { label: "Leads", atual: leads.atual, anterior: leads.anterior, kind: "int", dica: "Leads que chegaram ao CRM por este site" },
        { label: "Visita → lead", atual: taxa(leads.atual, ga.atual.activeUsers), anterior: taxa(leads.anterior, ga.anterior.activeUsers), kind: "pct", dica: "Leads ÷ usuários" },
      ]} />
      <TrendChart data={ga.porDia} metricas={[{ key: "usuarios", label: "Usuários" }, { key: "sessoes", label: "Sessões" }, { key: "visualizacoes", label: "Visualizações" }]} />
      <div className="st-grade">
        <Tabela titulo="De onde vêm" colunas={["Origem / mídia", "Sessões", "Usuários", "Eventos"]} linhas={ga.origens.map((o) => [origem(o.nome), o.sessoes, o.usuarios, o.eventos])} />
        <Tabela titulo="Páginas mais vistas" colunas={["Página", "Visualizações", "Usuários"]} linhas={ga.paginas.map((p) => [p.nome, p.visualizacoes, p.usuarios])} />
        <div className="panel" data-enter>
          <div className="panel-head"><div className="panel-title">Dispositivos</div><span className="subtle caption">Usuários</span></div>
          {totDisp ? (
            <div className="st-disp">
              <div className="st-disp-barra" role="img" aria-label={ga.dispositivos.map((d) => `${DISPOSITIVO[d.nome]?.[0] ?? d.nome} ${Math.round((d.usuarios / totDisp) * 100)}%`).join(", ")}>
                {ga.dispositivos.map((d) => <i key={d.nome} style={{ flex: d.usuarios, background: DISPOSITIVO[d.nome]?.[2] ?? "rgb(var(--c-text-tertiary))" }} />)}
              </div>
              {ga.dispositivos.map((d) => {
                const [nome, Icone, cor] = DISPOSITIVO[d.nome] ?? [d.nome, Laptop, "rgb(var(--c-text-tertiary))"];
                return (
                  <div key={d.nome} className="st-disp-item">
                    <span className="st-disp-ic" style={{ color: cor }}><Icone size={16} aria-hidden /></span>
                    <span style={{ flex: 1 }}>{nome}</span>
                    <b className="tabular">{Math.round((d.usuarios / totDisp) * 100)}%</b>
                    <span className="subtle caption tabular" style={{ minWidth: 48, textAlign: "right" }}>{int(d.usuarios)}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="subtle small" style={{ padding: "0 18px 16px" }}>Sem dados no período.</p>}
        </div>
        <Tabela titulo="Cidades" colunas={["Cidade", "Usuários"]} linhas={ga.cidades.map((c) => [c.nome, c.usuarios])} />
      </div>
    </>
  );
}

function Buscas({ gsc, dias }: { gsc: RelatorioGsc; dias: number }) {
  return (
    <>
      <Cartoes dias={dias} itens={[
        { label: "Cliques", atual: gsc.atual.cliques, anterior: gsc.anterior.cliques, kind: "int", hero: true },
        { label: "Impressões", atual: gsc.atual.impressoes, anterior: gsc.anterior.impressoes, kind: "compact", dica: "Vezes que o site apareceu numa busca" },
        { label: "CTR", atual: gsc.atual.ctr, anterior: gsc.anterior.ctr, kind: "pct", dica: "Cliques ÷ impressões" },
        { label: "Posição média", atual: gsc.atual.posicao || null, anterior: gsc.anterior.posicao || null, kind: "int", menorMelhor: true, texto: gsc.atual.posicao ? fmtPos(gsc.atual.posicao) : "—", dica: "Quanto menor, mais no topo do Google" },
      ]} />
      {gsc.porDia.length > 0 && <TrendChart data={gsc.porDia} metricas={[{ key: "cliques", label: "Cliques" }, { key: "impressoes", label: "Impressões" }]} />}
      <div className="st-grade st-grade-largo">
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
          <div key={c.label} className={`kpi spotlight ${c.hero ? "hero" : ""}`} data-enter="scale" title={c.dica}>
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

/** Ranking: a 1ª coluna numérica ganha uma barra com a fatia do total. */
function Tabela({ titulo, colunas, linhas }: { titulo: string; colunas: string[]; linhas: (string | number)[][] }) {
  const total = linhas.reduce((s, l) => s + (typeof l[1] === "number" ? l[1] : 0), 0);
  return (
    <div className="panel" data-enter>
      <div className="panel-head"><div className="panel-title">{titulo}</div><span className="subtle caption">{colunas[1]}</span></div>
      {linhas.length ? (
        <div className="table-wrap">
          <table className="data st-tabela">
            <thead><tr>{colunas.map((c, i) => <th key={c} className={i ? "num" : undefined}>{c}</th>)}</tr></thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i}>
                  <td>
                    <div className="crm-trunc" title={String(l[0])}>{l[0] || "—"}</div>
                    {total > 0 && typeof l[1] === "number" && <div className="st-fatia"><i style={{ width: `${Math.max(2, (l[1] / total) * 100)}%` }} /></div>}
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
