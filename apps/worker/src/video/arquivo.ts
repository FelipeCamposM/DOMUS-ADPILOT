import { armazenamento, caminhoDrive, caminhoLocal, db, r2Delete, r2Presign, r2Put, storageAtual, temDrive } from "@domus-ads/core";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ffmpeg } from "./tools";

/**
 * Arquivo morto no Google Drive. O R2 grátis tem 10 GB e o bucket é dividido com o site da Domus, então o R2 guarda só o
 * que está em uso; o original do resto fica só no Drive. Regras em Configurações → Armazenamento (armazenamento()):
 * sai do R2 o que passou X dias sem uso e, acima do limite, o menos usado primeiro. Antes de tirar, fica no R2 uma prévia
 * leve (imagem 1080px, vídeo 480p) para o site continuar mostrando. Miniaturas nunca saem. Logos de marca e mídia de
 * post agendado ficam. Abrir o original de um arquivado chama restaurar() por um job RESTORE_MEDIA.
 */
const GB = 1024 ** 3;

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

interface Candidato { id: string; r2_key: string; size_bytes: string; mime: string | null; preview_key: string | null }

/** ads/workspaces/{ws}/images/abc.png → ads/workspaces/{ws}/previews/abc.jpg */
const chavePrevia = (key: string, ext: string) => key.replace(/\/[^/]+\/([^/]+)\.\w+$/, `/previews/$1.${ext}`);

/** Versão leve que fica no R2 no lugar do original. Sem prévia (SVG, GIF, áudio, falha do ffmpeg) o site mostra o aviso de arquivado. */
async function gerarPrevia(c: Candidato): Promise<string | null> {
  const video = !!c.mime?.startsWith("video/");
  if (!video && !/^image\/(png|jpe?g|webp)$/.test(c.mime ?? "")) return null;
  const key = chavePrevia(c.r2_key, video ? "mp4" : "jpg");
  const tmp = join(tmpdir(), `previa-${c.id}.${video ? "mp4" : "jpg"}`);
  // vídeo: o lado menor vira 480 (vale para 9:16 e 16:9); imagem: até 1080 de largura
  const args = video
    ? ["-i", caminhoDrive(c.r2_key), "-vf", "scale='if(gt(iw,ih),-2,min(480,iw))':'if(gt(iw,ih),min(480,ih),-2)'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", tmp]
    : ["-i", caminhoDrive(c.r2_key), "-vf", "scale='min(1080,iw)':-2", "-frames:v", "1", "-q:v", "4", tmp];
  try {
    const r = await ffmpeg(args, { timeoutMs: 600_000 });
    if (r.code !== 0) throw new Error(r.err.slice(-200));
    const corpo = await readFile(tmp);
    await r2Put(key, corpo, video ? "video/mp4" : "image/jpeg", corpo.byteLength);
    return key;
  } catch (e) {
    console.log(`prévia de ${c.id} falhou: ${(e as Error).message}`);
    return null;
  } finally {
    await rm(tmp, { force: true });
  }
}

/** Tira um arquivo do R2: confere a cópia no Drive, deixa a prévia e só então apaga o original. */
async function arquivarUm(c: Candidato, previas: boolean): Promise<boolean> {
  await garantirNoDrive(c.r2_key, Number(c.size_bytes));
  const previa = previas ? await gerarPrevia(c) : null;
  // marca antes de apagar: quem ler no meio do caminho já vai ao Drive, onde o arquivo está
  const [ok] = await db()`update ads.creatives set arquivado = true, preview_key = ${previa} where id = ${c.id} and not arquivado returning id`;
  if (!ok) return false;
  if (c.preview_key && c.preview_key !== previa) await r2Delete(c.preview_key).catch(() => {});
  await r2Delete(c.r2_key);
  return true;
}

/** Ficam no R2: logos das marcas e mídia de publicação agendada ou em andamento. */
const protegidos = () => db()<{ id: string }[]>`
  select brand->>'logoId' as id from ads.brands where brand->>'logoId' is not null
  union select m->>'creativeId' from ads.instagram_posts p, jsonb_array_elements(p.midias) m where p.status in ('AGENDADO','PUBLICANDO')`
  .then((r) => r.map((x) => x.id));

/** Passada periódica: sai do R2 o que está sem uso há X dias e, se ainda passar do limite, o menos usado (nada das últimas 24 h). */
export async function arquivarExcesso(log: (m: string) => void = console.log): Promise<number> {
  if (!temDrive() || storageAtual() !== "r2") return 0;
  const sql = db();
  const cfg = await armazenamento();
  const limite = cfg.limiteGb * GB;
  const [t] = await sql<{ total: string }[]>`
    select coalesce(sum(size_bytes), 0)::text as total from ads.creatives where storage = 'r2' and not arquivado and status = 'READY' and r2_key is not null`;
  let total = Number(t!.total);
  const candidatos = await sql<(Candidato & { parado: boolean; recente: boolean })[]>`
    select id, r2_key, size_bytes::text, mime, preview_key,
      coalesce(usado_em, created_at) < now() - make_interval(days => ${cfg.diasSemUso}) as parado,
      coalesce(usado_em, created_at) > now() - interval '1 day' as recente
    from ads.creatives
    where storage = 'r2' and not arquivado and status = 'READY' and r2_key is not null and size_bytes > 0 and type in ('IMAGE','VIDEO','MUSIC','SFX')
      and not (id::text = any(${await protegidos()}::text[]))
    order by coalesce(usado_em, created_at) limit 500`;
  let n = 0;
  for (const c of candidatos) {
    if (!c.parado && (total <= limite || c.recente)) break; // ordem: do menos usado; daqui pra frente todos ficam
    try {
      if (await arquivarUm(c, cfg.previas)) { total -= Number(c.size_bytes); n++; }
    } catch (e) {
      log(`não arquivei ${c.id}: ${(e as Error).message}`);
    }
  }
  if (n) log(`${n} arquivo(s) movidos do R2 para o Drive; R2 do AdPilot agora com ${(total / GB).toFixed(2)} de ${cfg.limiteGb} GB`);
  return n;
}

/** Depois de publicar: a mídia já está no Instagram, o original vai para o Drive (se a regra estiver ligada). */
export async function arquivarPublicados(ids: string[]): Promise<void> {
  if (!temDrive() || storageAtual() !== "r2" || !ids.length) return;
  const cfg = await armazenamento();
  if (!cfg.arquivarPublicados) return;
  const fica = await protegidos();
  const itens = await db()<Candidato[]>`
    select id, r2_key, size_bytes::text, mime, preview_key from ads.creatives
    where id::text = any(${ids.filter((i) => !fica.includes(i))}::text[]) and storage = 'r2' and not arquivado and status = 'READY' and r2_key is not null and size_bytes > 0`;
  for (const c of itens) await arquivarUm(c, cfg.previas).catch((e: Error) => console.log(`não arquivei ${c.id} após publicar: ${e.message}`));
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
