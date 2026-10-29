import { db } from "@domus-ads/core";
import type { EtapaCrm } from "@domus-ads/core/mensagens";
import { Leads, type Lead } from "@/modules/mensagens/Leads";

export const metadata = { title: "CRM · Leads" };

type Linha = Omit<Lead, "lead_em" | "etapa_em" | "ultima" | "primeira_resp"> & { lead_em: Date; etapa_em: Date; ultima: Date | null; primeira_resp: Date | null };
const iso = (d: Date | null) => d?.toISOString() ?? null;

export default async function CrmLeadsPage() {
  const sql = db();
  const [leads, etapas, sites] = await Promise.all([
    sql<Linha[]>`
      select c.numero, c.nome, c.etapa, s.nome as site, c.lead_valor::text as valor,
        coalesce(c.lead_em, c.updated_at) as lead_em, coalesce(c.etapa_em, c.lead_em, c.updated_at) as etapa_em,
        c.lead_dados->>'mensagem' as mensagem, c.lead_dados->>'origem' as origem, c.lead_dados->>'email' as email,
        c.lead_dados->'utm'->>'source' as utm, c.lead_dados->'utm'->>'campaign' as campanha,
        m.ultima, m.ultima_dir, m.respondeu, m.msgs, m.primeira_resp
      from ads.whatsapp_contatos c
      left join ads.lead_sites s on s.id = c.lead_site
      left join lateral (
        select max(e.created_at) as ultima,
          (array_agg(e.direcao order by e.created_at desc))[1] as ultima_dir,
          bool_or(e.direcao = 'IN') as respondeu, count(*)::int as msgs,
          min(e.created_at) filter (where e.direcao = 'OUT' and e.created_at >= coalesce(c.lead_em, c.updated_at)) as primeira_resp
        from ads.whatsapp_envios e where e.para = c.numero and e.direcao <> 'NOTA'
      ) m on true
      where c.etapa is not null order by coalesce(c.lead_em, c.updated_at) desc`,
    sql<EtapaCrm[]>`select chave, nome, cor, ordem, tipo, dica from ads.crm_etapas order by ordem, created_at`,
    sql<{ nome: string }[]>`select nome from ads.lead_sites order by nome`,
  ]);
  return (
    <div className="page" style={{ maxWidth: 1600 }}>
      <Leads etapas={etapas} sites={sites.map((s) => s.nome)}
        leads={leads.map((l) => ({ ...l, respondeu: !!l.respondeu, msgs: l.msgs ?? 0, lead_em: l.lead_em.toISOString(), etapa_em: l.etapa_em.toISOString(), ultima: iso(l.ultima), primeira_resp: iso(l.primeira_resp) }))} />
    </div>
  );
}
