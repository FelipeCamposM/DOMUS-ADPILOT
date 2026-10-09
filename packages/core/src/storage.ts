import { copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { r2Delete, r2Head, r2Put } from "./r2";

/**
 * Armazenamento dos criativos. Padrão: disco do PC (MEDIA_DIR), porque o R2 gratuito é pequeno (10 GB).
 * STORAGE=r2 volta a usar a Cloudflare. A chave é a mesma nos dois: ads/workspaces/{workspaceId}/{pasta}/{arquivo}.
 * O banco guarda só a chave e onde ela está (coluna storage), nunca caminho absoluto nem URL.
 */
export type Storage = "local" | "r2";
export const storageAtual = (): Storage => (process.env.STORAGE === "r2" ? "r2" : "local");

function mediaDir(): string {
  const d = process.env.MEDIA_DIR;
  if (!d) throw new Error("MEDIA_DIR não definido no .env (pasta dos vídeos e áudios no PC)");
  return resolve(d);
}

/** Caminho no disco de uma chave. Recusa qualquer chave que tente sair da pasta de mídia. */
export function caminhoLocal(key: string): string {
  const base = mediaDir();
  const p = resolve(base, key);
  if (!p.startsWith(base + sep)) throw new Error("Chave de arquivo inválida");
  return p;
}

/** Guarda um arquivo do disco do worker no armazenamento atual. Devolve onde ficou. */
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
  return s;
}

export async function apagarArquivo(storage: string, key: string): Promise<void> {
  if (storage === "local") await rm(caminhoLocal(key), { force: true });
  else await r2Delete(key);
}

export async function tamanhoArquivo(storage: string, key: string): Promise<number | null> {
  if (storage === "local") return stat(caminhoLocal(key)).then((s) => s.size, () => null);
  return (await r2Head(key))?.size ?? null;
}
