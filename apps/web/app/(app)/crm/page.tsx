import { db, whatsappAvisos } from "@domus-ads/core";
import type { EtapaCrm } from "@domus-ads/core/mensagens";
import { requireCtx } from "@/lib/ctx";
import { criativos } from "@/lib/video";
import { Mensagens, type Contato, type Mensagem, type Modelo } from "@/modules/mensagens/Mensagens";

export const metadata = { title: "CRM · Mensagens" };

export default async function CrmMensagensPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const ctx = await requireCtx(); // admin já checado no layout do CRM
  const sql = db();
  const [msgs, contatos, modelos, biblioteca, avisos, worker, etapas] = await Promise.all([
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
    sql<EtapaCrm[]>`select chave, nome, cor, ordem, tipo, dica from ads.crm_etapas order by ordem, created_at`,
  ]);
  return (
    <Mensagens
      mensagens={msgs.map((m) => ({ ...m, created_at: m.created_at.toISOString() }))}
      contatos={contatos.map((c) => ({ ...c, lido_em: c.lido_em.toISOString(), lead_em: c.lead_em?.toISOString() ?? null, consentimento_em: c.consentimento_em?.toISOString() ?? null }))}
      inicial={(await searchParams).c ?? null}
      modelos={modelos} avisos={avisos}
      biblioteca={biblioteca.filter((c) => c.status === "READY").slice(0, 80).map((c) => ({ id: c.id, nome: c.name, tipo: c.type === "IMAGE" ? "imagem" : "video", thumb: c.thumb }))}
      online={!!worker[0]?.ok && worker[0]?.wa === "open"} etapas={etapas}
    />
  );
}
