import { db, whatsappAvisos } from "@domus-ads/core";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";
import { criativos } from "@/lib/video";
import { Mensagens, type Contato, type Mensagem, type Modelo, type SiteLead } from "@/modules/mensagens/Mensagens";

export const metadata = { title: "Mensagens" };

export default async function MensagensPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const ctx = await requireCtx();
  // o WhatsApp é o número da plataforma (não é do workspace): só o admin da plataforma vê e manda
  if (!isPlatformAdmin(ctx)) return <div className="page"><p className="subtle">Só o administrador da plataforma vê as mensagens.</p></div>;
  const sql = db();
  const [msgs, contatos, modelos, biblioteca, avisos, worker, sites] = await Promise.all([
    sql<(Omit<Mensagem, "created_at"> & { created_at: Date })[]>`
      select * from (select id, created_at, para, texto, status, erro, direcao, tipo, (midia_key is not null) as midia, midia_mime, midia_nome, autor
        from ads.whatsapp_envios order by created_at desc limit 3000) x order by created_at`,
    sql<(Omit<Contato, "lido_em" | "lead_em" | "consentimento_em"> & { lido_em: Date; lead_em: Date | null; consentimento_em: Date | null })[]>`
      select c.numero, c.nome, c.salvo, c.lido_em, c.etapa, c.lead_em, c.lead_dados, c.consentimento_em, s.nome as site
      from ads.whatsapp_contatos c left join ads.lead_sites s on s.id = c.lead_site`,
    sql<Modelo[]>`select id, nome, texto from ads.whatsapp_templates order by nome`,
    criativos(ctx.workspace.id, ["IMAGE", "VIDEO"]),
    whatsappAvisos(),
    sql<{ ok: boolean; wa: string | null }[]>`select last_seen > now() - interval '90 seconds' as ok, info->'whatsapp'->>'state' as wa from ads.worker_status order by last_seen desc limit 1`,
    sql<(Omit<SiteLead, "ultimo_lead"> & { ultimo_lead: Date | null })[]>`
      select s.id, s.nome, s.chave, s.dominios, s.mensagem_inicial, s.ativo, s.ultimo_lead, (select count(*)::int from ads.whatsapp_contatos c where c.lead_site = s.id) as leads
      from ads.lead_sites s order by s.created_at`,
  ]);
  return (
    <Mensagens
      mensagens={msgs.map((m) => ({ ...m, created_at: m.created_at.toISOString() }))}
      contatos={contatos.map((c) => ({ ...c, lido_em: c.lido_em.toISOString(), lead_em: c.lead_em?.toISOString() ?? null, consentimento_em: c.consentimento_em?.toISOString() ?? null }))}
      sites={sites.map((s) => ({ ...s, ultimo_lead: s.ultimo_lead?.toISOString() ?? null }))} inicial={(await searchParams).c ?? null}
      modelos={modelos} avisos={avisos}
      biblioteca={biblioteca.filter((c) => c.status === "READY").slice(0, 80).map((c) => ({ id: c.id, nome: c.name, tipo: c.type === "IMAGE" ? "imagem" : "video", thumb: c.thumb }))}
      online={!!worker[0]?.ok && worker[0]?.wa === "open"}
    />
  );
}
