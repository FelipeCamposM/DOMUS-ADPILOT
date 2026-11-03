import { db } from "@domus-ads/core";
import { Prospeccao, type Busca, type Prospecto } from "@/modules/prospeccao/Prospeccao";

export const metadata = { title: "CRM · Prospecção" };

export default async function CrmProspeccaoPage() {
  const sql = db(); // admin já checado no layout do CRM
  const [buscas, prospectos, [worker]] = await Promise.all([
    sql<(Omit<Busca, "created_at"> & { created_at: Date })[]>`
      select id, nicho, cidade, bairros, profundidade, status, progresso, encontrados, novos, erro, created_at
      from ads.prospeccoes order by created_at desc limit 40`,
    sql<Prospecto[]>`
      select id, prospeccao_id, nome, categoria, endereco, telefone, whatsapp, site, tipo_site, emails, redes, nota::float as nota, avaliacoes, link, pontos, status, nota_interna
      from ads.prospectos order by pontos desc, created_at desc limit 3000`,
    sql<{ ok: boolean }[]>`select last_seen > now() - interval '90 seconds' as ok from ads.worker_status order by last_seen desc limit 1`,
  ]);
  return (
    <div className="page" style={{ maxWidth: 1500 }}>
      <Prospeccao buscas={buscas.map((b) => ({ ...b, created_at: b.created_at.toISOString() }))} prospectos={prospectos} online={!!worker?.ok} />
    </div>
  );
}
