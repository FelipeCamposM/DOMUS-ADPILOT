"use client";

import { Grid3x3, ImageIcon, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BibliotecaModal } from "../arquivos/Biblioteca";
import { arquivo } from "./Mockups";

const QUADROS = 8;
const seg = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

/**
 * Capa do Reels: automática (o quadro em que o título do vídeo já está inteiro, marcado pelo Studio), um quadro escolhido
 * numa tira de miniaturas (com ajuste fino), ou uma imagem da biblioteca. A prévia mostra também o recorte 3:4 que a grade
 * do perfil usa, para o título não ficar cortado lá.
 */
export function CapaReels({ video, capaMs, capaId, onChange, travado }: {
  video: { id: string; duration_ms: number | null }; capaMs?: number; capaId?: string; travado: boolean;
  onChange: (c: { capaMs?: number; capaId?: string }) => void;
}) {
  const dur = video.duration_ms ?? 0;
  const tempos = Array.from({ length: QUADROS }, (_, i) => Math.round(((i + 0.5) / QUADROS) * dur));
  const fonte = useRef<HTMLVideoElement>(null);
  const telas = useRef<(HTMLCanvasElement | null)[]>([]);
  const [prontos, setProntos] = useState(0);
  const [grade, setGrade] = useState(true);
  const [lib, setLib] = useState(false);
  const previa = useRef<HTMLVideoElement>(null);

  // tira de quadros: um vídeo escondido vai de quadro em quadro e desenha cada um (só exibição)
  useEffect(() => {
    const v = fonte.current;
    if (!v || !dur) return;
    let i = 0, vivo = true;
    const desenhar = () => {
      const c = telas.current[i];
      if (c && v.videoWidth) { c.width = 90; c.height = Math.round((90 * v.videoHeight) / v.videoWidth); c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height); }
      i++; setProntos(i);
      if (vivo && i < QUADROS) v.currentTime = tempos[i]! / 1000;
    };
    const comecar = () => { v.currentTime = tempos[0]! / 1000; };
    v.addEventListener("seeked", desenhar);
    v.addEventListener("loadedmetadata", comecar, { once: true });
    return () => { vivo = false; v.removeEventListener("seeked", desenhar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, dur]);

  // prévia grande: o próprio vídeo parado no quadro escolhido
  useEffect(() => { if (previa.current && capaMs != null) previa.current.currentTime = capaMs / 1000; }, [capaMs]);

  const modo = capaId ? "imagem" : capaMs != null ? "quadro" : "auto";
  return (
    <div className="capa-reels">
      <video ref={fonte} src={arquivo(video.id)} muted playsInline preload="auto" hidden />
      <div className="capa-previa" aria-label="Prévia da capa">
        {modo === "imagem" ? <img src={arquivo(capaId!)} alt="Capa escolhida" />
          : modo === "quadro" ? <video ref={previa} src={`${arquivo(video.id)}#t=${capaMs! / 1000}`} muted playsInline preload="auto" />
          : <img src={arquivo(video.id, true)} alt="Capa automática" />}
        {grade && <span className="capa-grade" aria-hidden><i>grade do perfil</i></span>}
      </div>
      <div className="capa-lado">
        <div className="cluster" style={{ gap: 6 }}>
          <span className="label" style={{ margin: 0 }}>Capa</span>
          <span className="badge badge-brand">{modo === "imagem" ? "Imagem" : modo === "quadro" ? `Quadro em ${seg(capaMs!)}` : "Automática"}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost btn-xs" aria-pressed={grade} onClick={() => setGrade((g) => !g)} title="Mostra o recorte 3:4 da grade do perfil"><Grid3x3 aria-hidden /> Recorte da grade</button>
        </div>
        <div className="capa-tira" role="listbox" aria-label="Escolha um quadro do vídeo">
          {tempos.map((t, i) => (
            <button key={t} type="button" role="option" aria-selected={modo === "quadro" && Math.abs((capaMs ?? -1e9) - t) < dur / QUADROS / 2} disabled={travado}
              onClick={() => onChange({ capaMs: t })} title={`Quadro em ${seg(t)}`}>
              <canvas ref={(c) => { telas.current[i] = c; }} data-pronto={i < prontos} />
              <span>{seg(t)}</span>
            </button>
          ))}
        </div>
        {modo === "quadro" && (
          <input type="range" aria-label="Ajuste fino do quadro da capa" min={0} max={dur} step={100} value={capaMs} disabled={travado} onChange={(e) => onChange({ capaMs: Number(e.target.value) })} />
        )}
        <div className="cluster" style={{ gap: 6 }}>
          <button type="button" className="btn btn-secondary btn-xs" disabled={travado || modo === "auto"} onClick={() => onChange({})}><Sparkles aria-hidden /> Automática</button>
          <button type="button" className="btn btn-secondary btn-xs" disabled={travado} onClick={() => setLib(true)}><ImageIcon aria-hidden /> Usar uma imagem</button>
          {modo === "imagem" && <button type="button" className="btn btn-ghost btn-xs" disabled={travado} onClick={() => onChange({})}><X aria-hidden /> Tirar imagem</button>}
        </div>
        <p className="subtle caption">Automática: o quadro em que o título do vídeo já apareceu inteiro. Na grade do perfil o Instagram mostra só o miolo (3:4): deixe o texto dentro da moldura.</p>
      </div>
      <BibliotecaModal open={lib} onClose={() => setLib(false)} titulo="Imagem para a capa (fica 9:16)" max={1} tipos={["IMAGE"]} podeEditar onEscolher={(i) => { const x = i[0]; if (x) onChange({ capaId: x.id }); }} />
    </div>
  );
}
