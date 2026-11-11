"use client";

import { Check, ChevronLeft, ChevronRight, ClipboardCheck, Download, ExternalLink, Film, GalleryHorizontalEnd, Loader2, PenSquare, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Dialog } from "../shell/Dialog";
import { useMarcavel } from "../shell/Selecao";

const RODANDO: Record<string, string> = { REVIEW: "Esperando aprovação", NEW: "Novo", QUEUED: "Na fila", SCRIPTING: "Roteiro", VOICE: "Narração", COMPOSING: "Animação", RENDERING: "Render", MIXING: "Mixagem", UPLOADING: "Enviando" };

/** Cartão de vídeo: miniatura que vira prévia em movimento (sem som) ao passar o mouse. */
export function VideoCard({ href, creativeId, thumb, titulo, sub, status, progress, formato, kind = "video", slides, chave }: {
  href: string; creativeId: string | null; thumb: boolean; titulo: string; sub: string; status: string; progress: number | null; formato: string; kind?: "video" | "image";
  /** carrossel: ids dos slides em ordem (o cartão vira uma pilha com selo e faixa de miniaturas) */
  slides?: string[];
  /** dentro de <Selecao>: chave do cartão para marcar e apagar em lote */
  chave?: string;
}) {
  const vid = useRef<HTMLVideoElement>(null);
  const [vendo, setVendo] = useState(false);
  const pronto = status === "READY" && creativeId;
  const carrossel = !!slides && slides.length > 1;
  const capa = !creativeId || status !== "READY" ? undefined : kind === "image" ? `/api/creatives/${creativeId}/file` : thumb ? `/api/creatives/${creativeId}/file?kind=thumb` : undefined;
  const m = useMarcavel(chave, { titulo, capa });
  const ratio = formato === "16:9" ? "16/9" : formato === "1:1" ? "1/1" : formato === "4:5" ? "4/5" : formato === "1.91:1" ? "1200/628" : "9/16";
  return (
    <>
    <Link href={href} className={`panel spotlight${carrossel ? " card-carrossel" : ""}`} data-enter="scale" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8 }}
      data-selecionado={m?.marcado || undefined} data-apagando={m?.apagando || undefined} aria-busy={m?.apagando || undefined} onContextMenu={m?.onContextMenu}
      // clique normal abre a arte/vídeo num modal; Ctrl/⌘/botão do meio seguem o link (nova aba). Sem arquivo pronto, abre o projeto.
      onClick={(e) => { if (pronto && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); setVendo(true); } }}
      onMouseEnter={() => { if (vid.current) { vid.current.currentTime = 0; void vid.current.play().catch(() => {}); } }}
      onMouseLeave={() => vid.current?.pause()}>
      {m?.caixa}
      {m?.apagando && <span className="card-apagando"><Loader2 className="animate-spin" aria-hidden />Apagando…</span>}
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
    {vendo && pronto && (
      <Previa titulo={titulo} sub={sub} kind={kind} ids={carrossel ? slides! : [creativeId]} href={href} onClose={() => setVendo(false)}
        marcado={m?.marcado} onMarcar={m ? () => { m.alternar(); setVendo(false); } : undefined} />
    )}
    </>
  );
}

/** A arte ou o vídeo em tamanho grande, sem sair da grade. Carrossel passa slide a slide. */
function Previa({ titulo, sub, kind, ids, href, onClose, marcado, onMarcar }: {
  titulo: string; sub: string; kind: "video" | "image"; ids: string[]; href: string; onClose: () => void; marcado?: boolean; onMarcar?: () => void;
}) {
  const [i, setI] = useState(0);
  const id = ids[i]!;
  const url = `/api/creatives/${id}/file`;
  const ir = (d: number) => setI((x) => (x + d + ids.length) % ids.length);
  return (
    <Dialog open onClose={onClose} title={titulo} largo>
      <div className="vc-previa" onKeyDown={(e) => { if (ids.length > 1 && e.key === "ArrowRight") ir(1); if (ids.length > 1 && e.key === "ArrowLeft") ir(-1); }}>
        <div className="vc-previa-midia">
          {kind === "image" ? <img src={url} alt={ids.length > 1 ? `${titulo}, slide ${i + 1} de ${ids.length}` : titulo} /> : <video src={url} controls autoPlay playsInline />}
          {ids.length > 1 && (
            <>
              <button type="button" className="vc-previa-seta" data-lado="esq" aria-label="Slide anterior" onClick={() => ir(-1)}><ChevronLeft aria-hidden /></button>
              <button type="button" className="vc-previa-seta" data-lado="dir" aria-label="Próximo slide" onClick={() => ir(1)}><ChevronRight aria-hidden /></button>
              <span className="vc-previa-n tabular">{i + 1}/{ids.length}</span>
            </>
          )}
        </div>
        {ids.length > 1 && (
          <div className="vc-previa-faixa" role="tablist" aria-label="Slides">
            {ids.map((s, k) => <button key={s} type="button" role="tab" aria-selected={k === i} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)}><img src={`/api/creatives/${s}/file`} alt="" loading="lazy" /></button>)}
          </div>
        )}
        <div className="vc-previa-pe">
          <span className="subtle small">{sub}</span>
          <span className="cluster" style={{ gap: 6 }}>
            {onMarcar && <button type="button" className="btn btn-ghost btn-sm" onClick={onMarcar}><Check aria-hidden />{marcado ? "Desmarcar" : "Selecionar"}</button>}
            <a className="btn btn-ghost btn-sm" href={`${url}?download=1`} download><Download aria-hidden />Baixar</a>
            {href.startsWith("/studio/")
              ? <Link className="btn btn-primary btn-sm" href={href}><PenSquare aria-hidden />Abrir no Studio</Link>
              : <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden />Abrir arquivo</a>}
          </span>
        </div>
      </div>
    </Dialog>
  );
}
