import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MAX_SLIDES, planoImagemSchema } from "@domus-ads/core";
import { z } from "zod";
import { can, requireCtx } from "@/lib/ctx";
import { projeto, variacoes } from "@/lib/video";
import { ImageProjectView } from "@/modules/studio/ImageProjectView";
import { ProjectView } from "@/modules/studio/ProjectView";

export default async function ProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const p = await projeto(ctx.workspace.id, id.data);
  if (!p) notFound();
  if (p.kind === "image") {
    const b = p.brief as unknown as { produto: string; formato: string; variacoes: number; tipo?: string };
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <Link href="/studio" className="eyebrow" data-enter style={{ textDecoration: "none" }}><ChevronLeft size={12} aria-hidden /> Studio</Link>
            <h1 className="page-title" data-enter>{p.title}</h1>
            <p className="subtle small" data-enter>{b.tipo === "carrossel" ? "Carrossel" : "Imagem"} · {b.formato.replace(".", ",")} · {b.produto}</p>
          </div>
        </div>
        <ImageProjectView id={p.id} status={p.status} step={p.step_detail} error={p.error} progress={p.progress} formato={b.formato}
          variacoes={await variacoes(ctx.workspace.id, p.id)} conceitos={planoImagemSchema.safeParse(p.storyboard).data?.conceitos ?? []} carrossel={b.tipo === "carrossel"} maxSlides={MAX_SLIDES} podeEditar={can(ctx, "editor")} />
      </div>
    );
  }
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href="/studio" className="eyebrow" data-enter style={{ textDecoration: "none" }}><ChevronLeft size={12} aria-hidden /> Studio</Link>
          <h1 className="page-title" data-enter>{p.title}</h1>
          <p className="subtle small" data-enter>{p.brief.produto} · {p.brief.formato} · {p.brief.duracao} s pedidos</p>
        </div>
      </div>
      <ProjectView
        podeEditar={can(ctx, "editor")}
        p={{
          id: p.id, title: p.title, status: p.status, step_detail: p.step_detail, error: p.error, progress: p.progress, thumb: p.thumb,
          brief: { formato: p.brief.formato, duracao: p.brief.duracao, voz: p.brief.voz, vozNome: p.brief.vozNome, musica: p.brief.musica, produto: p.brief.produto },
          storyboard: p.storyboard ? { duration: p.storyboard.duration, scenes: p.storyboard.scenes, music: p.storyboard.music } : null,
          paleta: p.paleta,
          creative: p.creative ? { ...p.creative, avisos: p.creative.metadata.avisos ?? [], music: p.creative.metadata.music ?? null } : null,
        }}
      />
    </div>
  );
}

export async function generateMetadata() {
  return { title: "Vídeo" };
}
