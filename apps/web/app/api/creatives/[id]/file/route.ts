import { db, pedirRestauro, r2Presign } from "@domus-ads/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/ctx";
import { servirArquivo } from "@/lib/servir";

const AVISO_ARQUIVADO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#1b1d24"/><text x="200" y="145" fill="#c9ccd6" font-family="system-ui,sans-serif" font-size="18" text-anchor="middle">Arquivado no Drive</text><text x="200" y="172" fill="#8a8f9c" font-family="system-ui,sans-serif" font-size="13" text-anchor="middle">restaurando… recarregue em instantes</text></svg>`;

/**
 * Arquivo de um criativo, só para quem é do workspace. No PC (storage local): lido do disco com suporte a Range, para o
 * player avançar sem baixar tudo. No R2: redireciona para uma URL pré-assinada (1 h).
 * ?kind=thumb para a miniatura, ?download=1 para baixar com o nome do criativo.
 * Arquivado no Drive (só o PC do worker enxerga): mostra a prévia leve do R2; sem prévia, ou para baixar o original,
 * pede o restauro e responde "volte já" até ele voltar ao R2.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Criativo inválido" }, { status: 400 });
  const sql = db();
  const [c] = await sql<{ name: string; storage: string; r2_key: string | null; thumbnail_key: string | null; preview_key: string | null; mime: string | null; arquivado: boolean }[]>`
    select name, storage, r2_key, thumbnail_key, preview_key, mime, arquivado from ads.creatives where id = ${id.data} and workspace_id = ${ctx.workspace.id} and status = 'READY'`;
  const thumb = req.nextUrl.searchParams.get("kind") === "thumb";
  const key = thumb ? c?.thumbnail_key : c?.r2_key;
  if (!c || !key) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  const ext = key.split(".").pop()!.toLowerCase();

  if (!thumb) {
    // uso recente decide o que fica no R2; grava no máximo uma vez por hora por arquivo
    await sql`update ads.creatives set usado_em = now() where id = ${id.data} and (usado_em is null or usado_em < now() - interval '1 hour')`;
    // arquivado: a prévia leve que ficou no R2 serve para ver; o original só volta do Drive para baixar (?download / ?original)
    const querOriginal = req.nextUrl.searchParams.has("download") || req.nextUrl.searchParams.has("original");
    if (c.arquivado && c.preview_key && !querOriginal) {
      return NextResponse.redirect(await r2Presign(c.preview_key, "GET", 3600), { status: 302, headers: { "Cache-Control": "private, no-cache" } });
    }
    if (c.arquivado) {
      await pedirRestauro(sql, id.data, ctx.workspace.id);
      if (c.mime?.startsWith("image/")) {
        return new Response(AVISO_ARQUIVADO, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
      }
      return NextResponse.json({ error: "Arquivo no Drive: restaurando, tente de novo em instantes (o worker do PC precisa estar ligado)" }, { status: 503, headers: { "Retry-After": "15" } });
    }
  }
  const nome = req.nextUrl.searchParams.get("download") ? `${c.name.replace(/[^\w\- ]/g, "_")}.${ext}` : undefined;

  // miniatura sem mime próprio: o tipo sai da extensão
  return servirArquivo(req, { storage: c.storage, key, mime: thumb ? null : c.mime, download: nome });
}
