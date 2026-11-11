import { isPlatformAdmin, requireCtx } from "@/lib/ctx";
import "./financeiro.css";

/** Financeiro: contas pessoais e da empresa do dono da plataforma. Só o admin da plataforma entra. */
export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) return <div className="page"><div className="empty">Só o administrador da plataforma usa o Financeiro.</div></div>;
  return children;
}
