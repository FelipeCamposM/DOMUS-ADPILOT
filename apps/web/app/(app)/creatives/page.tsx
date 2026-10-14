import { ImageIcon, Plus } from "lucide-react";
import Link from "next/link";
import { can, requireCtx } from "@/lib/ctx";
import { ago } from "@/lib/format";
import { criativos, type CriativoLinha } from "@/lib/video";
import { AssetsLibrary } from "@/modules/creatives/AssetsLibrary";
import { Library } from "@/modules/creatives/Library";
import { Busca } from "@/modules/shell/Busca";
import { VideoCard } from "@/modules/studio/VideoCard";

export const metadata = { title: "Criativos" };

const ABAS = [["todos", "Todos"], ["videos", "Vídeos"], ["imagens", "Imagens"], ["arquivos", "Arquivos"], ["musicas", "Músicas"], ["efeitos", "Efeitos sonoros"]] as const;
/** Slides de um carrossel viram um cartão só (capa = slide 1); o resto passa como está. */
function agrupar(itens: CriativoLinha[]) {
  const grupos = new Map<string, { capa: CriativoLinha; n: number }>();
  const out: { capa: CriativoLinha; n: number }[] = [];
  for (const c of itens) {
    if (!c.carrossel || !c.project_id) { out.push({ capa: c, n: 1 }); continue; }
    const g = grupos.get(c.project_id);
    if (g) { g.n++; if ((c.ordem ?? 99) < (g.capa.ordem ?? 99)) g.capa = c; continue; }
    const novo = { capa: c, n: 1 };
    grupos.set(c.project_id, novo);
    out.push(novo);
  }
  return out;
}

const formatoDe = (w: number | null, h: number | null) =>
  !w || !h ? "9:16" : Math.abs(w / h - 1.91) < 0.05 ? "1.91:1" : w > h ? "16:9" : w === h ? "1:1" : h / w > 1.5 ? "9:16" : "4:5";

export default async function CreativesPage({ searchParams }: { searchParams: Promise<{ aba?: string; q?: string }> }) {
  const ctx = await requireCtx();
  const { aba = "todos", q } = await searchParams;
  const editor = can(ctx, "editor");
  const ws = ctx.workspace.id;
  const gerado = (t: string[]) => !t.includes("asset");

  const vazio = <div className="panel"><div className="empty">{q ? `Nada encontrado para “${q}”.` : "Nada ainda."}</div></div>;
  const cartao = ({ capa: c, n }: { capa: CriativoLinha; n: number }) => (
    <VideoCard key={c.id} href={c.project_id ? `/studio/${c.project_id}` : `/api/creatives/${c.id}/file`} creativeId={c.id} thumb={c.thumb} status={c.status}
      titulo={n > 1 ? c.name.split(" · slide ")[0]! : c.name} slides={n}
      progress={null} kind={c.type === "IMAGE" ? "image" : "video"} formato={formatoDe(c.width, c.height)}
      sub={`${n > 1 ? `Carrossel · ${n} slides` : c.type === "IMAGE" ? "Imagem" : "Vídeo"}${gerado(c.tags) ? "" : " enviado"} · ${c.width}×${c.height}${c.duration_ms ? ` · ${(c.duration_ms / 1000).toFixed(1).replace(".", ",")} s` : ""} · ${ago(c.created_at)}`} />
  );

  let corpo: React.ReactNode;
  if (aba === "todos") {
    // tudo de uma vez: vídeos e imagens (gerados e enviados) em grade, áudios em lista
    const itens = await criativos(ws, ["VIDEO", "IMAGE", "MUSIC", "SFX"], q);
    const visuais = itens.filter((c) => c.type === "VIDEO" || c.type === "IMAGE");
    const audios = itens.filter((c) => c.type === "MUSIC" || c.type === "SFX");
    corpo = !itens.length ? vazio : (
      <>
        {visuais.length > 0 && <div className="studio-grid">{agrupar(visuais).map(cartao)}</div>}
        {audios.length > 0 && (
          <div className="panel">
            <div className="panel-head"><div className="panel-title">Áudios ({audios.length})</div></div>
            <table className="data">
              <tbody>
                {audios.map((c) => (
                  <tr key={c.id}>
                    <td><b style={{ fontWeight: 600 }}>{c.name}</b><div className="caption subtle">{c.type === "MUSIC" ? "Música" : "Efeito sonoro"}{c.tags.length ? ` · ${c.tags.join(", ")}` : ""}</div></td>
                    <td style={{ width: 320 }}><audio controls preload="none" src={`/api/creatives/${c.id}/file`} style={{ width: "100%", height: 32 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  } else if (aba === "musicas" || aba === "efeitos") {
    const tipo = aba === "musicas" ? "MUSIC" : "SFX";
    corpo = <Library tipo={tipo} itens={await criativos(ws, [tipo], q)} podeEditar={editor} />;
  } else if (aba === "arquivos") {
    const itens = (await criativos(ws, ["IMAGE", "VIDEO"], q)).filter((c) => !gerado(c.tags));
    corpo = <AssetsLibrary itens={itens} podeEditar={editor} />;
  } else {
    const tipo = aba === "imagens" ? "IMAGE" : "VIDEO";
    const itens = (await criativos(ws, [tipo], q)).filter((c) => gerado(c.tags));
    corpo = itens.length === 0 && q ? vazio : itens.length === 0 ? (
      <div className="panel"><div className="empty">Nada ainda. Crie no <Link href={`/studio/novo${tipo === "IMAGE" ? "?tipo=imagem" : ""}`} style={{ textDecoration: "underline" }}>Studio</Link>.</div></div>
    ) : (
      <div className="studio-grid">{agrupar(itens).map(cartao)}</div>
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
        {ABAS.map(([k, l]) => <Link key={k} href={`/creatives?aba=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} role="tab" aria-selected={aba === k} className="chip" data-active={aba === k} style={{ height: 30, border: 0 }}>{l}</Link>)}
      </div>
      <Busca placeholder="Buscar em criativos (nome, tag ou projeto)" />
      {corpo}
    </div>
  );
}
