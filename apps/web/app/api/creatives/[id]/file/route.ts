import { caminhoLocal, db, pedirRestauro, r2Presign } from "@domus-ads/core";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/ctx";

const AVISO_ARQUIVADO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#1b1d24"/><text x="200" y="145" fill="#c9ccd6" font-family="system-ui,sans-serif" font-size="18" text-anchor="middle">Arquivado no Drive</text><text x="200" y="172" fill="#8a8f9c" font-family="system-ui,sans-serif" font-size="13" text-anchor="middle">restaurando… recarregue em instantes</text></svg>`;

const TIPOS: Record<string, string> = { mp4: "video/mp4", jpg: "image/jpeg", png: "image/png", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", flac: "audio/flac" };

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

  if (c.storage !== "local") {
    return NextResponse.redirect(await r2Presign(key, "GET", 3600, nome), { status: 302, headers: { "Cache-Control": "private, no-cache" } });
  }

  if (!process.env.MEDIA_DIR) {
    return NextResponse.json({ error: "MEDIA_DIR não está carregado neste servidor: reinicie o pnpm dev (o .env só é lido ao iniciar)" }, { status: 503 });
  }
  const caminho = caminhoLocal(key);
  const info = await stat(caminho).catch(() => null);
  if (!info) return NextResponse.json({ error: "O arquivo não está no disco deste PC (MEDIA_DIR)" }, { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": (thumb ? null : c.mime) ?? TIPOS[ext] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    // a chave muda quando o arquivo é refeito: o navegador revalida e só baixa de novo se mudou
    "Cache-Control": "private, no-cache",
    ETag: `"${key.split("/").pop()}"`,
  };
  if (req.headers.get("if-none-match") === headers.ETag) return new Response(null, { status: 304, headers });
  if (nome) headers["Content-Disposition"] = `attachment; filename="${nome}"`;

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const total = info.size;
    let inicio = range[1] ? Number(range[1]) : total - Number(range[2]);
    let fim = range[1] && range[2] ? Number(range[2]) : total - 1;
    inicio = Math.max(0, inicio);
    fim = Math.min(total - 1, fim);
    if (inicio > fim) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    const corpo = Readable.toWeb(createReadStream(caminho, { start: inicio, end: fim })) as ReadableStream;
    return new Response(corpo, { status: 206, headers: { ...headers, "Content-Range": `bytes ${inicio}-${fim}/${total}`, "Content-Length": String(fim - inicio + 1) } });
  }
  return new Response(Readable.toWeb(createReadStream(caminho)) as ReadableStream, { status: 200, headers: { ...headers, "Content-Length": String(info.size) } });
}
