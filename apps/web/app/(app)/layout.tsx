import { requireCtx } from "@/lib/ctx";
import { notificacoes, opcoesFiltro, usoContasIA, workerOnline } from "@/lib/queries";
import { Shell } from "@/modules/shell/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const n = await notificacoes(ctx.workspace.id);
  const { campanhas } = await opcoesFiltro(ctx.workspace.id);
  const w = await workerOnline();
  const contasIA = await usoContasIA();
  return (
    <Shell
      user={ctx.user}
      workspaces={ctx.workspaces}
      workspaceId={ctx.workspace.id}
      campanhas={campanhas.map((c) => ({ id: c.id, name: c.name }))}
      notificacoes={{
        acoes: n.acoes.map((a) => ({ ...a, created_at: a.created_at.toISOString() })),
        falhas: n.falhas.map((f) => ({ ...f, finished_at: f.finished_at.toISOString() })),
      }}
      worker={{ online: w.online, lastSeen: w.lastSeen?.toISOString() ?? null }}
      contasIA={contasIA}
    >
      {children}
    </Shell>
  );
}
