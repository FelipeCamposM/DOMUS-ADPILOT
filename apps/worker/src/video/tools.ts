import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { DATA_DIR } from "../env";

/**
 * Ferramentas do Video Studio, todas locais e dentro do projeto (nada instalado no Windows):
 * FFmpeg/FFprobe via npm, HyperFrames via npm, Kokoro (TTS) num venv Python em .worker-data/py.
 */
const req = createRequire(import.meta.url);
export const FFMPEG = ffmpegPath as unknown as string;
export const FFPROBE = ffprobe.path;
const HYPERFRAMES = join(dirname(req.resolve("hyperframes/package.json")), "bin/hyperframes.mjs");
const VENV = join(DATA_DIR, "py");
const VENV_BIN = join(VENV, process.platform === "win32" ? "Scripts" : "bin");

/** PATH com ffmpeg/ffprobe (o HyperFrames procura no PATH) e o venv do Kokoro na frente. */
function env(): NodeJS.ProcessEnv {
  const sep = process.platform === "win32" ? ";" : ":";
  return {
    ...process.env,
    PATH: [VENV_BIN, dirname(FFMPEG), dirname(FFPROBE), process.env.PATH].join(sep),
    HYPERFRAMES_SKIP_SKILLS: "1",
    NO_COLOR: "1",
  };
}

export interface Saida { code: number | null; out: string; err: string }

/** Roda um processo sem shell (nada de comando montado em string), com timeout e cancelamento. */
export function rodar(bin: string, args: string[], o: { cwd?: string; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<Saida> {
  return new Promise((ok) => {
    const p = spawn(bin, args, { cwd: o.cwd, env: env(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out = (out + d).slice(-200_000); });
    p.stderr.on("data", (d) => { err = (err + d).slice(-50_000); });
    const matar = () => p.kill();
    o.signal?.addEventListener("abort", matar);
    const t = setTimeout(matar, o.timeoutMs ?? 600_000);
    p.on("error", (e) => { clearTimeout(t); ok({ code: null, out, err: err + e.message }); });
    p.on("close", (code) => { clearTimeout(t); o.signal?.removeEventListener("abort", matar); ok({ code, out, err: err.replace(/\x1b\[[0-9;]*m/g, "") }); });
  });
}

export const hyperframes = (args: string[], o: Parameters<typeof rodar>[2] = {}) => rodar(process.execPath, [HYPERFRAMES, ...args], o);
export const ffmpeg = (args: string[], o: Parameters<typeof rodar>[2] = {}) => rodar(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], o);

export async function duracao(arquivo: string): Promise<number> {
  const r = await rodar(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", arquivo]);
  const d = Number(r.out.trim());
  if (!Number.isFinite(d)) throw new Error(`Não consegui medir a duração de ${arquivo}`);
  return d;
}

let kokoroPronto: Promise<void> | null = null;

/** Primeira narração: cria o venv e instala o Kokoro (uma vez, ~1 min). Depois é instantâneo. */
export function garantirKokoro(log: (m: string) => Promise<void>): Promise<void> {
  kokoroPronto ??= (async () => {
    const py = join(VENV_BIN, process.platform === "win32" ? "python.exe" : "python");
    if (existsSync(py) && (await rodar(py, ["-c", "import kokoro_onnx, soundfile"])).code === 0) return;
    await log("preparando a voz local (Kokoro) pela primeira vez…");
    mkdirSync(DATA_DIR, { recursive: true });
    const base = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
    const v = await rodar(base, ["-m", "venv", VENV], { timeoutMs: 180_000 });
    if (v.code !== 0) throw new Error(`Python não encontrado para a voz local (${v.err.trim().slice(0, 200)}). Instale o Python 3.10+ ou defina PYTHON_BIN.`);
    const pip = await rodar(py, ["-m", "pip", "install", "-q", "kokoro-onnx", "soundfile"], { timeoutMs: 900_000 });
    if (pip.code !== 0) throw new Error(`Falha ao instalar o Kokoro: ${pip.err.trim().split("\n").at(-1)}`);
  })().catch((e) => { kokoroPronto = null; throw e; });
  return kokoroPronto;
}
