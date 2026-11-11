import type postgres from "postgres";
import type { Sql } from "./db";
import {
  DEFAULT_SCORE_WEIGHTS, PESO_COLUNA, SOCIAL_NETWORKS, type CampaignStatus, type Lead, type LeadCampaign, type LeadStage, type ScoreWeights, type SocialNetwork,
} from "./prospeccao";

/** Leitura e gravação da prospecção (ads.prosp_*). Só servidor e worker. */

const ms = (d: Date | null | undefined) => (d ? d.getTime() : undefined);
const n = (x: unknown) => (x === null || x === undefined ? undefined : Number(x));

interface LinhaCampanha {
  id: string; nome: string; nichos: string[]; local: string; lat: number | null; lng: number | null; raio_km: string; max_leads: number;
  ritmo: LeadCampaign["pace"]; auditar: boolean; foco: LeadCampaign["opportunityFocus"]; status: CampaignStatus;
  progresso: number; etapa_texto: string; encontrados: number; a_auditar: number; auditados: number; bloqueado: boolean; erro: string | null;
  created_at: Date; updated_at: Date;
}
const campanha = (c: LinhaCampanha): LeadCampaign => ({
  id: c.id, name: c.nome, niches: c.nichos, locationLabel: c.local, centerLat: c.lat ?? undefined, centerLng: c.lng ?? undefined,
  radiusKm: Number(c.raio_km), maxLeads: c.max_leads, pace: c.ritmo, auditWebsites: c.auditar, opportunityFocus: c.foco, status: c.status,
  foundCount: c.encontrados, auditedCount: c.auditados, blocked: c.bloqueado, error: c.erro, progress: c.progresso, step: c.etapa_texto, toAudit: c.a_auditar,
  createdAt: c.created_at.getTime(), updatedAt: c.updated_at.getTime(),
});

export async function campanhas(sql: Sql, id?: string): Promise<LeadCampaign[]> {
  const r = await sql<LinhaCampanha[]>`select * from ads.prosp_campanhas where ${id ? sql`id = ${id}` : sql`true`} order by created_at desc limit 300`;
  return r.map(campanha);
}

interface LinhaLead {
  id: string; campanha_id: string; nome: string; categoria: string; endereco: string; pais: string; lat: number | null; lng: number | null;
  distancia_km: string | null; telefone: string; email: string; whatsapp: string; site: string; situacao: Lead["websiteStatus"];
  instagram_handle: string; instagram_url: string; place_id: string | null; nota: string | null; avaliacoes: number | null; score: number;
  motivos: string[]; fontes: string[]; pixel_meta: boolean; google_ads: boolean; analytics: boolean; pixel_tiktok: boolean; cms: string | null;
  ia_resumo: string | null; ia_dores: string[] | null; ia_oferta: string | null; ia_whatsapp: string | null; ia_email_assunto: string | null; ia_email_corpo: string | null; ia_em: Date | null;
  etapa: string; notas: string; tags: string[]; proxima_acao: Date | null; contato_numero: string | null; deleted_at: Date | null; created_at: Date; updated_at: Date;
  redes: { rede: SocialNetwork; url: string }[] | null; diags: { codigo: string; rotulo: string; gravidade: Lead["auditFindings"][number]["severity"]; valor: string | null }[] | null;
}

const lead = (l: LinhaLead): Lead => ({
  id: l.id, campaignId: l.campanha_id, name: l.nome, category: l.categoria, address: l.endereco, country: l.pais,
  latitude: l.lat ?? undefined, longitude: l.lng ?? undefined, distanceKm: n(l.distancia_km),
  phone: l.telefone, email: l.email, whatsapp: l.whatsapp, websiteUrl: l.site, websiteStatus: l.situacao,
  instagramHandle: l.instagram_handle, instagramUrl: l.instagram_url,
  socials: Object.fromEntries((l.redes ?? []).map((r) => [r.rede, r.url])),
  tech: { fbPixel: l.pixel_meta || undefined, googleAds: l.google_ads || undefined, analytics: l.analytics || undefined, tiktokPixel: l.pixel_tiktok || undefined, cms: l.cms ?? undefined },
  placeId: l.place_id ?? undefined,
  aiInsight: l.ia_em ? { resumo: l.ia_resumo ?? "", dores: l.ia_dores ?? [], oferta: l.ia_oferta ?? "", whatsapp: l.ia_whatsapp ?? "", emailAssunto: l.ia_email_assunto ?? "", emailCorpo: l.ia_email_corpo ?? "", generatedAt: l.ia_em.getTime() } : undefined,
  rating: n(l.nota), reviewCount: l.avaliacoes ?? undefined, score: l.score, scoreReasons: l.motivos,
  auditFindings: (l.diags ?? []).map((d) => ({ code: d.codigo, label: d.rotulo, severity: d.gravidade, ...(d.valor ? { value: d.valor } : {}) })),
  sourceUrls: l.fontes, stageId: l.etapa, notes: l.notas, tags: l.tags, nextActionAt: ms(l.proxima_acao), deletedAt: ms(l.deleted_at),
  crmNumber: l.contato_numero ?? undefined, createdAt: l.created_at.getTime(), updatedAt: l.updated_at.getTime(),
});

/** Leads de uma campanha, de uma lista de ids, ou (sem filtro) os mais recentes de todas as campanhas para o pipeline. */
export async function leadsProsp(sql: Sql, f: { campanhaId?: string; ids?: string[]; limite?: number }): Promise<Lead[]> {
  const onde = f.ids ? sql`l.id = any(${f.ids})` : f.campanhaId ? sql`l.campanha_id = ${f.campanhaId}` : sql`l.deleted_at is null`;
  const r = await sql<LinhaLead[]>`
    select l.*,
      (select json_agg(json_build_object('rede', r.rede, 'url', r.url)) from ads.prosp_redes r where r.lead_id = l.id) as redes,
      (select json_agg(json_build_object('codigo', d.codigo, 'rotulo', d.rotulo, 'gravidade', d.gravidade, 'valor', d.valor) order by d.ordem) from ads.prosp_diagnosticos d where d.lead_id = l.id) as diags
    from ads.prosp_leads l where ${onde} order by l.score desc, l.updated_at desc limit ${f.limite ?? 2000}`;
  return r.map(lead);
}

export async function etapasProsp(sql: Sql): Promise<LeadStage[]> {
  const r = await sql<{ id: string; nome: string; cor: string; posicao: number; terminal: boolean }[]>`select * from ads.prosp_etapas order by posicao`;
  return r.map((e) => ({ id: e.id, name: e.nome, color: e.cor, position: e.posicao, terminal: e.terminal }));
}

export async function configProsp(sql: Sql): Promise<{ oferta: string; pesos: ScoreWeights }> {
  const [c] = await sql<Record<string, unknown>[]>`select * from ads.prosp_config where id = 1`;
  const pesos = Object.fromEntries((Object.keys(PESO_COLUNA) as (keyof ScoreWeights)[]).map((k) => [k, Number(c?.[PESO_COLUNA[k]] ?? DEFAULT_SCORE_WEIGHTS[k])])) as unknown as ScoreWeights;
  return { oferta: String(c?.oferta ?? ""), pesos };
}

const texto = (s: string | undefined, max = 2000) => (s ?? "").slice(0, max);

/**
 * Grava (ou atualiza) leads de uma campanha com redes e diagnóstico. O que é trabalho comercial (etapa, notas, tags,
 * análise, contato do CRM) só entra quando `comercial` (importação): o resultado de uma busca nunca apaga esse trabalho.
 */
export async function salvarLeadsProsp(sql: postgres.Sql, campanhaId: string, leads: Lead[], comercial = false) {
  if (!leads.length) return;
  const etapas = new Set((await sql<{ id: string }[]>`select id from ads.prosp_etapas`).map((e) => e.id));
  await sql.begin(async (tx) => {
    for (const l of leads) {
      const ia = comercial ? l.aiInsight : undefined;
      const etapa = comercial && etapas.has(l.stageId) ? l.stageId : "new";
      await tx`
        insert into ads.prosp_leads (id, campanha_id, nome, categoria, endereco, pais, lat, lng, distancia_km, telefone, email, whatsapp, site, situacao,
          instagram_handle, instagram_url, place_id, nota, avaliacoes, score, motivos, fontes, pixel_meta, google_ads, analytics, pixel_tiktok, cms,
          ia_resumo, ia_dores, ia_oferta, ia_whatsapp, ia_email_assunto, ia_email_corpo, ia_em, etapa, notas, tags, proxima_acao, deleted_at)
        values (${l.id}, ${campanhaId}, ${texto(l.name, 300)}, ${texto(l.category, 200)}, ${texto(l.address, 500)}, ${texto(l.country, 8) || "BR"},
          ${l.latitude ?? null}, ${l.longitude ?? null}, ${l.distanceKm ?? null}, ${texto(l.phone, 60)}, ${texto(l.email, 200)}, ${texto(l.whatsapp, 60)},
          ${texto(l.websiteUrl, 500)}, ${l.websiteStatus}, ${texto(l.instagramHandle, 100)}, ${texto(l.instagramUrl, 500)}, ${l.placeId ?? null},
          ${l.rating ?? null}, ${l.reviewCount ?? null}, ${Math.max(0, Math.min(100, Math.round(l.score)))}, ${l.scoreReasons.slice(0, 20).map((x) => texto(x, 300))},
          ${l.sourceUrls.slice(0, 10).map((x) => texto(x, 500))}, ${!!l.tech.fbPixel}, ${!!l.tech.googleAds}, ${!!l.tech.analytics}, ${!!l.tech.tiktokPixel}, ${l.tech.cms ? texto(l.tech.cms, 60) : null},
          ${ia?.resumo ?? null}, ${ia?.dores ?? null}, ${ia?.oferta ?? null}, ${ia?.whatsapp ?? null}, ${ia?.emailAssunto ?? null}, ${ia?.emailCorpo ?? null},
          ${ia ? new Date(ia.generatedAt || Date.now()) : null}, ${etapa}, ${comercial ? texto(l.notes, 5000) : ""}, ${comercial ? l.tags.slice(0, 30).map((t) => texto(t, 40)) : []},
          ${comercial && l.nextActionAt ? new Date(l.nextActionAt) : null}, ${comercial && l.deletedAt ? new Date(l.deletedAt) : null})
        on conflict (id) do update set campanha_id = excluded.campanha_id, nome = excluded.nome, categoria = excluded.categoria, endereco = excluded.endereco,
          lat = excluded.lat, lng = excluded.lng, distancia_km = excluded.distancia_km, telefone = excluded.telefone, email = excluded.email, whatsapp = excluded.whatsapp,
          site = excluded.site, situacao = excluded.situacao, instagram_handle = excluded.instagram_handle, instagram_url = excluded.instagram_url,
          place_id = excluded.place_id, nota = excluded.nota, avaliacoes = excluded.avaliacoes, score = excluded.score, motivos = excluded.motivos,
          fontes = excluded.fontes, pixel_meta = excluded.pixel_meta, google_ads = excluded.google_ads, analytics = excluded.analytics,
          pixel_tiktok = excluded.pixel_tiktok, cms = excluded.cms, updated_at = now()
          ${comercial ? tx`, ia_resumo = excluded.ia_resumo, ia_dores = excluded.ia_dores, ia_oferta = excluded.ia_oferta, ia_whatsapp = excluded.ia_whatsapp,
            ia_email_assunto = excluded.ia_email_assunto, ia_email_corpo = excluded.ia_email_corpo, ia_em = excluded.ia_em, etapa = excluded.etapa,
            notas = excluded.notas, tags = excluded.tags, proxima_acao = excluded.proxima_acao, deleted_at = excluded.deleted_at` : tx``}`;
      await tx`delete from ads.prosp_redes where lead_id = ${l.id}`;
      const redes = SOCIAL_NETWORKS.flatMap((r) => (l.socials[r] ? [{ lead_id: l.id, rede: r, url: texto(l.socials[r], 500) }] : []));
      if (redes.length) await tx`insert into ads.prosp_redes ${tx(redes)}`;
      await tx`delete from ads.prosp_diagnosticos where lead_id = ${l.id}`;
      const diags = l.auditFindings.slice(0, 30).map((d, i) => ({
        lead_id: l.id, ordem: i, codigo: texto(d.code, 60) || "item", rotulo: texto(d.label, 300) || "-",
        gravidade: ["info", "opportunity", "critical"].includes(d.severity) ? d.severity : "info", valor: d.value ? texto(String(d.value), 300) : null,
      }));
      if (diags.length) await tx`insert into ads.prosp_diagnosticos ${tx(diags)}`;
    }
  });
}
