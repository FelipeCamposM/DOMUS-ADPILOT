import { db } from "@domus-ads/core";
import { Leads, type Lead } from "@/modules/mensagens/Leads";

export const metadata = { title: "CRM · Leads" };

export default async function CrmLeadsPage() {
  const sql = db();
  const [leads, sites] = await Promise.all([
    sql<(Omit<Lead, "lead_em" | "ultima"> & { lead_em: Date; ultima: Date | null })[]>`
      select c.numero, c.nome, c.etapa, s.nome as site, coalesce(c.lead_em, c.updated_at) as lead_em, c.lead_dados->>'mensagem' as mensagem,
        exists (select 1 from ads.whatsapp_envios e where e.para = c.numero and e.direcao = 'IN') as respondeu,
        (select max(e.created_at) from ads.whatsapp_envios e where e.para = c.numero and e.direcao <> 'NOTA') as ultima
      from ads.whatsapp_contatos c left join ads.lead_sites s on s.id = c.lead_site
      where c.etapa is not null order by coalesce(c.lead_em, c.updated_at) desc`,
    sql<{ nome: string }[]>`select nome from ads.lead_sites order by nome`,
  ]);
  return (
    <div className="page" style={{ maxWidth: 1480 }}>
      <Leads leads={leads.map((l) => ({ ...l, lead_em: l.lead_em.toISOString(), ultima: l.ultima?.toISOString() ?? null }))} sites={sites.map((s) => s.nome)} />
    </div>
  );
}
