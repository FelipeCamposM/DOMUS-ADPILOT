"use client";

import { MAX_FONTE_S } from "@domus-ads/core/edicao";
import { MAX_VOZ_MB, MAX_VOZ_S } from "@domus-ads/core/video";
import { Loader2, Mic, RotateCcw, Square, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { enviarArquivo } from "../creatives/upload";
import { toast } from "../shell/toast";

export interface VozGravada { id: string | null; url: string; dur: number; pct: number }

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Narração com a voz do cliente: grava no navegador (com medidor de nível) ou envia um arquivo de áudio.
 * O arquivo sobe na hora (criativo VOICE); o worker transcreve, corta as pausas e escreve o roteiro em cima da fala.
 */
export function GravarVoz({ valor, onChange }: { valor: VozGravada | null; onChange: (v: VozGravada | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number; t0: number } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [seg, setSeg] = useState(0);
  const [nivel, setNivel] = useState(0);

  const parar = () => {
    const r = rec.current;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    if (r.mr.state !== "inactive") r.mr.stop();
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx.close();
    rec.current = null;
    setGravando(false);
    setNivel(0);
  };
  useEffect(() => parar, []);

  const subir = async (arq: File, dur: number) => {
    if (valor) URL.revokeObjectURL(valor.url);
    const url = URL.createObjectURL(arq);
    onChange({ id: null, url, dur, pct: 0 });
    try {
      const e = await enviarArquivo(arq, { type: "VOICE", onProgresso: (pct) => onChange({ id: null, url, dur, pct }) });
      onChange({ id: e.id, url, dur, pct: 100 });
    } catch (err) {
      toast.err((err as Error).message);
      onChange(null);
    }
  };

  const gravar = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      return toast.err("Sem acesso ao microfone. Libere o microfone para este site no navegador.");
    }
    const tipo = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
    const mr = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    const partes: Blob[] = [];
    mr.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
    // medidor de nível: o cliente vê que o microfone está captando antes de gravar 2 minutos à toa
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const t0 = performance.now();
    const quadro = () => {
      an.getByteTimeDomainData(buf);
      let pico = 0;
      for (const v of buf) pico = Math.max(pico, Math.abs(v - 128));
      setNivel(Math.min(1, pico / 64));
      const s = (performance.now() - t0) / 1000;
      setSeg(s);
      if (s >= MAX_FONTE_S) return parar();
      if (rec.current) rec.current.raf = requestAnimationFrame(quadro);
    };
    mr.onstop = () => {
      const mime = (mr.mimeType || "audio/webm").split(";")[0]!;
      const dur = (performance.now() - t0) / 1000;
      if (dur < 2) return toast.err("Gravação curta demais");
      void subir(new File(partes, `minha-voz.${mime.includes("mp4") ? "m4a" : mime.split("/")[1]}`, { type: mime }), dur);
    };
    mr.start(1000);
    rec.current = { mr, stream, ctx, raf: requestAnimationFrame(quadro), t0 };
    setSeg(0);
    setGravando(true);
  };

  const escolher = async (arq: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!arq) return;
    if (!arq.type.startsWith("audio/")) return toast.err("Envie um arquivo de áudio (MP3, WAV, M4A, OGG, WEBM)");
    if (arq.size > MAX_VOZ_MB * 1048576) return toast.err(`Áudio acima de ${MAX_VOZ_MB} MB`);
    const dur = await new Promise<number>((ok) => {
      const a = document.createElement("audio");
      const u = URL.createObjectURL(arq);
      a.preload = "metadata";
      a.onloadedmetadata = () => { URL.revokeObjectURL(u); ok(Number.isFinite(a.duration) ? a.duration : 0); };
      a.onerror = () => { URL.revokeObjectURL(u); ok(0); };
      a.src = u;
    });
    if (dur > MAX_FONTE_S + 1) return toast.err(`O áudio tem ${mmss(dur)}: envie até ${MAX_FONTE_S / 60} minutos`);
    await subir(arq, dur);
  };

  if (gravando) return (
    <div className="voz-gravando" role="status">
      <span className="voz-ponto" aria-hidden />
      <b className="tabular" style={{ fontSize: 20 }}>{mmss(seg)}</b>
      <span className="voz-nivel" aria-label="Nível do microfone"><span style={{ transform: `scaleX(${Math.max(0.03, nivel)})` }} /></span>
      <button type="button" className="btn btn-primary btn-sm" onClick={parar}><Square aria-hidden /> Parar</button>
      <span className="subtle caption" style={{ gridColumn: "1 / -1" }}>
        {seg > MAX_VOZ_S ? `Passou de ${MAX_VOZ_S / 60} min: só cabe se as pausas cortadas compensarem.` : "Fale naturalmente; as pausas e respiros são cortados depois."}
      </span>
    </div>
  );

  if (valor) return (
    <div className="stack" style={{ gap: 8 }}>
      <audio controls src={valor.url} style={{ width: "100%", height: 36 }} />
      <div className="cluster" style={{ gap: 8, justifyContent: "space-between" }}>
        <span className="subtle caption">
          {valor.pct < 100 ? <><Loader2 size={12} className="animate-spin" aria-hidden /> Enviando… {valor.pct}%</> : `Pronto${valor.dur ? ` · ${mmss(valor.dur)}` : ""} · o roteiro sai da sua fala`}
        </span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => { URL.revokeObjectURL(valor.url); onChange(null); }} disabled={valor.pct < 100}>
          <RotateCcw aria-hidden /> Gravar ou enviar de novo
        </button>
      </div>
    </div>
  );

  return (
    <div className="kpis" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <input ref={input} type="file" hidden accept="audio/*" onChange={(e) => void escolher(e.target.files?.[0])} />
      <button type="button" className="solta-quadro" onClick={() => void gravar()}>
        <span className="solta-quadro-icone"><Mic size={22} aria-hidden /></span>
        <b style={{ fontWeight: 650 }}>Gravar agora</b>
        <span className="subtle caption">pelo microfone</span>
      </button>
      <button type="button" className="solta-quadro" onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void escolher(e.dataTransfer.files[0]); }}>
        <span className="solta-quadro-icone"><UploadCloud size={22} aria-hidden /></span>
        <b style={{ fontWeight: 650 }}>Enviar áudio</b>
        <span className="subtle caption">MP3, WAV, M4A · até {MAX_VOZ_S / 60} min de fala</span>
      </button>
    </div>
  );
}
