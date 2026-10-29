import { db } from "@domus-ads/core";
import type { EtapaCrm } from "@domus-ads/core/mensagens";
import { Bot, Cable, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";
import { derive, money, pct } from "@/lib/format";
import { campanhas, kpis, opcoesFiltro, parseFiltro, serie } from "@/lib/queries";
import { ProviderTag, StatusTag } from "@/modules/campaigns/Tags";
import { Filters } from "@/modules/dashboard/Filters";
import { Kpis } from "@/modules/dashboard/Kpis";
import { Pulso, type DadosPulso } from "@/modules/dashboard/Pulso";
import { TrendChart } from "@/modules/dashboard/TrendChart";

export const metadata = { title: "Visão geral" };

const TZ = "America/Sao_Paulo";

/** CRM (só o admin da plataforma usa): leads, conversas esperando resposta, funil, valores e mensagens agendadas. */
async function crm(): Promise<DadosPulso["crm"]> {
  const sql = db();
  const [[n], dias, recentes, etapas, funil, agendadas] = await Promise.all([
    sql<{ semana: number; anterior: number; hoje: number; sua_vez: number; nao_lidas: number; pipeline: string; ganho_mes: string; ganhos_mes: number }[]>`
      select
        (select count(*) from ads.whatsapp_contatos where etapa is not null and lead_em > now() - interval '7 days')::int as semana,
        (select count(*) from ads.whatsapp_contatos where etapa is not null and lead_em between now() - interval '14 days' and now() - interval '7 days')::int as anterior,
        (select count(*) from ads.whatsapp_contatos where etapa is not null and (lead_em at time zone ${TZ})::date = (now() at time zone ${TZ})::date)::int as hoje,
        (select count(*) from (select distinct on (para) direcao from ads.whatsapp_envios where direcao <> 'NOTA' and (agendado_para is null or agendado_para <= now())
           order by para, created_at desc) u where direcao = 'IN')::int as sua_vez,
        (select count(*) from ads.whatsapp_envios e join ads.whatsapp_contatos c on c.numero = e.para where e.direcao = 'IN' and e.created_at > c.lido_em)::int as nao_lidas,
        (select coalesce(sum(c.lead_valor), 0) from ads.whatsapp_contatos c join ads.crm_etapas k on k.chave = c.etapa where k.tipo = 'ABERTO')::text as pipeline,
        (select coalesce(sum(c.lead_valor), 0) from ads.whatsapp_contatos c join ads.crm_etapas k on k.chave = c.etapa
           where k.tipo = 'GANHO' and c.etapa_em >= date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ})::text as ganho_mes,
        (select count(*) from ads.whatsapp_contatos c join ads.crm_etapas k on k.chave = c.etapa
           where k.tipo = 'GANHO' and c.etapa_em >= date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ})::int as ganhos_mes`,
    sql<{ n: number }[]>`
      select count(c.numero)::int as n
      from generate_series((now() at time zone ${TZ})::date - 13, (now() at time zone ${TZ})::date, interval '1 day') d
      left join ads.whatsapp_contatos c on c.etapa is not null and (c.lead_em at time zone ${TZ})::date = d::date
      group by d order by d`,
    sql<{ numero: string; nome: string; etapa: string; origem: string | null; site: string | null; valor: string | null; lead_em: Date }[]>`
      select c.numero, c.nome, c.etapa, c.lead_dados->>'origem' as origem, s.nome as site, c.lead_valor::text as valor, c.lead_em
      from ads.whatsapp_contatos c left join ads.lead_sites s on s.id = c.lead_site
      where c.etapa is not null and c.lead_em is not null order by c.lead_em desc limit 6`,
    sql<EtapaCrm[]>`select chave, nome, cor, ordem, tipo, dica from ads.crm_etapas order by ordem, created_at`,
    sql<{ etapa: string; n: number }[]>`select etapa, count(*)::int as n from ads.whatsapp_contatos where etapa is not null group by etapa`,
    sql<{ id: string; para: string; nome: string | null; texto: string; quando: Date }[]>`
      select e.id, e.para, c.nome, e.texto, e.agendado_para as quando from ads.whatsapp_envios e left join ads.whatsapp_contatos c on c.numero = e.para
      where e.status = 'PENDENTE' and e.agendado_para > now() order by e.agendado_para limit 8`,
  ]);
  return {
    semana: n!.semana, anterior: n!.anterior, hoje: n!.hoje, suaVez: n!.sua_vez, naoLidas: n!.nao_lidas,
    pipeline: Number(n!.pipeline), ganhoMes: Number(n!.ganho_mes), ganhosMes: n!.ganhos_mes,
    dias: dias.map((d) => d.n), etapas, funil: Object.fromEntries(funil.map((f) => [f.etapa, f.n])),
    recentes: recentes.map((r) => ({ ...r, lead_em: r.lead_em.toISOString() })),
    agendadas: agendadas.map((a) => ({ ...a, quando: a.quando.toISOString() })),
  };
}

/** Conteúdo do workspace: posts agendados, sugestões do calendário a aprovar e o que saiu na semana. */
async function conteudo(ws: string): Promise<DadosPulso["conteudo"]> {
  const sql = db();
  const [[n], posts, itens] = await Promise.all([
    sql<{ publicados: number; agendados: number; aprovar: number; jobs: number; falhas: number }[]>`
      select
        (select count(*) from ads.instagram_posts where workspace_id = ${ws} and status = 'PUBLICADO' and publicado_em > now() - interval '7 days')::int as publicados,
        (select count(*) from ads.instagram_posts where workspace_id = ${ws} and status = 'AGENDADO' and agendado_para > now())::int as agendados,
        (select count(*) from ads.calendario_itens where workspace_id = ${ws} and status = 'SUGERIDO' and data_hora > now())::int as aprovar,
        (select count(*) from ads.jobs where workspace_id = ${ws} and status in ('PENDING','RUNNING'))::int as jobs,
        (select count(*) from ads.jobs where workspace_id = ${ws} and status = 'FAILED' and finished_at > now() - interval '24 hours')::int as falhas`,
    sql<{ id: string; tipo: string; legenda: string; quando: Date }[]>`
      select id, tipo, legenda, agendado_para as quando from ads.instagram_posts
      where workspace_id = ${ws} and status = 'AGENDADO' and agendado_para between now() and now() + interval '14 days' order by agendado_para limit 8`,
    sql<{ id: string; formato: string; tema: string; status: string; quando: Date }[]>`
      select id, formato, tema, status, data_hora as quando from ads.calendario_itens
      where workspace_id = ${ws} and status in ('SUGERIDO','APROVADO','GERANDO') and data_hora between now() and now() + interval '14 days' order by data_hora limit 8`,
  ]);
  return {
    ...n!,
    posts: posts.map((p) => ({ ...p, quando: p.quando.toISOString() })),
    itens: itens.map((i) => ({ ...i, quando: i.quando.toISOString() })),
  };
}

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCtx();
  const admin = isPlatformAdmin(ctx);
  const f = parseFiltro(await searchParams);
  const ws = ctx.workspace.id;
  // tudo de uma vez (se não houver conta, as de anúncios voltam vazias rápido)
  const [opcoes, { atual, anterior }, pontos, todas, dadosCrm, dadosConteudo] = await Promise.all([
    opcoesFiltro(ws), kpis(ws, f), serie(ws, f), campanhas(ws, f), admin ? crm() : null, conteudo(ws),
  ]);
  const top = todas.slice(0, 6);
  const temAds = opcoes.contas.length > 0;
  const gasto7 = pontos.slice(-7).reduce((a, p) => a + Number(p.spend ?? 0), 0);

  return (
    <div className="page" style={{ maxWidth: 1480 }}>
      <Pulso nome={ctx.workspace.name} crm={dadosCrm} conteudo={dadosConteudo}
        ads={temAds ? { gasto7, moeda: todas[0]?.currency ?? "BRL", campanhas: todas.filter((c) => c.status === "ACTIVE").length } : null} />

      {temAds ? (
        <section className="stack" style={{ gap: 16 }}>
          <div className="page-head" style={{ margin: 0 }}>
            <div><div className="eyebrow">Anúncios</div><h2 className="h3" style={{ margin: 0 }}>Campanhas</h2></div>
            <Suspense><Filters contas={opcoes.contas} campanhas={opcoes.campanhas} /></Suspense>
          </div>
          <Kpis atual={atual} anterior={anterior} dias={f.days} />
          <TrendChart data={pontos} />
          <div className="panel" data-enter>
            <div className="panel-head">
              <span className="panel-title">Campanhas que mais investiram</span>
              <Link href="/campaigns" className="btn btn-ghost btn-xs">Ver todas</Link>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Campanha</th><th>Plataforma</th><th>Status</th><th className="num">Gasto</th><th className="num">CTR</th><th className="num">CPA</th><th className="num">ROAS</th></tr></thead>
                <tbody>
                  {top.map((c) => {
                    const d = derive(c);
                    return (
                      <tr key={c.id}>
                        <td style={{ maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis" }}><Link href={`/campaigns?campaign=${c.id}`}>{c.name}</Link></td>
                        <td><ProviderTag p={c.provider} /></td>
                        <td><StatusTag s={c.status} /></td>
                        <td className="num">{money(c.spend, c.currency)}</td>
                        <td className="num">{pct(d.ctr)}</td>
                        <td className="num">{d.cpa == null ? "—" : money(d.cpa, c.currency)}</td>
                        <td className="num">{d.roas == null ? "—" : `${d.roas.toFixed(2).replace(".", ",")}x`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <Link href="/connections" className="panel spotlight vg-cta" data-enter>
          <span className="icon-tile"><Cable aria-hidden /></span>
          <span style={{ flex: 1 }}>
            <b>Conecte uma conta de anúncios</b>
            <span className="muted small" style={{ display: "block" }}>Com a Meta ou o Google conectados, investimento, resultados e ROAS das campanhas aparecem aqui também.</span>
          </span>
          <span className="btn btn-secondary btn-sm">Conectar</span>
        </Link>
      )}

      <Link href="/ai?nova=1&prompt=como-esta" className="panel spotlight vg-cta" data-enter>
        <span className="icon-tile"><Sparkles aria-hidden /></span>
        <span style={{ flex: 1 }}>
          <b>Pergunte à IA: “Como estão as campanhas do {ctx.workspace.name}?”</b>
          <span className="muted small" style={{ display: "block" }}>Ela lê as métricas do workspace, aponta desperdício e sugere ajustes. Toda mudança espera sua aprovação.</span>
        </span>
        <Bot aria-hidden className="text-tertiary" />
      </Link>
    </div>
  );
}
