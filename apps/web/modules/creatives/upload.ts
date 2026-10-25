"use client";

import { cancelarUpload, concluirUpload, iniciarUpload } from "./actions";

export interface Enviado { id: string; name: string; type: "IMAGE" | "VIDEO" | "MUSIC" | "SFX" | "VOICE" }

/** Duração/dimensões lidas pelo próprio navegador (sem subir o arquivo duas vezes). */
function medir(f: File): Promise<{ durationMs: number | null; width: number | null; height: number | null }> {
  return new Promise((ok) => {
    const url = URL.createObjectURL(f);
    const fim = (r: { durationMs: number | null; width: number | null; height: number | null }) => { URL.revokeObjectURL(url); ok(r); };
    if (f.type.startsWith("image/")) {
      const i = new Image();
      i.onload = () => fim({ durationMs: null, width: i.naturalWidth || null, height: i.naturalHeight || null });
      i.onerror = () => fim({ durationMs: null, width: null, height: null });
      i.src = url;
      return;
    }
    const m = document.createElement(f.type.startsWith("video/") ? "video" : "audio");
    m.preload = "metadata";
    m.onloadedmetadata = () => fim({
      durationMs: Number.isFinite(m.duration) ? Math.round(m.duration * 1000) : null,
      width: (m as HTMLVideoElement).videoWidth || null, height: (m as HTMLVideoElement).videoHeight || null,
    });
    m.onerror = () => fim({ durationMs: null, width: null, height: null });
    m.src = url;
  });
}

/**
 * Envia um arquivo para a biblioteca do workspace: registra, manda o binário (rota local ou URL pré-assinada do R2)
 * e confirma o tamanho. Lança Error com mensagem em português.
 */
export async function enviarArquivo(f: File, extra: { type?: "MUSIC" | "SFX" | "VOICE"; tags?: string[]; license?: string; pastaId?: string | null; onProgresso?: (pct: number) => void } = {}): Promise<Enviado> {
  const type = extra.type ?? (f.type.startsWith("video/") ? "VIDEO" : f.type.startsWith("image/") ? "IMAGE" : null);
  if (!type) throw new Error(`“${f.name}”: envie imagem (PNG, JPG, WEBP, SVG) ou vídeo (MP4, MOV, WEBM)`);
  const m = await medir(f);
  const r = await iniciarUpload({ type, tags: extra.tags ?? (type === "IMAGE" || type === "VIDEO" ? ["asset"] : []), name: f.name, mime: f.type || "application/octet-stream", size: f.size, license: extra.license ?? "", pastaId: extra.pastaId ?? null, ...m });
  if (!r.ok) throw new Error(r.error);
  try {
    // XHR (e não fetch) para ter o progresso do envio
    const status = await new Promise<number>((ok, falha) => {
      const x = new XMLHttpRequest();
      x.open("PUT", r.data.url);
      x.setRequestHeader("Content-Type", f.type);
      x.upload.onprogress = (e) => { if (e.lengthComputable) extra.onProgresso?.(Math.round((e.loaded / e.total) * 100)); };
      x.onload = () => ok(x.status);
      x.onerror = () => falha(new Error("falha de rede no envio"));
      x.send(f);
    });
    if (status < 200 || status >= 300) throw new Error(`o armazenamento recusou (HTTP ${status})`);
  } catch (e) {
    await cancelarUpload(r.data.id);
    throw new Error(`“${f.name}”: ${(e as Error).message}`);
  }
  const ok = await concluirUpload(r.data.id);
  if (!ok.ok) throw new Error(ok.error);
  return { id: r.data.id, name: f.name.replace(/\.[^.]+$/, ""), type };
}
