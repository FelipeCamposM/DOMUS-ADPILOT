import { iaPreferencias } from "@domus-ads/core";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";
import { notificacoes, opcoesFiltro, usoContasIA, workerOnline } from "@/lib/queries";
import { Shell } from "@/modules/shell/Shell";
import type { EstadoWhatsapp } from "@/modules/settings/Whatsapp";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  // em paralelo: cada consulta é uma ida ao banco, em sequência somavam a cada navegação
  const [n, { campanhas }, w, contasIA, iaPref] = await Promise.all([
    notificacoes(ctx.workspace.id), opcoesFiltro(ctx.workspace.id), workerOnline(), usoContasIA(), iaPreferencias(),
  ]);
  const admin = isPlatformAdmin(ctx);
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
      whatsapp={{
        estado: (w.info.whatsapp as EstadoWhatsapp | undefined) ?? null,
        qr: admin ? ((w.info.whatsappQr as string | null) ?? null) : null,
        erro: (w.info.whatsappErro as string | null) ?? null,
      }}
      admin={admin}
      contasIA={contasIA}
      iaPref={iaPref}
    >
      {children}
    </Shell>
  );
}
