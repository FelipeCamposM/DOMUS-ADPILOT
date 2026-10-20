import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { caminhoDrive, caminhoLocal, db, lerArquivo, SFX_CATEGORIAS, type MUSICA_TAGS } from "@domus-ads/core";
import { DATA_DIR } from "../env";
import { gerarAudio } from "./audio-ia";
import { ffmpeg } from "./tools";

type Sfx = (typeof SFX_CATEGORIAS)[number];

/**
 * Efeitos padrão sintetizados com FFmpeg (sem direitos autorais de terceiros). Se o workspace tiver efeitos enviados
 * na biblioteca com a mesma tag, eles têm prioridade.
 */
const RECEITAS: Record<Sfx, string> = {
  whoosh: "anoisesrc=d=0.7:c=pink:a=0.6,bandpass=f=1200:w=1800,afade=t=in:d=0.35,afade=t=out:st=0.35:d=0.35",
  transition: "anoisesrc=d=1.0:c=pink:a=0.5,lowpass=f=3000,afade=t=in:d=0.5,afade=t=out:st=0.5:d=0.5",
  impact: "sine=f=48:d=0.9,volume=2.2,afade=t=out:st=0.05:d=0.85[a];anoisesrc=d=0.25:c=brown:a=0.8,afade=t=out:d=0.25[b];[a][b]amix=inputs=2:normalize=0",
  bass: "sine=f=42:d=1.2,volume=2.5,afade=t=in:d=0.05,afade=t=out:st=0.2:d=1.0",
  pop: "sine=f=880:d=0.09,afade=t=out:st=0.02:d=0.07,volume=0.9",
  click: "sine=f=2400:d=0.025,afade=t=out:d=0.025,volume=0.8",
  interface: "sine=f=1320:d=0.07,afade=t=out:st=0.02:d=0.05,volume=0.7",
  notification: "sine=f=880:d=0.14,afade=t=out:st=0.06:d=0.08[a];sine=f=1320:d=0.22,afade=t=out:st=0.1:d=0.12,adelay=130[b];[a][b]amix=inputs=2:normalize=0",
  success: "sine=f=523:d=0.16,afade=t=out:st=0.08:d=0.08[a];sine=f=659:d=0.16,afade=t=out:st=0.08:d=0.08,adelay=110[b];sine=f=784:d=0.35,afade=t=out:st=0.1:d=0.25,adelay=220[c];[a][b][c]amix=inputs=3:normalize=0",
  typing: "sine=f=2200:d=0.02,afade=t=out:d=0.02,apad=pad_dur=0.07,aloop=loop=7:size=4320,volume=0.6",
  paper: "anoisesrc=d=0.18:c=white:a=0.5,highpass=f=1500,afade=t=out:st=0.03:d=0.15[a];sine=f=180:d=0.06,afade=t=out:d=0.06,volume=0.8[b];[a][b]amix=inputs=2:normalize=0",
};

const PADRAO_DIR = join(DATA_DIR, "sfx");

async function padrao(cat: Sfx): Promise<string> {
  const f = join(PADRAO_DIR, `${cat}.wav`);
  if (existsSync(f)) return f;
  mkdirSync(PADRAO_DIR, { recursive: true });
  const r = await ffmpeg(["-f", "lavfi", "-i", RECEITAS[cat], "-ar", "48000", "-ac", "2", f]);
  if (r.code !== 0) throw new Error(`Não consegui gerar o efeito ${cat}: ${r.err.slice(0, 200)}`);
  return f;
}

/** Áudio da biblioteca: no PC (ou arquivado no Drive) é usado direto do disco; no R2 é baixado para a pasta do job. */
async function obter(c: { storage: string; r2_key: string; arquivado: boolean }, destino: string): Promise<string> {
  if (c.arquivado) return caminhoDrive(c.r2_key);
  if (c.storage === "local") return caminhoLocal(c.r2_key);
  if (existsSync(destino)) return destino;
  const { writeFile } = await import("node:fs/promises");
  await writeFile(destino, await lerArquivo(c));
  return destino;
}

// uma geração por vez de cada áudio que falta (vários efeitos iguais no mesmo vídeo não geram vários arquivos)
const gerando = new Map<string, Promise<string | null>>();
function gerarUmaVez(chave: string, fn: () => Promise<string>): Promise<string | null> {
  if (!gerando.has(chave)) gerando.set(chave, fn().catch((e: Error) => { console.error(`ElevenLabs (${chave}): ${e.message}`); return null; }).finally(() => setTimeout(() => gerando.delete(chave), 60_000)));
  return gerando.get(chave)!;
}

/**
 * Arquivo para um efeito: da biblioteca do workspace (variando por índice); sem nenhum na categoria, gera no ElevenLabs
 * (fica salvo na biblioteca para os próximos vídeos); sem ElevenLabs, o padrão sintetizado.
 */
export async function arquivoSfx(workspaceId: string, cat: Sfx, indice: number, pasta: string): Promise<string> {
  const lib = await db()<{ id: string; storage: string; r2_key: string; arquivado: boolean }[]>`
    select id, storage, r2_key, arquivado from ads.creatives where workspace_id = ${workspaceId} and type = 'SFX' and status = 'READY' and ${cat} = any(tags) and r2_key is not null order by created_at`;
  if (!lib.length) return (await gerarUmaVez(`${workspaceId}:sfx:${cat}`, async () => (await gerarAudio(workspaceId, { tipo: "SFX", tag: cat })).file)) ?? padrao(cat);
  const item = lib[indice % lib.length]!;
  const destino = join(pasta, `sfx-${item.id}`);
  return obter(item, destino);
}

/**
 * Música da biblioteca com a tag pedida (a favorita primeiro, senão a mais nova). Sem nenhuma: gera no ElevenLabs e
 * salva na biblioteca. Sem ElevenLabs: null (o pipeline compõe uma trilha original).
 */
export async function arquivoMusica(workspaceId: string, tag: (typeof MUSICA_TAGS)[number], pasta: string, dica = ""): Promise<{ file: string; name: string } | null> {
  const [m] = await db()<{ id: string; name: string; storage: string; r2_key: string; arquivado: boolean }[]>`
    select id, name, storage, r2_key, arquivado from ads.creatives where workspace_id = ${workspaceId} and type = 'MUSIC' and status = 'READY' and ${tag} = any(tags) and r2_key is not null
    order by coalesce((metadata->>'favorita')::boolean, false) desc, created_at desc limit 1`;
  if (!m) {
    let nome = "";
    const file = await gerarUmaVez(`${workspaceId}:music:${tag}`, async () => { const g = await gerarAudio(workspaceId, { tipo: "MUSIC", tag, prompt: dica }); nome = g.name; return g.file; });
    return file ? { file, name: nome || "ElevenLabs" } : null;
  }
  const destino = join(pasta, `music-${m.id}`);
  return { file: await obter(m, destino), name: m.name };
}
