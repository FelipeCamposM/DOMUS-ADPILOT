import { can, requireCtx } from "@/lib/ctx";
import { marcasDoWorkspace } from "@/lib/marcas";
import { Marcas } from "@/modules/marcas/Marcas";

export const metadata = { title: "Marcas" };

export default async function MarcasPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const ctx = await requireCtx();
  const { m } = await searchParams;
  const marcas = await marcasDoWorkspace(ctx.workspace.id);
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow" data-enter>{ctx.workspace.name}</div>
          <h1 className="page-title" data-enter>Marcas</h1>
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <Marcas marcas={marcas} atual={marcas.find((x) => x.id === m) ?? marcas[0] ?? null} podeEditar={can(ctx, "editor")} />
      </div>
    </div>
  );
}
