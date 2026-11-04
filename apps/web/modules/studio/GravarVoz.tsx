"use client";

import { MAX_FONTE_S } from "@domus-ads/core/edicao";
import { MAX_VOZ_MB, MAX_VOZ_S } from "@domus-ads/core/video";
import { Check, Loader2, Mic, Pause, Play, RotateCcw, Square, Trash2, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { enviarArquivo } from "../creatives/upload";
import { toast } from "../shell/toast";

export interface VozGravada { id: string | null; url: string; dur: number; pct: number; picos?: number[] }

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const BARRAS = 28;
const N_ONDA = 56;
const MUDO = 2; // pico (0–128) abaixo disso = silêncio digital: microfone mudo ou errado

/** Intensidade do áudio em N_ONDA faixas (RMS normalizado) e o pico geral (0–1). null se o navegador não decodificar. */
async function analisarAudio(dados: Blob): Promise<{ picos: number[]; pico: number } | null> {
  try {
    const ctx = new AudioContext();
    const au = await ctx.decodeAudioData(await dados.arrayBuffer());
    void ctx.close();
    const d = au.getChannelData(0), passo = Math.max(1, Math.floor(d.length / N_ONDA));
    let pico = 0;
    const rms = Array.from({ length: N_ONDA }, (_, i) => {
      let soma = 0, n = 0;
      for (let j = i * passo; j < Math.min(d.length, (i + 1) * passo); j += 8) { const v = d[j]!; soma += v * v; n++; pico = Math.max(pico, Math.abs(v)); }
      return n ? Math.sqrt(soma / n) : 0;
    });
    const max = Math.max(...rms, 1e-6);
    return { picos: rms.map((x) => +Math.max(0.06, (x / max) ** 0.7).toFixed(3)), pico };
  } catch {
    return null;
  }
}

/** Microfone com medidor de nível: gravar(limite, pronto) chama pronto(arquivo, duração) quando parar. */
function useGravador() {
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [seg, setSeg] = useState(0);
  const [niveis, setNiveis] = useState<number[]>([]);
  const [mics, setMics] = useState<{ id: string; nome: string }[]>([]);
  const [mic, setMicSt] = useState("");
  const listarMics = useCallback(async () => {
    try {
      const ds = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput" && d.deviceId);
      setMics(ds.map((d, i) => ({ id: d.deviceId, nome: d.label || `Microfone ${i + 1}` })));
    } catch { /* sem lista */ }
  }, []);
  useEffect(() => {
    try { setMicSt(localStorage.getItem("mic") ?? ""); } catch { /* sem armazenamento */ }
    void listarMics();
  }, [listarMics]);
  const setMic = (id: string) => { setMicSt(id); try { localStorage.setItem("mic", id); } catch { /* sem armazenamento */ } };

  const parar = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    if (r.mr.state !== "inactive") r.mr.stop();
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx.close();
    rec.current = null;
    setGravando(false);
    setNiveis([]);
  }, []);
  useEffect(() => parar, [parar]);

  const gravar = async (limite: number, pronto: (f: File, dur: number) => void) => {
    let stream: MediaStream;
    const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: mic ? { ...base, deviceId: { exact: mic } } : base })
        .catch(() => navigator.mediaDevices.getUserMedia({ audio: base })); // microfone salvo sumiu: usa o padrão
    } catch {
      return toast.err("Sem acesso ao microfone. Libere o microfone para este site no navegador.");
    }
    void listarMics(); // com a permissão dada, os nomes dos microfones aparecem
    let maxPico = 0, avisou = false;
    const tipo = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
    const mr = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    const partes: Blob[] = [];
    mr.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
    // medidor de nível: dá para ver que o microfone está captando antes de gravar à toa
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const t0 = performance.now();
    let quadros = 0;
    const quadro = () => {
      const s = (performance.now() - t0) / 1000;
      if (s >= limite) return parar();
      if (quadros++ % 3 === 0) {
        an.getByteTimeDomainData(buf);
        let pico = 0;
        for (const v of buf) pico = Math.max(pico, Math.abs(v - 128));
        maxPico = Math.max(maxPico, pico);
        if (!avisou && s > 2.5 && maxPico < MUDO) { avisou = true; toast.err("O microfone não está captando nada. Confira se ele está mudo ou escolha outro microfone abaixo."); }
        setNiveis((h) => [...h.slice(1 - BARRAS), Math.min(1, pico / 56)]);
        setSeg(s);
      }
      if (rec.current) rec.current.raf = requestAnimationFrame(quadro);
    };
    mr.onstop = () => {
      const mime = (mr.mimeType || "audio/webm").split(";")[0]!;
      const dur = (performance.now() - t0) / 1000;
      if (dur < 1) return toast.err("Gravação curta demais");
      if (maxPico < MUDO) return toast.err("A gravação ficou muda (o microfone não captou som). Escolha outro microfone e grave de novo.");
      pronto(new File(partes, `minha-voz.${mime.includes("mp4") ? "m4a" : mime.split("/")[1]}`, { type: mime }), dur);
    };
    mr.start(1000);
    rec.current = { mr, stream, ctx, raf: requestAnimationFrame(quadro) };
    setSeg(0);
    setGravando(true);
  };
  return { gravando, seg, niveis, gravar, parar, mics, mic, setMic };
}
type Gravador = ReturnType<typeof useGravador>;

/** Sobe o áudio na hora (criativo VOICE), mostrando o progresso. */
async function subirVoz(arq: File, dur: number, set: (v: VozGravada | null) => void) {
  const an = await analisarAudio(arq);
  if (an && an.pico < 0.002) { toast.err("Esse áudio está sem som. Confira o microfone e grave de novo."); return; }
  const picos = an?.picos;
  const url = URL.createObjectURL(arq);
  set({ id: null, url, dur, pct: 0, picos });
  try {
    const e = await enviarArquivo(arq, { type: "VOICE", onProgresso: (pct) => set({ id: null, url, dur, pct, picos }) });
    set({ id: e.id, url, dur, pct: 100, picos });
  } catch (err) {
    toast.err((err as Error).message);
    URL.revokeObjectURL(url);
    set(null);
  }
}

/** Confere tipo, tamanho e duração do arquivo escolhido; devolve a duração ou null. */
async function lerArquivo(arq: File | undefined, limite: number): Promise<number | null> {
  if (!arq) return null;
  if (!arq.type.startsWith("audio/")) { toast.err("Envie um arquivo de áudio (MP3, WAV, M4A, OGG, WEBM)"); return null; }
  if (arq.size > MAX_VOZ_MB * 1048576) { toast.err(`Áudio acima de ${MAX_VOZ_MB} MB`); return null; }
  const dur = await new Promise<number>((ok) => {
    const a = document.createElement("audio");
    const u = URL.createObjectURL(arq);
    a.preload = "metadata";
    a.onloadedmetadata = () => { URL.revokeObjectURL(u); ok(Number.isFinite(a.duration) ? a.duration : 0); };
    a.onerror = () => { URL.revokeObjectURL(u); ok(0); };
    a.src = u;
  });
  if (dur > limite + 1) { toast.err(`O áudio tem ${mmss(dur)}: envie até ${mmss(limite)}`); return null; }
  return dur;
}

/** Player próprio: play/pause, onda do áudio (clique para pular) e tempo. */
export function PlayerAudio({ src, durDica = 0, picos: dados }: { src: string; durDica?: number; picos?: number[] }) {
  const a = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(durDica);
  const [lidos, setLidos] = useState<number[] | null>(null);
  const picos = dados?.length ? dados : lidos;

  useEffect(() => {
    if (dados?.length) return;
    let vivo = true;
    // sem a onda guardada: tenta ler o arquivo (o R2 sem CORS falha; aí fica a onda neutra)
    void fetch(src).then((r) => r.blob()).then(analisarAudio).then((an) => { if (vivo && an) setLidos(an.picos); }).catch(() => {});
    return () => { vivo = false; };
  }, [src, dados]);

  const pular = (frac: number) => {
    const el = a.current;
    if (!el || !dur) return;
    el.currentTime = Math.min(dur, Math.max(0, frac * dur));
    setT(el.currentTime);
  };
  const barras = picos ?? Array.from({ length: N_ONDA }, (_, i) => 0.18 + 0.5 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11)));
  const feito = dur ? t / dur : 0;

  return (
    <div className="ply" data-onda={picos ? "real" : "neutra"}>
      <audio ref={a} src={src} preload="metadata" onPlay={() => setTocando(true)} onPause={() => setTocando(false)}
        onEnded={() => { setTocando(false); setT(0); }} onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration); }} />
      <button type="button" className="ply-btn" aria-label={tocando ? "Pausar" : "Ouvir"} onClick={() => (tocando ? a.current?.pause() : void a.current?.play())}>
        {tocando ? <Pause aria-hidden /> : <Play aria-hidden />}
      </button>
      <div className="ply-onda" role="slider" tabIndex={0} aria-label="Posição do áudio" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); pular((e.clientX - r.left) / r.width); }}
        onKeyDown={(e) => { if (e.key === "ArrowRight") pular((t + 2) / (dur || 1)); if (e.key === "ArrowLeft") pular((t - 2) / (dur || 1)); }}>
        {barras.map((h, i) => <span key={i} data-on={i / barras.length < feito} style={{ height: `${h * 100}%` }} />)}
      </div>
      <span className="ply-tempo tabular">{mmss(t)}<small> / {mmss(dur)}</small></span>
    </div>
  );
}

/** Escolha do microfone (fica salva neste navegador). Só aparece com mais de um. */
function SeletorMic({ g }: { g: Gravador }) {
  if (g.mics.length < 2) return null;
  return (
    <label className="mic-sel">
      <Mic aria-hidden />
      <select value={g.mics.some((m) => m.id === g.mic) ? g.mic : ""} onChange={(e) => g.setMic(e.target.value)} aria-label="Microfone">
        <option value="">Microfone padrão do sistema</option>
        {g.mics.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
      </select>
    </label>
  );
}

/** Gravando: botão de parar pulsando, cronômetro e as barras do microfone ao vivo. */
function Gravando({ g, limite, dica }: { g: Gravador; limite: number; dica: string }) {
  return (
    <div className="grv" data-gravando="true" role="status">
      <button type="button" className="grv-mic" onClick={g.parar} aria-label="Parar gravação"><Square aria-hidden /></button>
      <div className="grv-info">
        <b className="tabular">{mmss(g.seg)}<small> / {mmss(limite)}</small></b>
        <span className="grv-ondas" aria-hidden>
          {Array.from({ length: BARRAS }, (_, i) => <span key={i} style={{ transform: `scaleY(${Math.max(0.08, g.niveis[i - (BARRAS - g.niveis.length)] ?? 0)})` }} />)}
        </span>
        <span className="subtle caption">{dica}</span>
      </div>
    </div>
  );
}

/**
 * Narração com a voz do cliente de uma vez: grava no navegador ou envia um arquivo.
 * O arquivo sobe na hora (criativo VOICE); o worker transcreve e corta as pausas.
 */
export function GravarVoz({ valor, onChange, dica = "o roteiro sai da sua fala" }: { valor: VozGravada | null; onChange: (v: VozGravada | null) => void; dica?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const g = useGravador();

  if (g.gravando) return <Gravando g={g} limite={MAX_FONTE_S} dica={g.seg > MAX_VOZ_S ? `Passou de ${MAX_VOZ_S / 60} min: só cabe se as pausas cortadas compensarem.` : "Fale naturalmente; pausas e respiros são cortados depois. Toque no quadrado para parar."} />;

  if (valor) return (
    <div className="stack" style={{ gap: 8 }}>
      <PlayerAudio src={valor.url} durDica={valor.dur} picos={valor.picos} />
      <div className="cluster" style={{ gap: 8, justifyContent: "space-between" }}>
        <span className="subtle caption">
          {valor.pct < 100 ? <><Loader2 size={12} className="animate-spin" aria-hidden /> Enviando… {valor.pct}%</> : <><Check size={12} aria-hidden /> Pronto · {dica}</>}
        </span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => { URL.revokeObjectURL(valor.url); onChange(null); }} disabled={valor.pct < 100}>
          <RotateCcw aria-hidden /> Gravar de novo
        </button>
      </div>
    </div>
  );

  const escolher = async (arq: File | undefined) => {
    if (input.current) input.current.value = "";
    const dur = await lerArquivo(arq, MAX_FONTE_S);
    if (dur !== null) await subirVoz(arq!, dur, onChange);
  };
  return (
    <div className="grv" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void escolher(e.dataTransfer.files[0]); }}>
      <input ref={input} type="file" hidden accept="audio/*" onChange={(e) => void escolher(e.target.files?.[0])} />
      <button type="button" className="grv-mic" onClick={() => void g.gravar(MAX_FONTE_S, (f, d) => void subirVoz(f, d, onChange))} aria-label="Começar a gravar"><Mic aria-hidden /></button>
      <div className="grv-info">
        <b>Toque no microfone para gravar</b>
        <span className="subtle caption">Até {MAX_VOZ_S / 60} min de fala. Fale naturalmente; as pausas são cortadas.</span>
        <SeletorMic g={g} />
      </div>
      <button type="button" className="btn btn-ghost btn-xs grv-enviar" onClick={() => input.current?.click()}><UploadCloud aria-hidden /> Enviar arquivo</button>
    </div>
  );
}

const MAX_FALA_S = 90;

/**
 * Narração fala por fala: uma gravação (ou arquivo) por cena, lendo o texto dela. Cada fala apaga e regrava sozinha;
 * o worker trata o som de cada uma (silêncio, ruído, volume) e junta tudo no vídeo.
 */
export function FalaPorFala({ cenas, falas, onChange }: { cenas: { i: number; texto: string }[]; falas: Record<number, VozGravada>; onChange: (i: number, v: VozGravada | null) => void }) {
  const g = useGravador();
  const [qual, setQual] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const alvo = useRef(0);
  const prontas = cenas.filter((c) => falas[c.i]?.id).length;

  const gravar = (i: number) => { setQual(i); void g.gravar(MAX_FALA_S, (f, d) => void subirVoz(f, d, (v) => onChange(i, v))); };
  const escolher = async (arq: File | undefined) => {
    if (input.current) input.current.value = "";
    const i = alvo.current, dur = await lerArquivo(arq, MAX_FALA_S);
    if (dur !== null) await subirVoz(arq!, dur, (v) => onChange(i, v));
  };

  return (
    <div className="falas">
      <input ref={input} type="file" hidden accept="audio/*" onChange={(e) => void escolher(e.target.files?.[0])} />
      <div className="falas-topo">
        <b className="tabular">{prontas} de {cenas.length} falas gravadas</b>
        <span className="falas-barra" aria-hidden><span style={{ width: `${(prontas / Math.max(1, cenas.length)) * 100}%` }} /></span>
      </div>
      <SeletorMic g={g} />
      <ol className="falas-lista">
        {cenas.map((c, n) => {
          const f = falas[c.i];
          const aqui = g.gravando && qual === c.i;
          return (
            <li key={c.i} className="fala" data-estado={aqui ? "gravando" : f?.id ? "ok" : f ? "enviando" : "vazia"}>
              <div className="fala-cab">
                <span className="fala-num">{f?.id && !aqui ? <Check aria-hidden /> : n + 1}</span>
                <small>Cena {c.i + 1}</small>
                {f && !aqui && (
                  <button type="button" className="btn btn-ghost btn-xs fala-apagar" disabled={f.pct < 100} aria-label={`Apagar a fala da cena ${c.i + 1}`} title="Apagar só esta fala"
                    onClick={() => { URL.revokeObjectURL(f.url); onChange(c.i, null); }}><Trash2 aria-hidden /></button>
                )}
              </div>
              <p className="fala-texto">{c.texto}</p>
              {aqui ? <Gravando g={g} limite={MAX_FALA_S} dica="Leia o texto acima. Toque no quadrado quando terminar." />
                : f ? (f.pct < 100
                  ? <span className="subtle caption"><Loader2 size={12} className="animate-spin" aria-hidden /> Enviando… {f.pct}%</span>
                  : <div className="fala-ok"><PlayerAudio src={f.url} durDica={f.dur} picos={f.picos} />
                      <button type="button" className="btn btn-ghost btn-xs" disabled={g.gravando} onClick={() => gravar(c.i)}><RotateCcw aria-hidden /> Regravar</button></div>)
                : (
                  <div className="fala-acoes">
                    <button type="button" className="fala-gravar" disabled={g.gravando} onClick={() => gravar(c.i)}><span><Mic aria-hidden /></span> Gravar esta fala</button>
                    <button type="button" className="btn btn-ghost btn-xs" disabled={g.gravando} onClick={() => { alvo.current = c.i; input.current?.click(); }}><UploadCloud aria-hidden /> Enviar áudio</button>
                  </div>
                )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
