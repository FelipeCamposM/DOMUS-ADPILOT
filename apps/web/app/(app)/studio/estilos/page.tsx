import { can, isPlatformAdmin, requireCtx } from "@/lib/ctx";
import { listarEstilos } from "@/lib/estilos";
import { HeroFx } from "@/modules/shell/HeroFx";
import { Estilos } from "@/modules/studio/Estilos";

export const metadata = { title: "Estilos" };

export default async function EstilosPage() {
  const ctx = await requireCtx();
  const estilos = await listarEstilos(ctx.workspace.id);
  return (
    <div className="page">
      <div className="page-head">
        <HeroFx />
        <div>
          <div className="eyebrow" data-enter>Studio</div>
          <h1 className="page-title" data-enter>Estilos</h1>
          <p className="page-sub" data-enter>Escolha uma linguagem visual e use em qualquer criação, copie o prompt, ou monte o seu com referências (guardadas no seu Google Drive).</p>
        </div>
      </div>
      <Estilos estilos={estilos} podeEditar={can(ctx, "editor")} admin={isPlatformAdmin(ctx)} />
    </div>
  );
}
