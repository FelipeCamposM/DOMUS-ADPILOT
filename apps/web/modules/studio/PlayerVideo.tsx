"use client";

import { Maximize, Minimize, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const mmss = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");
const VELOCIDADES = [1, 1.25, 1.5, 2, 0.5];

/**
 * Player do Studio: play grande no centro, barra com progresso (carregado + posição + tempo no hover), volume,
 * velocidade e tela cheia. Clique no vídeo pausa/toca; atalhos: espaço/K, ←/→ (5 s), M, F.
 * Os controles somem sozinhos enquanto toca e voltam ao mexer o mouse.
 */
export function PlayerVideo({ src, poster }: { src: string; poster?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const v = useRef<HTMLVideoElement>(null);
  const sumir = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [tocando, setTocando] = useState(false);
  const [fim, setFim] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [carregado, setCarregado] = useState(0);
  const [mudo, setMudo] = useState(false);
  const [volume, setVolume] = useState(1);
  const [vel, setVel] = useState(1);
  const [cheia, setCheia] = useState(false);
  const [ativo, setAtivo] = useState(true);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);

  useEffect(() => {
    const f = () => setCheia(document.fullscreenElement === caixa.current);
    document.addEventListener("fullscreenchange", f);
    return () => { document.removeEventListener("fullscreenchange", f); clearTimeout(sumir.current); };
  }, []);

  const mexeu = () => {
    setAtivo(true);
    clearTimeout(sumir.current);
    sumir.current = setTimeout(() => { if (!v.current?.paused) setAtivo(false); }, 2200);
  };
  const alternar = () => { const el = v.current; if (!el) return; if (el.paused) void el.play(); else el.pause(); mexeu(); };
  const pular = (s: number) => { const el = v.current; if (el && dur) { el.currentTime = Math.min(dur, Math.max(0, s)); setT(el.currentTime); } };
  const telaCheia = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void caixa.current?.requestFullscreen(); };
  const posicao = (e: React.PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); return { x, t: x * dur }; };

  const teclas = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") { e.preventDefault(); alternar(); }
    else if (k === "arrowright") { e.preventDefault(); pular(t + 5); mexeu(); }
    else if (k === "arrowleft") { e.preventDefault(); pular(t - 5); mexeu(); }
    else if (k === "m") { if (v.current) v.current.muted = !v.current.muted; }
    else if (k === "f") telaCheia();
  };

  const pct = dur ? (t / dur) * 100 : 0;
  return (
    <div ref={caixa} className="vp surge" data-ativo={ativo || !tocando} data-tocando={tocando} tabIndex={0} onKeyDown={teclas}
      onPointerMove={mexeu} onPointerLeave={() => tocando && setAtivo(false)} aria-label="Player de vídeo">
      <video ref={v} src={src} poster={poster} playsInline preload="metadata" onClick={alternar} onDoubleClick={telaCheia}
        onPlay={() => { setTocando(true); setFim(false); mexeu(); }} onPause={() => { setTocando(false); setAtivo(true); }} onEnded={() => setFim(true)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onProgress={(e) => { const b = e.currentTarget.buffered; if (b.length && dur) setCarregado((b.end(b.length - 1) / dur) * 100); }}
        onVolumeChange={(e) => { setMudo(e.currentTarget.muted); setVolume(e.currentTarget.volume); }} />

      {!tocando && (
        <button type="button" className="vp-grande" onClick={alternar} aria-label={fim ? "Ver de novo" : "Tocar"}>
          {fim ? <RotateCcw aria-hidden /> : <Play aria-hidden />}
        </button>
      )}

      <div className="vp-barra">
        <div className="vp-trilho" role="slider" tabIndex={0} aria-label="Posição do vídeo" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)} aria-valuetext={`${mmss(t)} de ${mmss(dur)}`}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pular(posicao(e).t); }}
          onPointerMove={(e) => { const p = posicao(e); setHover(p); if (e.buttons === 1) pular(p.t); }} onPointerLeave={() => setHover(null)}>
          <span className="vp-carregado" style={{ width: `${carregado}%` }} />
          <span className="vp-feito" style={{ width: `${pct}%` }} />
          <span className="vp-cabeca" style={{ left: `${pct}%` }} />
          {hover && <span className="vp-dica tabular" style={{ left: `${hover.x * 100}%` }}>{mmss(hover.t)}</span>}
        </div>
        <div className="vp-linha">
          <button type="button" className="vp-btn" onClick={alternar} aria-label={tocando ? "Pausar" : "Tocar"}>{tocando ? <Pause aria-hidden /> : <Play aria-hidden />}</button>
          <div className="vp-vol">
            <button type="button" className="vp-btn" onClick={() => { if (v.current) v.current.muted = !v.current.muted; }} aria-label={mudo ? "Ativar som" : "Tirar som"}>
              {mudo || volume === 0 ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={mudo ? 0 : volume} aria-label="Volume" style={{ ["--v" as string]: `${(mudo ? 0 : volume) * 100}%` }}
              onChange={(e) => { const el = v.current; if (!el) return; el.volume = Number(e.target.value); el.muted = el.volume === 0; }} />
          </div>
          <span className="vp-tempo tabular">{mmss(t)}<small> / {mmss(dur)}</small></span>
          <span style={{ flex: 1 }} />
          <button type="button" className="vp-btn vp-vel" aria-label="Velocidade" title="Velocidade"
            onClick={() => { const n = VELOCIDADES[(VELOCIDADES.indexOf(vel) + 1) % VELOCIDADES.length]!; setVel(n); if (v.current) v.current.playbackRate = n; }}>
            {String(vel).replace(".", ",")}×
          </button>
          <button type="button" className="vp-btn" onClick={telaCheia} aria-label={cheia ? "Sair da tela cheia" : "Tela cheia"}>{cheia ? <Minimize aria-hidden /> : <Maximize aria-hidden />}</button>
        </div>
      </div>
    </div>
  );
}
