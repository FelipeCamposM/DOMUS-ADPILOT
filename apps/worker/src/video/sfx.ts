import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { caminhoLocal, db, r2Presign, SFX_CATEGORIAS, type MUSICA_TAGS } from "@domus-ads/core";
import { DATA_DIR } from "../env";
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

/** Áudio da biblioteca: no PC é usado direto do disco; no R2 é baixado para a pasta do job. */
async function obter(storage: string, key: string, destino: string): Promise<string> {
  if (storage === "local") return caminhoLocal(key);
  if (existsSync(destino)) return destino;
  const r = await fetch(await r2Presign(key, "GET", 600));
  if (!r.ok) throw new Error(`R2 GET ${r.status}`);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(destino, Buffer.from(await r.arrayBuffer()));
  return destino;
}

/** Arquivo para um efeito: da biblioteca do workspace (variando por índice) ou o padrão sintetizado. */
export async function arquivoSfx(workspaceId: string, cat: Sfx, indice: number, pasta: string): Promise<string> {
  const lib = await db()<{ id: string; storage: string; r2_key: string }[]>`
    select id, storage, r2_key from ads.creatives where workspace_id = ${workspaceId} and type = 'SFX' and status = 'READY' and ${cat} = any(tags) and r2_key is not null order by created_at`;
  if (!lib.length) return padrao(cat);
  const item = lib[indice % lib.length]!;
  const destino = join(pasta, `sfx-${item.id}`);
  return obter(item.storage, item.r2_key, destino);
}

/** Música licenciada da biblioteca com a tag pedida. Sem nenhuma: null (o vídeo sai sem música, e o projeto avisa). */
export async function arquivoMusica(workspaceId: string, tag: (typeof MUSICA_TAGS)[number], pasta: string): Promise<{ file: string; name: string } | null> {
  const [m] = await db()<{ id: string; name: string; storage: string; r2_key: string }[]>`
    select id, name, storage, r2_key from ads.creatives where workspace_id = ${workspaceId} and type = 'MUSIC' and status = 'READY' and ${tag} = any(tags) and r2_key is not null
    order by created_at desc limit 1`;
  if (!m) return null;
  const destino = join(pasta, `music-${m.id}`);
  return { file: await obter(m.storage, m.r2_key, destino), name: m.name };
}
