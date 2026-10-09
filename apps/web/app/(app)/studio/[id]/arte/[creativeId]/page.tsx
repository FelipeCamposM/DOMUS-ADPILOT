import { anexosSchema, brandSchema, db, lerArquivo, pedirRestauro } from "@domus-ads/core";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { can, requireCtx } from "@/lib/ctx";
import { ArtEditor, type AssetEmbutido } from "@/modules/studio/ArtEditor";

export const metadata = { title: "Editar arte" };

const LIMITE = 8 * 1024 * 1024; // anexos maiores ficam de fora da prévia do editor (continuam na arte final)

/** Editor visual de uma imagem do Studio: abre a composição HTML original (sem conversão) para arrastar e editar. */
export default async function EditarArtePage({ params }: { params: Promise<{ id: string; creativeId: string }> }) {
  const ctx = await requireCtx();
  const ids = z.object({ id: z.string().uuid(), creativeId: z.string().uuid() }).safeParse(await params);
  if (!ids.success) notFound();
  if (!can(ctx, "editor")) redirect(`/studio/${ids.data.id}`);
  const sql = db();
  const [c] = await sql<{ name: string; width: number | null; height: number | null; metadata: { composition?: string; conceito?: string } }[]>`
    select name, width, height, metadata from ads.creatives
    where id = ${ids.data.creativeId} and workspace_id = ${ctx.workspace.id} and type = 'IMAGE' and metadata->>'projectId' = ${ids.data.id}`;
  if (!c?.metadata.composition) notFound();
  const [p] = await sql<{ title: string; assets: unknown; brand: unknown }[]>`
    select p.title, p.assets, w.brand from ads.video_projects p join ads.workspaces w on w.id = p.workspace_id
    where p.id = ${ids.data.id} and p.workspace_id = ${ctx.workspace.id}`;
  if (!p) notFound();

  // assets/logo.* e assets/anexo-N.* (como o worker nomeia) → bytes do arquivo, embutidos como data: URI
  const anexos = anexosSchema.parse({ assets: p.assets ?? [], links: [] }).assets;
  const logoId = brandSchema.parse(p.brand ?? {}).logoId;
  const nomes = [...new Set([...c.metadata.composition.matchAll(/assets\/([\w.-]+)/g)].map((m) => m[1]!))];
  const embutidos: AssetEmbutido[] = [];
  for (const nome of nomes) {
    const n = /^anexo-(\d+)\./.exec(nome)?.[1];
    const creativeId = nome.startsWith("logo.") ? logoId : n ? anexos[Number(n) - 1]?.creativeId : null;
    if (!creativeId) continue;
    const [a] = await sql<{ storage: string; r2_key: string | null; arquivado: boolean; mime: string | null; size_bytes: string | null }[]>`
      select storage, r2_key, arquivado, mime, size_bytes from ads.creatives where id = ${creativeId} and workspace_id = ${ctx.workspace.id} and status = 'READY'`;
    if (!a?.r2_key || Number(a.size_bytes ?? 0) > LIMITE) continue;
    // arquivado no Drive: o site não enxerga; pede o restauro e a prévia mostra o espaço vazio até lá
    if (a.arquivado) { await pedirRestauro(sql, creativeId, ctx.workspace.id); continue; }
    try {
      const buf = await lerArquivo({ storage: a.storage, r2_key: a.r2_key });
      embutidos.push({ caminho: `assets/${nome}`, dados: `data:${a.mime ?? "application/octet-stream"};base64,${buf.toString("base64")}` });
    } catch {
      // sem o arquivo neste servidor: a prévia mostra o espaço vazio, a arte final continua com ele
    }
  }

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="page-head">
        <div>
          <Link href={`/studio/${ids.data.id}`} className="eyebrow" data-enter style={{ textDecoration: "none" }}><ChevronLeft size={12} aria-hidden /> {p.title}</Link>
          <h1 className="page-title" data-enter>Editar arte</h1>
          <p className="subtle small" data-enter>{c.metadata.conceito ?? c.name}</p>
        </div>
      </div>
      <ArtEditor projectId={ids.data.id} creativeId={ids.data.creativeId} html={c.metadata.composition} assets={embutidos} w={c.width ?? 1080} h={c.height ?? 1080} />
    </div>
  );
}
