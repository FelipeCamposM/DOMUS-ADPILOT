import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { briefEdicaoSchema, chaveElevenLabs, db, MAX_SLIDES, planoEdicaoSchema, planoImagemSchema, REDES, VOZES, vozesElevenLabs } from "@domus-ads/core";
import { z } from "zod";
import { can, requireCtx } from "@/lib/ctx";
import { projeto, variacoes } from "@/lib/video";
import { ImageProjectView } from "@/modules/studio/ImageProjectView";
import { ProjectView } from "@/modules/studio/ProjectView";
import { EditProjectView } from "@/modules/studio/edicao/EditProjectView";
import { Consumo } from "@/modules/studio/Consumo";

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
        <Consumo workspaceId={ctx.workspace.id} projetoId={p.id} />
      </div>
    );
  }
  if (p.kind === "edit") {
    const brief = briefEdicaoSchema.parse(p.brief);
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <Link href="/studio" className="eyebrow" data-enter style={{ textDecoration: "none" }}><ChevronLeft size={12} aria-hidden /> Studio</Link>
            <h1 className="page-title" data-enter>{p.title}</h1>
            <p className="subtle small" data-enter>Vídeo enviado · {brief.formato} · {REDES[brief.rede]}</p>
          </div>
        </div>
        <EditProjectView podeEditar={can(ctx, "editor")} p={{
          id: p.id, status: p.status, step_detail: p.step_detail, error: p.error, progress: p.progress, brief,
          plano: planoEdicaoSchema.safeParse(p.storyboard).data ?? null,
          creative: p.creative ? { id: p.creative.id, duration_ms: p.creative.duration_ms, size_bytes: p.creative.size_bytes, avisos: p.creative.metadata.avisos ?? [] } : null,
        }} />
        <Consumo workspaceId={ctx.workspace.id} projetoId={p.id} />
      </div>
    );
  }
  // vozes para "Trocar voz": favoritas do ElevenLabs primeiro, depois o resto e as locais
  const chave = await chaveElevenLabs();
  const [eu] = await db()<{ vozes_favoritas: string[] }[]>`select vozes_favoritas from ads.workspace_members where workspace_id = ${ctx.workspace.id} and user_id = ${ctx.user.id}`;
  const fav = eu?.vozes_favoritas ?? [];
  const el = chave ? await vozesElevenLabs(chave).catch(() => []) : [];
  const vozes = [
    ...el.filter((v) => fav.includes(v.id)).map((v) => ({ id: `el:${v.id}`, nome: v.nome, fav: true })),
    ...el.filter((v) => !fav.includes(v.id)).map((v) => ({ id: `el:${v.id}`, nome: v.nome, fav: false })),
    ...Object.entries(VOZES).filter(([k]) => k !== "none").map(([id, nome]) => ({ id, nome: `${nome} · local`, fav: false })),
  ];
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
        vozes={vozes}
        p={{
          id: p.id, title: p.title, status: p.status, step_detail: p.step_detail, error: p.error, progress: p.progress, thumb: p.thumb,
          brief: { formato: p.brief.formato, duracao: p.brief.duracao, voz: p.brief.voz, vozNome: p.brief.vozNome, musica: p.brief.musica, produto: p.brief.produto, estiloVisual: p.brief.estiloVisual },
          storyboard: p.storyboard ? { duration: p.storyboard.duration, scenes: p.storyboard.scenes, music: p.storyboard.music } : null,
          paleta: p.paleta,
          creative: p.creative ? { ...p.creative, avisos: p.creative.metadata.avisos ?? [], music: p.creative.metadata.music ?? null } : null,
        }}
      />
      <Consumo workspaceId={ctx.workspace.id} projetoId={p.id} />
    </div>
  );
}

export async function generateMetadata() {
  return { title: "Vídeo" };
}
