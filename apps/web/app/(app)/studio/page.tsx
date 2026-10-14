import { Clapperboard, ImageIcon, Plus } from "lucide-react";
import Link from "next/link";
import { can, requireCtx } from "@/lib/ctx";
import { ago } from "@/lib/format";
import { projetos } from "@/lib/video";
import { Busca } from "@/modules/shell/Busca";
import { StudioRefresh } from "@/modules/studio/StudioRefresh";
import { VideoCard } from "@/modules/studio/VideoCard";

export const metadata = { title: "Studio" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCtx();
  const { q } = await searchParams;
  const lista = await projetos(ctx.workspace.id, q);
  const rodando = lista.some((p) => !["NEW", "REVIEW", "READY", "FAILED"].includes(p.status));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow" data-enter>{ctx.workspace.name}</div>
          <h1 className="page-title" data-enter>Studio</h1>
        </div>
        {can(ctx, "editor") && (
          <div className="cluster" data-enter>
            <Link href="/studio/novo?tipo=imagem" className="btn btn-secondary"><ImageIcon aria-hidden /> Nova imagem</Link>
            <Link href="/studio/novo" className="btn btn-primary"><Plus aria-hidden /> Novo vídeo</Link>
          </div>
        )}
      </div>
      {rodando && <StudioRefresh />}
      <Busca placeholder="Buscar por título, produto ou marca" />
      {lista.length === 0 && q ? (
        <div className="panel"><div className="empty">Nada encontrado para “{q}”.</div></div>
      ) : lista.length === 0 ? (
        <div className="panel" data-enter="scale">
          <div className="empty">
            <span className="icon-tile"><Clapperboard aria-hidden /></span>
            <h2 className="h3">Crie seu primeiro criativo</h2>
            <p className="muted" style={{ maxWidth: 460 }}>Descreva o produto e o objetivo. Vídeo: a IA escreve o roteiro, a narração é gravada no seu PC e a animação vira MP4. Imagem: variações para teste A/B em PNG. Tudo com a identidade visual do workspace.</p>
            {can(ctx, "editor") && <Link href="/studio/novo" className="btn btn-primary" style={{ marginTop: 8 }}><Plus aria-hidden /> Novo vídeo</Link>}
          </div>
        </div>
      ) : (
        <div className="studio-grid">
          {lista.map((p) => (
            <VideoCard key={p.id} href={`/studio/${p.id}`} creativeId={p.creative_id} thumb={p.thumb} titulo={p.title} status={p.status} progress={p.progress}
              formato={p.brief.formato} kind={p.kind}
              sub={p.kind === "image" ? `Imagem · ${p.brief.formato.replace(".", ",")} · ${ago(p.updated_at)}` : `Vídeo · ${p.brief.formato} · ${p.brief.duracao} s · ${ago(p.updated_at)}`} />
          ))}
        </div>
      )}
    </div>
  );
}
