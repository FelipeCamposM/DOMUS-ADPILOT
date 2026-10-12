import { ChevronLeft, PlugZap } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { contasGoogle } from "@/lib/contas";
import { can, requireCtx } from "@/lib/ctx";
import { NovaCampanha } from "@/modules/campaigns/NovaCampanha";

export const metadata = { title: "Nova campanha" };

export default async function NovaCampanhaPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "editor")) redirect("/campaigns");
  const contas = await contasGoogle(ctx.workspace.id);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href="/campaigns" className="eyebrow" data-enter style={{ textDecoration: "none" }}><ChevronLeft size={12} aria-hidden /> Campanhas</Link>
          <h1 className="page-title" data-enter>Nova campanha · Google Pesquisa</h1>
        </div>
      </div>
      {contas.length ? <NovaCampanha contas={contas} /> : (
        <div className="panel" data-enter style={{ maxWidth: 640 }}>
          <div className="empty" style={{ display: "grid", gap: 10, justifyItems: "center", textAlign: "center" }}>
            <PlugZap size={28} aria-hidden />
            <b>Nenhuma conta do Google Ads conectada neste workspace</b>
            <span className="subtle small">Conecte em Conexões → Conectar Google Ads (precisa das credenciais do Google no servidor; veja o manual, seção 5).</span>
            <Link href="/connections" className="btn btn-primary btn-sm">Ir para Conexões</Link>
          </div>
        </div>
      )}
    </div>
  );
}
