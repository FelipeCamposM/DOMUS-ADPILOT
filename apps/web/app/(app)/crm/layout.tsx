import { db } from "@domus-ads/core";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";
import { AvisoBusca } from "@/modules/prospeccao/AvisoBusca";

/** CRM: o WhatsApp é o número da plataforma (não é do workspace), então só o admin da plataforma entra. */
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) return <div className="page"><div className="empty">Só o administrador da plataforma usa o CRM.</div></div>;
  // aviso fixo da prospecção em andamento, em todas as telas do CRM
  const [busca] = await db()<{ id: string }[]>`select id from ads.prosp_campanhas where status = 'running' order by created_at desc limit 1`;
  return <>{children}<AvisoBusca campanhaId={busca?.id ?? null} /></>;
}
