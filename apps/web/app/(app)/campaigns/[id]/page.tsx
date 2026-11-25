import { db, detalhesCampanha, type DetalhesGoogle } from "@domus-ads/core";
import { Bot, ChevronLeft, FileText } from "lucide-react";
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
  ENDED: "Encerrada", REMOVED: "Removida", MISCONFIGURED: "Configuração com problema", ENABLED: "Ativa", APPROVED: "Aprovado",
  APPROVED_LIMITED: "Aprovado com limitação", DISAPPROVED: "Reprovado", AREA_OF_INTEREST_ONLY: "Só área de interesse", UNKNOWN: "—",
};
const MOTIVO: Record<string, string> = {
  BIDDING_STRATEGY_LEARNING: "o Google está calibrando os lances (3 a 7 dias)",
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
        <Kpi rotulo={`Gasto (${f.days} dias)`} valor={money(c.spend, c.currency)} sub={c.daily_budget ? `orçamento ${money(c.daily_budget, c.currency)}/dia` : undefined} />
        <Kpi rotulo="Impressões" valor={int(d.impressions)} />
        <Kpi rotulo="Cliques" valor={int(d.clicks)} sub={`CTR ${pct(d.ctr)}`} />
        <Kpi rotulo="Conversões" valor={d.conversions.toLocaleString("pt-BR")} sub={d.cpa == null ? "sem conversões" : `${money(d.cpa, c.currency)} cada`} />
      </div>

      {erro && <div className="panel error-text small" role="alert" style={{ padding: 16 }}>Não consegui ler os detalhes no Google: {erro}</div>}
      {!det && !erro && <div className="panel subtle small" style={{ padding: 16 }}>Detalhes de anúncios e segmentação por enquanto só para campanhas do Google Ads.</div>}
      {det && <Detalhes det={det} moeda={c.currency} />}
    </div>
  );
}

function Kpi({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return <div className="panel cp-kpi"><span><small>{rotulo}</small><strong className="tabular">{valor}</strong>{sub && <em>{sub}</em>}</span></div>;
}

function Detalhes({ det, moeda }: { det: DetalhesGoogle; moeda: string }) {
  const linhas: [string, React.ReactNode][] = [
    ["Situação no Google", <>{sit(det.situacao)}{det.motivos.length > 0 && <span className="subtle"> · {motivos(det.motivos)}</span>}</>],
    ["Lances", `${LANCE[det.lance] ?? det.lance}${det.cpcMax ? ` · teto ${money(det.cpcMax, moeda)} por clique` : ""}`],
    ["Orçamento", det.orcamentoDia ? `${money(det.orcamentoDia, moeda)}/dia` : "—"],
    ["Período", `${data(det.inicio) ?? "—"} até ${data(det.fim) ?? "sem data de fim"}`],
    ["Locais", det.locais.join(", ") || "Todos"],
    ...(det.locaisExcluidos.length ? [["Locais excluídos", det.locaisExcluidos.join(", ")] as [string, string]] : []),
    ["Horário", det.horarios.length ? det.horarios.map((h) => `${DIA[h.dia] ?? h.dia} ${h.de}h–${h.ate}h`).join(", ") : "Todos os dias, o dia todo"],
  ];
  return (
    <>
      <section className="panel" style={{ padding: 20 }} data-enter>
        <h2 className="panel-title" style={{ marginBottom: 12 }}>Configuração no ar</h2>
        <dl style={{ display: "grid", gridTemplateColumns: "minmax(120px, 180px) 1fr", gap: "8px 16px", margin: 0 }} className="small">
          {linhas.flatMap(([k, v]) => [<dt key={`k${k}`} className="subtle">{k}</dt>, <dd key={`v${k}`} style={{ margin: 0 }}>{v}</dd>])}
        </dl>
        {det.negativas.length > 0 && <Chips titulo={`Palavras negativas da campanha (${det.negativas.length})`} itens={det.negativas} />}
        {det.sitelinks.length > 0 && <Chips titulo="Sitelinks" itens={det.sitelinks.map((s) => s.texto)} />}
      </section>

      {det.grupos.map((g) => (
        <section key={g.nome} className="panel stack" style={{ padding: 20, gap: 16 }} data-enter>
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <h2 className="panel-title">Grupo: {g.nome}</h2>
            <span className="subtle small">{sit(g.status)}</span>
          </div>

          {g.anuncios.map((a, i) => (
            <div key={i} className="stack" style={{ gap: 8 }}>
              <div className="cluster small" style={{ gap: 8 }}>
                <b>Anúncio {g.anuncios.length > 1 ? i + 1 : ""}</b>
                <span className="badge">{sit(a.aprovacao)}</span>
                <span className="subtle">{sit(a.situacao)}</span>
              </div>
              {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="small" style={{ wordBreak: "break-all" }}>{a.url}</a>}
              {a.caminho && <span className="subtle caption">Caminho exibido: /{a.caminho}</span>}
              <Chips titulo={`Títulos (${a.titulos.length})`} itens={a.titulos} />
              <div className="stack" style={{ gap: 4 }}>
                <span className="subtle caption">Descrições ({a.descricoes.length})</span>
                {a.descricoes.map((t) => <p key={t} className="small" style={{ margin: 0 }}>{t}</p>)}
              </div>
            </div>
          ))}

          {g.palavras.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Palavra-chave</th><th>Tipo</th><th>Situação</th><th>Nota</th><th>Impr. 30d</th><th>Cliques 30d</th></tr></thead>
                <tbody>
                  {g.palavras.map((p) => (
                    <tr key={p.texto + p.tipo}>
                      <td>{p.texto}</td>
                      <td>{TIPO[p.tipo] ?? p.tipo}</td>
                      <td style={{ whiteSpace: "normal" }}>{sit(p.situacao)}{p.motivos.length > 0 && <span className="subtle"> · {motivos(p.motivos)}</span>}</td>
                      <td>{p.nota ?? "—"}</td>
                      <td>{int(p.impressoes)}</td>
                      <td>{int(p.cliques)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {g.negativas.length > 0 && <Chips titulo={`Negativas do grupo (${g.negativas.length})`} itens={g.negativas} />}
        </section>
      ))}
    </>
  );
}

function Chips({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div className="stack" style={{ gap: 6, marginTop: 12 }}>
      <span className="subtle caption">{titulo}</span>
      <div className="cluster" style={{ gap: 6, flexWrap: "wrap" }}>{itens.map((t) => <span key={t} className="chip">{t}</span>)}</div>
    </div>
  );
}
