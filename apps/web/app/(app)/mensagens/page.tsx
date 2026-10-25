import { db, whatsappAvisos } from "@domus-ads/core";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";
import { criativos } from "@/lib/video";
import { Mensagens, type Contato, type Mensagem, type Modelo } from "@/modules/mensagens/Mensagens";

export const metadata = { title: "Mensagens" };

export default async function MensagensPage() {
  const ctx = await requireCtx();
  // o WhatsApp é o número da plataforma (não é do workspace): só o admin da plataforma vê e manda
  if (!isPlatformAdmin(ctx)) return <div className="page"><p className="subtle">Só o administrador da plataforma vê as mensagens.</p></div>;
  const sql = db();
  const [msgs, contatos, modelos, biblioteca, avisos, worker] = await Promise.all([
    sql<(Omit<Mensagem, "created_at"> & { created_at: Date })[]>`
      select * from (select id, created_at, para, texto, status, erro, direcao, tipo, (midia_key is not null) as midia, midia_mime, midia_nome, autor
        from ads.whatsapp_envios order by created_at desc limit 3000) x order by created_at`,
    sql<(Omit<Contato, "lido_em"> & { lido_em: Date })[]>`select numero, nome, salvo, lido_em from ads.whatsapp_contatos`,
    sql<Modelo[]>`select id, nome, texto from ads.whatsapp_templates order by nome`,
    criativos(ctx.workspace.id, ["IMAGE", "VIDEO"]),
    whatsappAvisos(),
    sql<{ ok: boolean; wa: string | null }[]>`select last_seen > now() - interval '90 seconds' as ok, info->'whatsapp'->>'state' as wa from ads.worker_status order by last_seen desc limit 1`,
  ]);
  return (
    <Mensagens
      mensagens={msgs.map((m) => ({ ...m, created_at: m.created_at.toISOString() }))}
      contatos={contatos.map((c) => ({ ...c, lido_em: c.lido_em.toISOString() }))}
      modelos={modelos} avisos={avisos}
      biblioteca={biblioteca.filter((c) => c.status === "READY").slice(0, 80).map((c) => ({ id: c.id, nome: c.name, tipo: c.type === "IMAGE" ? "imagem" : "video", thumb: c.thumb }))}
      online={!!worker[0]?.ok && worker[0]?.wa === "open"}
    />
  );
}
