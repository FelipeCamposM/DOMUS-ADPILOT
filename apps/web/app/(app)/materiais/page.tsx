import { Palette } from "lucide-react";
import Link from "next/link";
import { can, requireCtx } from "@/lib/ctx";
import { Biblioteca } from "@/modules/arquivos/Biblioteca";
import { HeroFx } from "@/modules/shell/HeroFx";

export const metadata = { title: "Materiais" };

export default async function MateriaisPage() {
  const ctx = await requireCtx();
  return (
    <div className="page">
      <div className="page-head">
        <HeroFx />
        <div>
          <div className="eyebrow" data-enter>{ctx.workspace.name}</div>
          <h1 className="page-title" data-enter>Materiais</h1>
          <p className="page-sub" data-enter>Logos, selos, balões, fundos e fotos de produto para usar nos posts. Uma pasta por marca; a IA do Studio encontra quando você cita um material no pedido.</p>
        </div>
        <div className="cluster" data-enter>
          <Link href="/marcas" className="btn btn-secondary"><Palette aria-hidden /> Marcas</Link>
        </div>
      </div>
      <Biblioteca modo="gerenciar" podeEditar={can(ctx, "editor")} soMateriais />
    </div>
  );
}
