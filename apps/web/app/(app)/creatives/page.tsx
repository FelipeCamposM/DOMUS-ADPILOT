import { ImageIcon, Plus } from "lucide-react";
import Link from "next/link";
import { can, requireCtx } from "@/lib/ctx";
import { ago } from "@/lib/format";
import { criativos } from "@/lib/video";
import { AssetsLibrary } from "@/modules/creatives/AssetsLibrary";
import { Library } from "@/modules/creatives/Library";
import { VideoCard } from "@/modules/studio/VideoCard";

export const metadata = { title: "Criativos" };

const ABAS = [["videos", "Vídeos"], ["imagens", "Imagens"], ["arquivos", "Arquivos"], ["musicas", "Músicas"], ["efeitos", "Efeitos sonoros"]] as const;
const formatoDe = (w: number | null, h: number | null) =>
  !w || !h ? "9:16" : Math.abs(w / h - 1.91) < 0.05 ? "1.91:1" : w > h ? "16:9" : w === h ? "1:1" : h / w > 1.5 ? "9:16" : "4:5";

export default async function CreativesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const ctx = await requireCtx();
  const aba = (await searchParams).aba ?? "videos";
  const editor = can(ctx, "editor");
  const ws = ctx.workspace.id;
  const gerado = (t: string[]) => !t.includes("asset");

  let corpo: React.ReactNode;
  if (aba === "musicas" || aba === "efeitos") {
    const tipo = aba === "musicas" ? "MUSIC" : "SFX";
    corpo = <Library tipo={tipo} itens={await criativos(ws, [tipo])} podeEditar={editor} />;
  } else if (aba === "arquivos") {
    const itens = (await criativos(ws, ["IMAGE", "VIDEO"])).filter((c) => !gerado(c.tags));
    corpo = <AssetsLibrary itens={itens} podeEditar={editor} />;
  } else {
    const tipo = aba === "imagens" ? "IMAGE" : "VIDEO";
    const itens = (await criativos(ws, [tipo])).filter((c) => gerado(c.tags));
    corpo = itens.length === 0 ? (
      <div className="panel"><div className="empty">Nada ainda. Crie no <Link href={`/studio/novo${tipo === "IMAGE" ? "?tipo=imagem" : ""}`} style={{ textDecoration: "underline" }}>Studio</Link>.</div></div>
    ) : (
      <div className="studio-grid">
        {itens.map((c) => (
          <VideoCard key={c.id} href={c.project_id ? `/studio/${c.project_id}` : `/api/creatives/${c.id}/file`} creativeId={c.id} thumb={c.thumb} titulo={c.name} status={c.status}
            progress={null} kind={tipo === "IMAGE" ? "image" : "video"} formato={formatoDe(c.width, c.height)}
            sub={`${c.width}×${c.height}${c.duration_ms ? ` · ${(c.duration_ms / 1000).toFixed(1).replace(".", ",")} s` : ""} · ${ago(c.created_at)}`} />
        ))}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow" data-enter>{ctx.workspace.name}</div>
          <h1 className="page-title" data-enter>Criativos</h1>
        </div>
        {editor && (
          <div className="cluster" data-enter>
            <Link href="/studio/novo?tipo=imagem" className="btn btn-secondary"><ImageIcon aria-hidden /> Nova imagem</Link>
            <Link href="/studio/novo" className="btn btn-primary"><Plus aria-hidden /> Novo vídeo</Link>
          </div>
        )}
      </div>
      <div className="cluster" role="tablist" data-enter style={{ gap: 4, padding: 3, borderRadius: 12, border: "1px solid rgb(var(--c-border))", background: "rgb(var(--c-bg-surface))", alignSelf: "flex-start" }}>
        {ABAS.map(([k, l]) => <Link key={k} href={`/creatives?aba=${k}`} role="tab" aria-selected={aba === k} className="chip" data-active={aba === k} style={{ height: 30, border: 0 }}>{l}</Link>)}
      </div>
      {corpo}
    </div>
  );
}
