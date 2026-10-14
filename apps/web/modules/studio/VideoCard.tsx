"use client";

import { ClipboardCheck, Film, GalleryHorizontalEnd, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

const RODANDO: Record<string, string> = { REVIEW: "Esperando aprovação", NEW: "Novo", QUEUED: "Na fila", SCRIPTING: "Roteiro", VOICE: "Narração", COMPOSING: "Animação", RENDERING: "Render", MIXING: "Mixagem", UPLOADING: "Enviando" };

/** Cartão de vídeo: miniatura que vira prévia em movimento (sem som) ao passar o mouse. */
export function VideoCard({ href, creativeId, thumb, titulo, sub, status, progress, formato, kind = "video", slides }: {
  href: string; creativeId: string | null; thumb: boolean; titulo: string; sub: string; status: string; progress: number | null; formato: string; kind?: "video" | "image";
  /** carrossel: ids dos slides em ordem (o cartão vira uma pilha com selo e faixa de miniaturas) */
  slides?: string[];
}) {
  const vid = useRef<HTMLVideoElement>(null);
  const pronto = status === "READY" && creativeId;
  const carrossel = !!slides && slides.length > 1;
  const ratio = formato === "16:9" ? "16/9" : formato === "1:1" ? "1/1" : formato === "4:5" ? "4/5" : formato === "1.91:1" ? "1200/628" : "9/16";
  return (
    <Link href={href} className={`panel spotlight${carrossel ? " card-carrossel" : ""}`} data-enter="scale" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8 }}
      onMouseEnter={() => { if (vid.current) { vid.current.currentTime = 0; void vid.current.play().catch(() => {}); } }}
      onMouseLeave={() => vid.current?.pause()}>
      <div className={carrossel ? "pilha" : undefined} style={{ position: "relative" }}>
      <div className="thumb-card" style={{ aspectRatio: ratio, maxHeight: 340, width: "100%" }}>
        {pronto && kind === "image" ? (
          <>
            <img src={`/api/creatives/${creativeId}/file`} alt="" loading="lazy" />
            {carrossel && <span className="carrossel-selo"><GalleryHorizontalEnd size={15} aria-hidden /> Carrossel · {slides!.length}</span>}
          </>
        ) : pronto ? (
          <video ref={vid} src={`/api/creatives/${creativeId}/file`} poster={thumb ? `/api/creatives/${creativeId}/file?kind=thumb` : undefined} muted loop playsInline preload="none" />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", alignContent: "center", gap: 10, padding: 16, textAlign: "center" }}>
            {status === "FAILED" ? <TriangleAlert size={26} aria-hidden style={{ color: "rgb(var(--c-error))" }} /> : status === "REVIEW" ? <ClipboardCheck size={26} aria-hidden style={{ color: "rgb(var(--c-glow))", filter: "drop-shadow(0 0 8px rgb(var(--c-brand)))" }} /> : status === "READY" ? <Film size={26} aria-hidden /> : <Loader2 size={26} className="animate-spin" aria-hidden style={{ color: "rgb(var(--c-glow))", filter: "drop-shadow(0 0 8px rgb(var(--c-brand)))" }} />}
            <span className="small">{status === "FAILED" ? "Falhou" : RODANDO[status] ?? status}</span>
            {progress != null && status !== "FAILED" && status !== "REVIEW" && <div className="bar" style={{ width: "70%" }}><i style={{ width: `${progress}%`, background: "var(--gradient-btn)" }} /></div>}
          </div>
        )}
      </div>
      </div>
      {carrossel && (
        <div className="carrossel-faixa" aria-label={`${slides!.length} slides`}>
          {slides!.slice(0, 5).map((id, i) => (
            <span key={id}><img src={`/api/creatives/${id}/file`} alt="" loading="lazy" />{i === 4 && slides!.length > 5 && <b>+{slides!.length - 5}</b>}</span>
          ))}
        </div>
      )}
      <div style={{ padding: "0 4px 4px", minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</div>
        <div className="subtle" style={{ fontSize: 11.5 }}>{sub}</div>
      </div>
    </Link>
  );
}
