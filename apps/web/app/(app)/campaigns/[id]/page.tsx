import { db, detalhesCampanha, type DetalhesGoogle } from "@domus-ads/core";
import { AlertCircle, Ban, Bot, CalendarRange, CheckCircle2, ChevronLeft, Clock, Eye, FileText, Gauge, MapPin, MousePointerClick, Target, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireCtx } from "@/lib/ctx";
import { derive, int, money, pct } from "@/lib/format";
import { campanhas, parseFiltro } from "@/lib/queries";
import { GoogleAdsLogo, MetaLogo } from "@/modules/connections/Logos";
import { StatusTag } from "@/modules/campaigns/Tags";
import { HeroFx } from "@/modules/shell/HeroFx";

export const metadata = { title: "Campanha" };

// rótulos dos status do Google em português
const SITUACAO: Record<string, string> = {
  ELIGIBLE: "Elegível", LEARNING: "Em aprendizado", LIMITED: "Limitada", NOT_ELIGIBLE: "Não veicula", PAUSED: "Pausada", PENDING: "Pendente",
  ENDED: "Encerrada", REMOVED: "Removida", MISCONFIGURED: "Configuração com problema", ENABLED: "Ativo", APPROVED: "Aprovado",
  APPROVED_LIMITED: "Aprovado com limitação", DISAPPROVED: "Reprovado", AREA_OF_INTEREST_ONLY: "Só área de interesse", UNKNOWN: "—",
};
const MOTIVO: Record<string, string> = {
  BIDDING_STRATEGY_LEARNING: "o Google está calibrando os lances (leva de 3 a 7 dias)",
  AD_GROUP_CRITERION_RARELY_SERVED: "pouca gente pesquisa este termo",
  AD_GROUP_CRITERION_LOW_QUALITY: "nota de qualidade baixa",
  CAMPAIGN_PENDING: "ainda não começou", CAMPAIGN_ENDED: "já terminou", BUDGET_CONSTRAINED: "limitada pelo orçamento",
  HAS_ADS_DISAPPROVED: "tem anúncio reprovado", HAS_ADS_LIMITED_BY_POLICY: "anúncio limitado por política",
};
const TIPO: Record<string, string> = { EXACT: "exata", PHRASE: "frase", BROAD: "ampla" };
const LANCE: Record<string, string> = { TARGET_SPEND: "Maximizar cliques", MAXIMIZE_CONVERSIONS: "Maximizar conversões", MANUAL_CPC: "CPC manual", MAXIMIZE_CONVERSION_VALUE: "Maximizar valor", TARGET_CPA: "CPA desejado", TARGET_ROAS: "ROAS desejado" };
const DIA: Record<string, string> = { MONDAY: "seg", TUESDAY: "ter", WEDNESDAY: "qua", THURSDAY: "qui", FRIDAY: "sex", SATURDAY: "sáb", SUNDAY: "dom" };
const sit = (s: string) => SITUACAO[s] ?? s;
const motivos = (m: string[]) => m.map((x) => MOTIVO[x] ?? x.toLowerCase().replace(/_/g, " ")).join("; ");
const data = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : null);
// verde = rodando, amarelo = rodando com ressalva, cinza = parado
const tom = (s: string) => (["ELIGIBLE", "ENABLED", "APPROVED"].includes(s) ? "ok" : ["LEARNING", "LIMITED", "PENDING", "APPROVED_LIMITED"].includes(s) ? "atencao" : "parado");
const dominio = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };

export default async function CampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const f = parseFiltro({ campaign: id.data });
  const [[c], [rasc]] = await Promise.all([
    campanhas(ctx.workspace.id, f),
    db()<{ id: string }[]>`select id from ads.campaign_drafts where campaign_id = ${id.data} and workspace_id = ${ctx.workspace.id} limit 1`,
  ]);
  if (!c) notFound();
  let det: DetalhesGoogle | null = null, erro: string | null = null;
  try { det = await detalhesCampanha(ctx.workspace.id, c.id); } catch (e) { erro = (e as Error).message; }
  const d = derive(c);

  return (
    <div className="page">
      <div className="page-head">
        <HeroFx />
        <div>
          <Link href="/campaigns" className="eyebrow" data-enter style={{ textDecoration: "none" }}><ChevronLeft size={12} aria-hidden /> Campanhas</Link>
          <h1 className="page-title" data-enter>{c.name}</h1>
          <p className="subtle small cluster" data-enter style={{ gap: 8 }}>
            {c.provider === "META" ? <MetaLogo size={14} /> : <GoogleAdsLogo size={14} />} {c.provider === "META" ? "Meta Ads" : "Google Ads"} · {c.account_name} · <StatusTag s={c.status} />
          </p>
        </div>
        <div className="cluster" data-enter style={{ gap: 8 }}>
          {rasc && <Link href={`/campaigns/rascunhos/${rasc.id}`} className="btn btn-secondary btn-sm"><FileText aria-hidden /> Rascunho original</Link>}
          <Link href={`/ai?nova=1&campaign=${c.id}`} className="btn btn-primary btn-sm"><Bot aria-hidden /> Analisar com a IA</Link>
        </div>
      </div>

      <div className="cp-resumo" data-enter>
        <Kpi icone={<Wallet aria-hidden />} rotulo={`Gasto · ${f.days} dias`} valor={money(c.spend, c.currency)} sub={c.daily_budget ? `de ${money(c.daily_budget, c.currency)}/dia` : undefined} />
        <Kpi icone={<Eye aria-hidden />} rotulo="Impressões" valor={int(d.impressions)} sub="vezes que o anúncio apareceu" />
        <Kpi icone={<MousePointerClick aria-hidden />} rotulo="Cliques" valor={int(d.clicks)} sub={`CTR ${pct(d.ctr)}`} />
        <Kpi icone={<Target aria-hidden />} rotulo="Conversões" valor={d.conversions.toLocaleString("pt-BR")} sub={d.cpa == null ? "sem conversões" : `${money(d.cpa, c.currency)} cada`} />
      </div>

      {erro && <div className="panel cd-aviso" role="alert"><AlertCircle aria-hidden /> Não consegui ler os detalhes no Google: {erro}</div>}
      {!det && !erro && <div className="panel cd-aviso"><AlertCircle aria-hidden /> Anúncios e segmentação por enquanto só para campanhas do Google Ads.</div>}
      {det && <Detalhes det={det} moeda={c.currency} />}
    </div>
  );
}

function Kpi({ icone, rotulo, valor, sub }: { icone: React.ReactNode; rotulo: string; valor: string; sub?: string }) {
  return <div className="panel cp-kpi"><span className="cp-kpi-ic">{icone}</span><span><small>{rotulo}</small><strong className="tabular">{valor}</strong>{sub && <em>{sub}</em>}</span></div>;
}

function Detalhes({ det, moeda }: { det: DetalhesGoogle; moeda: string }) {
  const locais = (l: string[]) => l.map((x) => x.replace(/,Brazil$/, "").replace(/^State of /, "")).join(", ");
  const config: [React.ReactNode, string, string][] = [
    [<Gauge key="i" aria-hidden />, "Lances", `${LANCE[det.lance] ?? det.lance}${det.cpcMax ? ` · até ${money(det.cpcMax, moeda)}/clique` : ""}`],
    [<Wallet key="i" aria-hidden />, "Orçamento", det.orcamentoDia ? `${money(det.orcamentoDia, moeda)} por dia` : "—"],
    [<CalendarRange key="i" aria-hidden />, "Período", `${data(det.inicio) ?? "—"} → ${data(det.fim) ?? "sem fim"}`],
    [<MapPin key="i" aria-hidden />, "Onde", (locais(det.locais) || "Todos os locais") + (det.locaisExcluidos.length ? ` (exceto ${locais(det.locaisExcluidos)})` : "")],
    [<Clock key="i" aria-hidden />, "Quando", det.horarios.length ? det.horarios.map((h) => `${DIA[h.dia] ?? h.dia} ${h.de}h–${h.ate}h`).join(", ") : "Todos os dias, 24 h"],
  ];
  const motivoTxt = motivos(det.motivos);
  return (
    <div className="cd-grade">
      <div className="stack" style={{ gap: 18, minWidth: 0 }}>
        {det.grupos.map((g) => {
          const max = Math.max(1, ...g.palavras.map((p) => p.impressoes));
          const vivas = g.palavras.filter((p) => tom(p.situacao) !== "parado").length;
          return (
            <section key={g.nome} className="panel cd-grupo" data-enter>
              <header className="cd-grupo-topo">
                <div><small className="cd-rotulo">Grupo de anúncios</small><h2>{g.nome}</h2></div>
                <span className="cd-pilula" data-tom={tom(g.status)}>{sit(g.status)}</span>
              </header>

              {g.anuncios.map((a, i) => (
                <div key={i} className="cd-anuncio">
                  <div className="cd-serp" aria-label="Prévia no Google">
                    <span className="cd-serp-tag">Patrocinado</span>
                    <span className="cd-serp-url"><i aria-hidden>{dominio(a.url).charAt(0).toUpperCase()}</i>{dominio(a.url)}{a.caminho && ` › ${a.caminho.replace("/", " › ")}`}</span>
                    <span className="cd-serp-titulo">{a.titulos.slice(0, 3).join(" | ")}</span>
                    <span className="cd-serp-desc">{a.descricoes.slice(0, 2).join(" ")}</span>
                    <span className="cd-serp-nota">Prévia: o Google combina os títulos e as descrições sozinho</span>
                  </div>
                  <div className="cd-anuncio-lado">
                    <div className="cluster" style={{ gap: 6 }}>
                      <span className="cd-pilula" data-tom={tom(a.aprovacao)}>{a.aprovacao === "APPROVED" ? <CheckCircle2 aria-hidden /> : <AlertCircle aria-hidden />} {sit(a.aprovacao)}</span>
                      <span className="cd-pilula" data-tom={tom(a.situacao)}>{sit(a.situacao)}</span>
                    </div>
                    <Lista titulo="Títulos" itens={a.titulos} limite={30} />
                    <Lista titulo="Descrições" itens={a.descricoes} limite={90} aberta />
                    {a.url && <a className="cd-link" href={a.url} target="_blank" rel="noreferrer" title={a.url}>Abrir página de destino ↗</a>}
                  </div>
                </div>
              ))}

              {g.palavras.length > 0 && (
                <div className="cd-kw">
                  <div className="cd-kw-topo"><b>Palavras-chave</b><span className="subtle">{vivas} de {g.palavras.length} rodando · últimos 30 dias</span></div>
                  {g.palavras.map((p) => (
                    <div key={p.texto + p.tipo} className="cd-kw-linha" data-tom={tom(p.situacao)}>
                      <span className="cd-kw-nome"><i className="cd-dot" aria-hidden />
                        <span>{p.tipo === "EXACT" ? `[${p.texto}]` : p.tipo === "PHRASE" ? `"${p.texto}"` : p.texto}
                          <small>{TIPO[p.tipo] ?? p.tipo} · {sit(p.situacao).toLowerCase()}{p.motivos.length > 0 ? `: ${motivos(p.motivos)}` : ""}</small></span>
                      </span>
                      <span className="cd-kw-barra" title={`${p.impressoes} impressões`}><span style={{ width: `${(p.impressoes / max) * 100}%` }} /></span>
                      <span className="tabular cd-kw-num">{int(p.impressoes)}<small>impr.</small></span>
                      <span className="tabular cd-kw-num">{int(p.cliques)}<small>cliques</small></span>
                      <span className="tabular cd-kw-num">{p.nota ?? "—"}<small>nota</small></span>
                    </div>
                  ))}
                </div>
              )}
              {g.negativas.length > 0 && <Negativas titulo="Negativas do grupo" itens={g.negativas} />}
            </section>
          );
        })}
      </div>

      <aside className="stack cd-lado" style={{ gap: 18 }}>
        <section className="panel cd-situacao" data-tom={tom(det.situacao)} data-enter>
          <small className="cd-rotulo">Situação no Google</small>
          <b><i className="cd-dot" aria-hidden /> {sit(det.situacao)}</b>
          {motivoTxt && <p>{motivoTxt.charAt(0).toUpperCase() + motivoTxt.slice(1)}.</p>}
        </section>
        <section className="panel cd-config" data-enter>
          {config.map(([ic, k, v]) => <div key={k} className="cd-config-linha"><span className="cd-config-ic">{ic}</span><span><small>{k}</small>{v}</span></div>)}
        </section>
        {det.negativas.length > 0 && <section className="panel cd-caixa" data-enter><Negativas titulo="Palavras negativas" itens={det.negativas} /></section>}
        {det.sitelinks.length > 0 && (
          <section className="panel cd-config" data-enter>
            <small className="cd-rotulo">Sitelinks</small>
            {det.sitelinks.map((s) => <a key={s.texto} className="cd-link cd-config-linha" href={s.url ?? "#"} target="_blank" rel="noreferrer">{s.texto} ↗</a>)}
          </section>
        )}
      </aside>
    </div>
  );
}

function Lista({ titulo, itens, limite, aberta }: { titulo: string; itens: string[]; limite: number; aberta?: boolean }) {
  return (
    <details className="cd-lista" open={aberta}>
      <summary><span>{titulo}</span><span className="subtle">{itens.length}</span></summary>
      <ol>{itens.map((t) => <li key={t}><span>{t}</span><small className="tabular">{t.length}/{limite}</small></li>)}</ol>
    </details>
  );
}

function Negativas({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <details className="cd-neg">
      <summary><Ban aria-hidden /> {titulo} <span className="subtle">{itens.length}</span></summary>
      <div className="cd-neg-itens">{itens.map((t) => <span key={t}>−{t}</span>)}</div>
    </details>
  );
}
