import { armazenamento } from "@domus-ads/core";
import { can, requireCtx } from "@/lib/ctx";
import { usoArmazenamento } from "@/lib/armazenamento";
import { Biblioteca } from "@/modules/arquivos/Biblioteca";
import { HeroFx } from "@/modules/shell/HeroFx";

export const metadata = { title: "Arquivos" };

export default async function ArquivosPage() {
  const ctx = await requireCtx();
  const [uso, cfg] = await Promise.all([usoArmazenamento(), armazenamento()]);
  return (
    <div className="page">
      <div className="page-head">
        <HeroFx />
        <div>
          <div className="eyebrow" data-enter>{ctx.workspace.name}</div>
          <h1 className="page-title" data-enter>Arquivos</h1>
        </div>
      </div>
      <Biblioteca modo="gerenciar" podeEditar={can(ctx, "editor")} uso={{ uso, limiteGb: cfg.limiteGb }} />
    </div>
  );
}
