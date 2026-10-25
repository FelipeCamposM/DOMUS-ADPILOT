import { caminhoLocal, r2Presign } from "@domus-ads/core";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";

const TIPOS: Record<string, string> = { mp4: "video/mp4", jpg: "image/jpeg", png: "image/png", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", flac: "audio/flac", webp: "image/webp", pdf: "application/pdf" };

/**
 * Entrega um arquivo do armazenamento (já autorizado por quem chama). R2: redireciona para URL pré-assinada (1 h).
 * PC (storage local): lê do disco com Range (o player avança sem baixar tudo) e ETag pela chave.
 */
export async function servirArquivo(req: NextRequest, a: { storage: string; key: string; mime: string | null; download?: string }): Promise<Response> {
  if (a.storage !== "local") {
    return NextResponse.redirect(await r2Presign(a.key, "GET", 3600, a.download), { status: 302, headers: { "Cache-Control": "private, no-cache" } });
  }
  if (!process.env.MEDIA_DIR) {
    return NextResponse.json({ error: "MEDIA_DIR não está carregado neste servidor: reinicie o pnpm dev (o .env só é lido ao iniciar)" }, { status: 503 });
  }
  const caminho = caminhoLocal(a.key);
  const info = await stat(caminho).catch(() => null);
  if (!info) return NextResponse.json({ error: "O arquivo não está no disco deste PC (MEDIA_DIR)" }, { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": a.mime ?? TIPOS[a.key.split(".").pop()!.toLowerCase()] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    // a chave muda quando o arquivo é refeito: o navegador revalida e só baixa de novo se mudou
    "Cache-Control": "private, no-cache",
    ETag: `"${a.key.split("/").pop()}"`,
  };
  if (req.headers.get("if-none-match") === headers.ETag) return new Response(null, { status: 304, headers });
  if (a.download) headers["Content-Disposition"] = `attachment; filename="${a.download}"`;

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
