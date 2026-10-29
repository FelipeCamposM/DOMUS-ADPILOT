import { isPlatformAdmin, requireCtx } from "@/lib/ctx";

/** CRM: o WhatsApp é o número da plataforma (não é do workspace), então só o admin da plataforma entra. */
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) return <div className="page"><div className="empty">Só o administrador da plataforma usa o CRM.</div></div>;
  return children;
}
