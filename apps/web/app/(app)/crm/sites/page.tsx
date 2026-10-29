import { db } from "@domus-ads/core";
import type { SiteLead } from "@/modules/mensagens/Mensagens";
import { Sites } from "@/modules/mensagens/Sites";

export const metadata = { title: "CRM · Sites" };

export default async function CrmSitesPage() {
  const sites = await db()<(Omit<SiteLead, "ultimo_lead"> & { ultimo_lead: Date | null })[]>`
    select s.id, s.nome, s.chave, s.dominios, s.mensagem_inicial, s.ativo, s.ultimo_lead, (select count(*)::int from ads.whatsapp_contatos c where c.lead_site = s.id) as leads
    from ads.lead_sites s order by s.created_at`;
  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <Sites sites={sites.map((s) => ({ ...s, ultimo_lead: s.ultimo_lead?.toISOString() ?? null }))} />
    </div>
  );
}
