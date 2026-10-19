import type { Palavra } from "@domus-ads/core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../env";
import { rodar } from "./tools";

/**
 * Transcrição LOCAL (faster-whisper large-v3 na GPU, CUDA 12 + cuDNN 9 instalados no venv) e rostos (OpenCV),
 * num venv só dele (.worker-data/whisper) para não brigar com as dependências do Kokoro.
 * Sem GPU, cai para a CPU (int8): mais lento, mesma qualidade. O modelo (~3 GB) baixa na primeira vez.
 */
const VENV = join(DATA_DIR, "whisper");
const PY = join(VENV, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const MODELOS = join(DATA_DIR, "modelos");

const SCRIPT = String.raw`
import json, os, sys, glob, site
# DLLs do CUDA/cuDNN que vieram pelo pip (nvidia-*-cu12) precisam estar no caminho antes do ctranslate2
for base in site.getsitepackages():
    for d in glob.glob(os.path.join(base, "nvidia", "*", "bin")):
        os.add_dll_directory(d) if hasattr(os, "add_dll_directory") else None
        os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")
args = json.load(open(sys.argv[1], encoding="utf-8"))
out = {"palavras": [], "rostos": [], "dispositivo": ""}

if args.get("audio"):
    from faster_whisper import WhisperModel
    import wave, numpy as np
    # o wav (16 kHz mono, 16 bits) vem do ffmpeg: lido direto, sem o decodificador do PyAV (muda de API entre versões)
    with wave.open(args["audio"], "rb") as wf:
        som = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    modelo = None
    for disp, tipo in (("cuda", "float16"), ("cpu", "int8")):
        try:
            modelo = WhisperModel("large-v3", device=disp, compute_type=tipo, download_root=args["modelos"])
            out["dispositivo"] = disp
            segs, info = modelo.transcribe(som, language="pt", word_timestamps=True, vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 300}, beam_size=5, condition_on_previous_text=False,
                initial_prompt=args.get("glossario") or None)
            for s in segs:
                for w in (s.words or []):
                    t = w.word.strip()
                    if t: out["palavras"].append({"w": t, "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)})
            break
        except Exception as e:
            if disp == "cpu": raise
            sys.stderr.write("GPU indisponivel (%s); usando CPU\n" % e)
            out["palavras"] = []

if args.get("video"):
    import cv2
    cas = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))
    cap = cv2.VideoCapture(args["video"])
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    passo = max(1, int(fps * 0.5))
    for n in range(0, total, passo):
        cap.set(cv2.CAP_PROP_POS_FRAMES, n)
        ok, q = cap.read()
        if not ok: break
        h, w = q.shape[:2]
        k = 480.0 / max(h, w)
        cinza = cv2.cvtColor(cv2.resize(q, (int(w * k), int(h * k))), cv2.COLOR_BGR2GRAY)
        for (x, y, fw, fh) in cas.detectMultiScale(cinza, 1.1, 6, minSize=(int(40 * k * 2), int(40 * k * 2))):
            hk, wk = cinza.shape[:2]
            out["rostos"].append({"t": round(n / fps, 2), "x0": x / wk, "y0": y / hk, "x1": (x + fw) / wk, "y1": (y + fh) / hk})

json.dump(out, open(args["saida"], "w", encoding="utf-8"))
`;

let pronto: Promise<void> | null = null;

/** Primeira transcrição: cria o venv e instala faster-whisper + CUDA + OpenCV (uma vez, alguns minutos). */
export function garantirWhisper(log: (m: string) => Promise<void>): Promise<void> {
  pronto ??= (async () => {
    if (existsSync(PY) && (await rodar(PY, ["-c", "import faster_whisper, cv2"])).code === 0) return;
    await log("preparando a transcrição local (Whisper + CUDA) pela primeira vez: alguns minutos…");
    mkdirSync(DATA_DIR, { recursive: true });
    const base = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
    const v = await rodar(base, ["-m", "venv", VENV], { timeoutMs: 180_000 });
    if (v.code !== 0) throw new Error(`Python não encontrado para a transcrição (${v.err.trim().slice(0, 200)}). Instale o Python 3.10+ ou defina PYTHON_BIN.`);
    const pip = await rodar(PY, ["-m", "pip", "install", "-q", "faster-whisper", "nvidia-cublas-cu12", "nvidia-cudnn-cu12==9.*", "opencv-python-headless<5"], { timeoutMs: 1_800_000 });
    if (pip.code !== 0) throw new Error(`Falha ao instalar o Whisper: ${pip.err.trim().split("\n").at(-1)}`);
  })().catch((e) => { pronto = null; throw e; });
  return pronto;
}

export interface Analise { palavras: (Palavra & { p: number })[]; rostos: { t: number; x0: number; y0: number; x1: number; y1: number }[]; dispositivo: string }

/** Transcreve o áudio (wav 16 kHz) e acha os rostos no vídeo. Glossário (marca, nomes) ajuda a acertar a grafia. */
export async function analisar(o: { pasta: string; audio: string | null; video: string; glossario: string; signal: AbortSignal; log: (m: string) => Promise<void> }): Promise<Analise> {
  await garantirWhisper(o.log);
  mkdirSync(MODELOS, { recursive: true });
  const script = join(o.pasta, "analisar.py"), args = join(o.pasta, "analisar.json"), saida = join(o.pasta, "analise.json");
  writeFileSync(script, SCRIPT, "utf8");
  // tudo por arquivo: nada do usuário vira argumento de linha de comando
  writeFileSync(args, JSON.stringify({ audio: o.audio, video: o.video, glossario: o.glossario.slice(0, 600), modelos: MODELOS, saida }), "utf8");
  const r = await rodar(PY, [script, args], { cwd: o.pasta, timeoutMs: 1_800_000, signal: o.signal });
  if (r.code !== 0 || !existsSync(saida)) throw new Error(`Falha na transcrição: ${(r.err || r.out).trim().split("\n").filter(Boolean).at(-1) ?? r.code}`);
  if (r.err.includes("GPU indisponivel")) await o.log("GPU indisponível: transcrevendo na CPU (mais lento)");
  return JSON.parse(readFileSync(saida, "utf8")) as Analise;
}
