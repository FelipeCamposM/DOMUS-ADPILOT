import { db, whatsappAvisos } from "@domus-ads/core";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";
import { Mensagens, type Envio } from "@/modules/mensagens/Mensagens";

export const metadata = { title: "Mensagens" };

export default async function MensagensPage() {
  const ctx = await requireCtx();
  // avisos da plataforma (não são do workspace): só o admin da plataforma vê
  if (!isPlatformAdmin(ctx)) return <div className="page"><p className="subtle">Só o administrador da plataforma vê as mensagens enviadas.</p></div>;
  const envios = await db()<(Omit<Envio, "created_at"> & { created_at: Date })[]>`
    select * from (select id, created_at, para, texto, status, erro from ads.whatsapp_envios order by created_at desc limit 500) x order by created_at`;
  return <Mensagens envios={envios.map((e) => ({ ...e, created_at: e.created_at.toISOString() }))} avisos={await whatsappAvisos()} />;
}
