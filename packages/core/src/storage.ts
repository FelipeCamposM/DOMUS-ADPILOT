import { createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, resolve, sep } from "node:path";
import type { Sql } from "./db";
import { enqueueJob } from "./jobs";
import { r2Delete, r2Head, r2Presign, r2Put } from "./r2";

/**
 * Armazenamento dos criativos. STORAGE=r2: Cloudflare R2 (o site online lê de lá). STORAGE=local: disco do PC (MEDIA_DIR),
 * só serve quando web e worker rodam no mesmo PC. A chave é a mesma em todos: ads/workspaces/{workspaceId}/{pasta}/{arquivo}.
 * O banco guarda só a chave e onde ela está (coluna storage), nunca caminho absoluto nem URL.
 *
 * Arquivo morto no Google Drive (DRIVE_DIR, pasta sincronizada pelo Google Drive para computador): o worker guarda uma
 * cópia de tudo que gera e, quando o R2 enche, tira do R2 os arquivos menos usados (coluna arquivado). Abrir um
 * arquivado pede o restauro: o worker copia de volta do Drive para o R2. Só o PC do worker enxerga o Drive.
 */
export type Storage = "local" | "r2";
export const storageAtual = (): Storage => (process.env.STORAGE === "r2" ? "r2" : "local");

/** Caminho de uma chave dentro de uma pasta. Recusa qualquer chave que tente sair dela. */
function dentro(base: string, key: string): string {
  const p = resolve(base, key);
  if (!p.startsWith(base + sep)) throw new Error("Chave de arquivo inválida");
  return p;
}

export function caminhoLocal(key: string): string {
  const d = process.env.MEDIA_DIR;
  if (!d) throw new Error("MEDIA_DIR não definido no .env (pasta dos vídeos e áudios no PC)");
  return dentro(resolve(d), key);
}

export const temDrive = () => !!process.env.DRIVE_DIR;

export function caminhoDrive(key: string): string {
  const d = process.env.DRIVE_DIR;
  if (!d) throw new Error("DRIVE_DIR não definido no .env (pasta do Google Drive no PC)");
  return dentro(resolve(d), key);
}

/** Cópia no Drive. Falha não derruba quem chamou: o arquivamento confere a cópia de novo antes de tirar do R2. */
export async function copiarParaDrive(key: string, origem: string): Promise<void> {
  if (!temDrive()) return;
  try {
    const destino = caminhoDrive(key);
    await mkdir(dirname(destino), { recursive: true });
    await copyFile(origem, destino);
  } catch (e) {
    console.warn(`cópia no Drive falhou (${key}):`, (e as Error).message);
  }
}

/** Guarda um arquivo do disco do worker no armazenamento atual (e uma cópia no Drive). Devolve onde ficou. */
export async function guardarArquivo(key: string, origem: string, mime: string): Promise<Storage> {
  const s = storageAtual();
  if (s === "local") {
    const destino = caminhoLocal(key);
    await mkdir(dirname(destino), { recursive: true });
    await copyFile(origem, destino);
  } else {
    const corpo = await readFile(origem);
    await r2Put(key, corpo, mime, corpo.byteLength);
  }
  await copiarParaDrive(key, origem);
  return s;
}

/** Bytes de um arquivo onde quer que ele esteja. Arquivado só é lido no PC do worker (é lá que o Drive está). */
export async function lerArquivo(c: { storage: string; r2_key: string; arquivado?: boolean }): Promise<Buffer> {
  if (c.arquivado) return readFile(caminhoDrive(c.r2_key));
  if (c.storage === "local") return readFile(caminhoLocal(c.r2_key));
  const r = await fetch(await r2Presign(c.r2_key, "GET", 600));
  if (!r.ok) throw new Error(`R2 GET ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Copia um arquivo (de qualquer lugar) para o disco sem passar tudo pela memória: vídeos grandes enviados pelo usuário. */
export async function baixarArquivo(c: { storage: string; r2_key: string; arquivado?: boolean }, destino: string): Promise<void> {
  await mkdir(dirname(destino), { recursive: true });
  if (c.arquivado) return copyFile(caminhoDrive(c.r2_key), destino);
  if (c.storage === "local") return copyFile(caminhoLocal(c.r2_key), destino);
  const r = await fetch(await r2Presign(c.r2_key, "GET", 3600));
  if (!r.ok || !r.body) throw new Error(`R2 GET ${r.status}`);
  await pipeline(Readable.fromWeb(r.body as import("node:stream/web").ReadableStream), createWriteStream(destino));
}

/** Apaga de onde estiver; a cópia do Drive só some quando quem apaga é o worker (a Vercel não enxerga o Drive). */
export async function apagarArquivo(storage: string, key: string): Promise<void> {
  if (storage === "local") await rm(caminhoLocal(key), { force: true });
  else await r2Delete(key);
  if (temDrive()) await rm(caminhoDrive(key), { force: true }).catch(() => {});
}

export async function tamanhoArquivo(storage: string, key: string): Promise<number | null> {
  if (storage === "local") return stat(caminhoLocal(key)).then((s) => s.size, () => null);
  return (await r2Head(key))?.size ?? null;
}

/** Pede ao worker para trazer um arquivado de volta ao R2. Um pedido por vez para cada criativo. */
export async function pedirRestauro(sql: Sql, creativeId: string, workspaceId: string): Promise<void> {
  const [j] = await sql`select 1 from ads.jobs where type = 'RESTORE_MEDIA' and status in ('PENDING','RUNNING') and payload->>'creativeId' = ${creativeId} limit 1`;
  if (!j) await enqueueJob(sql, { workspaceId, type: "RESTORE_MEDIA", payload: { creativeId } });
}
