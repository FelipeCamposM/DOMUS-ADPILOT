"use client";

import { Film, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "../shell/toast";
import { apagarCriativo } from "./actions";
import { enviarArquivo } from "./upload";

export interface ArquivoItem { id: string; name: string; type: string; width: number | null; height: number | null; size_bytes: string | null }

/** Arquivos do workspace (logo, prints, fotos, vídeos do produto) para anexar no Studio ou usar como logo da marca. */
export function AssetsLibrary({ itens, podeEditar }: { itens: ArquivoItem[]; podeEditar: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [pend, start] = useTransition();

  const enviar = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      setEnviando(f.name);
      try { await enviarArquivo(f); toast.ok(`“${f.name}” enviado`); } catch (e) { toast.err((e as Error).message); }
    }
    setEnviando(null);
    if (input.current) input.current.value = "";
    router.refresh();
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      {podeEditar && (
        <div className="panel" data-enter style={{ padding: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <input ref={input} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,video/quicktime" onChange={(e) => void enviar(e.target.files)} />
          <button className="btn btn-primary btn-sm" onClick={() => input.current?.click()} disabled={!!enviando}>
            {enviando ? <><Loader2 className="animate-spin" aria-hidden /> {enviando.slice(0, 24)}</> : <><ImagePlus aria-hidden /> Enviar arquivos</>}
          </button>
          <span className="subtle caption" style={{ flex: 1 }}>Logo, prints do sistema, fotos e vídeos do produto. Imagem até 25 MB, vídeo até 300 MB. Ficam no PC e podem ser anexados em qualquer vídeo ou imagem do Studio.</span>
        </div>
      )}
      {itens.length === 0 ? (
        <div className="panel"><div className="empty" style={{ padding: 28 }}>Nenhum arquivo ainda.</div></div>
      ) : (
        <div className="studio-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
          {itens.map((a) => (
            <div key={a.id} className="panel spotlight" data-enter="scale" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <a href={`/api/creatives/${a.id}/file`} target="_blank" rel="noopener noreferrer" className="thumb-card" style={{ aspectRatio: "1" }}>
                {a.type === "IMAGE" ? <img src={`/api/creatives/${a.id}/file`} alt={a.name} loading="lazy" style={{ objectFit: "contain" }} />
                  : <video src={`/api/creatives/${a.id}/file`} muted playsInline preload="metadata" />}
              </a>
              <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                {a.type === "VIDEO" && <Film size={13} aria-hidden />}
                <span className="small" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.name}>{a.name}</span>
                {podeEditar && <button className="btn btn-ghost btn-xs" aria-label={`Apagar ${a.name}`} disabled={pend} onClick={() => confirm(`Apagar “${a.name}”? Projetos que já usaram continuam como estão.`) && start(async () => {
                  const r = await apagarCriativo(a.id);
                  if (r.ok) toast.ok("Apagado"); else toast.err(r.error);
                  router.refresh();
                })}><Trash2 aria-hidden /></button>}
              </div>
              <span className="subtle" style={{ fontSize: 11 }}>{[a.width && `${a.width}×${a.height}`, a.size_bytes && `${(Number(a.size_bytes) / 1048576).toFixed(1).replace(".", ",")} MB`].filter(Boolean).join(" · ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
