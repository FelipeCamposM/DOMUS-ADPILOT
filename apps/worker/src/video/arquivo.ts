import { caminhoDrive, caminhoLocal, db, r2Delete, r2Presign, r2Put, storageAtual, temDrive } from "@domus-ads/core";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Arquivo morto no Google Drive. O R2 grátis tem 10 GB e o bucket é dividido com o site da Domus, então o AdPilot usa
 * no máximo R2_LIMITE_GB (padrão 6). Passou disso: os arquivos menos usados (usado_em) saem do R2 e ficam só no Drive.
 * Miniaturas nunca saem. Abrir um arquivado chama restaurar() por um job RESTORE_MEDIA.
 */
const GB = 1024 ** 3;
export const limiteR2 = () => Number(process.env.R2_LIMITE_GB || 6) * GB;

const tamanho = (p: string) => stat(p).then((s) => s.size, () => -1);

/** Garante que o Drive tem o arquivo inteiro (baixa do R2 se faltar ou estiver diferente). */
async function garantirNoDrive(key: string, bytes: number): Promise<void> {
  const destino = caminhoDrive(key);
  if ((await tamanho(destino)) === bytes) return;
  const r = await fetch(await r2Presign(key, "GET", 900));
  if (!r.ok) throw new Error(`R2 GET ${r.status}`);
  await mkdir(dirname(destino), { recursive: true });
  const tmp = `${destino}.parcial`;
  await writeFile(tmp, Buffer.from(await r.arrayBuffer()));
  await rename(tmp, destino);
  if ((await tamanho(destino)) !== bytes) throw new Error(`cópia no Drive com tamanho diferente: ${key}`);
}

/** Tira do R2 o que passar do limite, do menos usado para o mais usado (e nada usado nas últimas 24 h). */
export async function arquivarExcesso(log: (m: string) => void = console.log): Promise<number> {
  if (!temDrive() || storageAtual() !== "r2") return 0;
  const sql = db();
  const [t] = await sql<{ total: string }[]>`
    select coalesce(sum(size_bytes), 0)::text as total from ads.creatives where storage = 'r2' and not arquivado and status = 'READY' and r2_key is not null`;
  let total = Number(t!.total);
  if (total <= limiteR2()) return 0;
  const candidatos = await sql<{ id: string; r2_key: string; size_bytes: string }[]>`
    select id, r2_key, size_bytes::text from ads.creatives
    where storage = 'r2' and not arquivado and status = 'READY' and r2_key is not null and size_bytes > 0
      and coalesce(usado_em, created_at) < now() - interval '1 day'
    order by coalesce(usado_em, created_at) limit 500`;
  let n = 0;
  for (const c of candidatos) {
    if (total <= limiteR2()) break;
    try {
      await garantirNoDrive(c.r2_key, Number(c.size_bytes));
      // marca antes de apagar: quem ler no meio do caminho já vai ao Drive, onde o arquivo está
      const [ok] = await sql`update ads.creatives set arquivado = true where id = ${c.id} and not arquivado returning id`;
      if (!ok) continue;
      await r2Delete(c.r2_key);
      total -= Number(c.size_bytes);
      n++;
    } catch (e) {
      log(`não arquivei ${c.id}: ${(e as Error).message}`);
    }
  }
  if (n) log(`${n} arquivo(s) movidos do R2 para o Drive; R2 do AdPilot agora com ${(total / GB).toFixed(2)} GB`);
  return n;
}

/** Traz um arquivado do Drive de volta para o R2. */
export async function restaurar(creativeId: string): Promise<{ restaurado: boolean }> {
  const sql = db();
  const [c] = await sql<{ r2_key: string; mime: string | null; arquivado: boolean }[]>`
    select r2_key, mime, arquivado from ads.creatives where id = ${creativeId} and r2_key is not null`;
  if (!c?.arquivado) return { restaurado: false };
  const corpo = await readFile(caminhoDrive(c.r2_key));
  await r2Put(c.r2_key, corpo, c.mime ?? "application/octet-stream", corpo.byteLength);
  await sql`update ads.creatives set arquivado = false, usado_em = now() where id = ${creativeId}`;
  return { restaurado: true };
}

/**
 * Uma vez, ao trocar STORAGE=local por r2: sobe para o R2 (e copia no Drive) tudo que está no disco do PC.
 * Depois arquiva o excesso. Pode rodar de novo sem problema: só mexe no que ainda está como local.
 */
export async function migrarLocais(log: (m: string) => void = console.log): Promise<void> {
  const sql = db();
  const itens = await sql<{ id: string; r2_key: string | null; thumbnail_key: string | null; mime: string | null }[]>`
    select id, r2_key, thumbnail_key, mime from ads.creatives where storage = 'local' and status = 'READY'`;
  log(`${itens.length} criativo(s) no disco do PC`);
  for (const c of itens) {
    try {
      for (const [key, mime] of [[c.r2_key, c.mime], [c.thumbnail_key, "image/jpeg"]] as const) {
        if (!key) continue;
        const origem = caminhoLocal(key);
        const corpo = await readFile(origem);
        await r2Put(key, corpo, mime ?? "application/octet-stream", corpo.byteLength);
        if (temDrive()) {
          await mkdir(dirname(caminhoDrive(key)), { recursive: true });
          await writeFile(caminhoDrive(key), corpo);
        }
      }
      await sql`update ads.creatives set storage = 'r2' where id = ${c.id}`;
    } catch (e) {
      log(`falhou ${c.id}: ${(e as Error).message}`);
    }
  }
  await arquivarExcesso(log);
  log("pronto (os arquivos continuam no MEDIA_DIR; apague a pasta quando quiser)");
}
