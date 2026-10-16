import { db, instagramDaConexao, lerArquivo, r2Delete, r2Presign, r2Put, type InstagramApi } from "@domus-ads/core";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../env";
import { arquivarPublicados, restaurar } from "../video/arquivo";
import { ffmpeg, FFPROBE, rodar } from "../video/tools";
import { avisar } from "../whatsapp";
import { agendarStory } from "./story";

interface Post { id: string; tipo: "FEED" | "CARROSSEL" | "REELS" | "STORY"; legenda: string; midias: { creativeId: string }[]; opcoes: { compartilharNoFeed?: boolean; capaMs?: number; repostDe?: string }; workspace_id: string }
interface Criativo { id: string; type: string; mime: string | null; storage: string; r2_key: string; arquivado: boolean }

const NOME = { FEED: "Post", CARROSSEL: "Carrossel", REELS: "Reels", STORY: "Story" } as const;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function dimensoes(arquivo: string): Promise<{ w: number; h: number }> {
  const r = await rodar(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", arquivo]);
  const [w, h] = r.out.trim().split(",").map(Number);
  if (!w || !h) throw new Error("Não consegui ler o tamanho da imagem");
  return { w, h };
}

/**
 * A API só aceita JPEG e proporção entre 4:5 e 1,91:1 no feed (9:16 no story). Fora disso, a imagem entra inteira
 * sobre um fundo desfocado dela mesma, em vez de ser cortada.
 */
async function paraJpeg(origem: string, destino: string, W: number, H: number) {
  const f = `[0:v]split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:6[bg];` +
    `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuvj420p`;
  const r = await ffmpeg(["-i", origem, "-filter_complex", f, "-frames:v", "1", "-q:v", "2", destino], { timeoutMs: 120_000 });
  if (r.code !== 0) throw new Error(`Falha ao converter a imagem: ${r.err.slice(-300)}`);
}

const proporcaoFeed = (w: number, h: number) => Math.min(1.91, Math.max(0.8, w / h));

/** Publica uma publicação AGENDADA (a trava de status impede publicar duas vezes). */
export async function publicarInstagram(postId: string, c: { signal: AbortSignal; log: (m: string) => Promise<void> }) {
  const sql = db();
  const [p] = await sql<Post[]>`
    update ads.instagram_posts set status = 'PUBLICANDO', erro = null, updated_at = now()
    where id = ${postId} and status = 'AGENDADO' returning id, tipo, legenda, midias, opcoes, workspace_id`;
  if (!p) return { pulado: "não está agendada" };
  const temporarios: string[] = [];
  const pasta = join(DATA_DIR, "instagram", p.id);
  let perfil = "";
  mkdirSync(pasta, { recursive: true });
  try {
    const [conta] = await sql<{ ig_user_id: string; username: string; credentials_enc: string }[]>`
      select a.ig_user_id, a.username, k.credentials_enc from ads.instagram_posts x
      join ads.instagram_accounts a on a.id = x.ig_account_id join ads.ad_connections k on k.id = a.connection_id
      where x.id = ${p.id} and k.status <> 'REVOKED'`;
    if (!conta) throw new Error("A conexão do Instagram foi removida");
    perfil = ` em @${conta.username}`;
    const api = instagramDaConexao(conta.credentials_enc);
    const ids = p.midias.map((m) => m.creativeId);
    const lista = await sql<Criativo[]>`
      select id, type, mime, storage, r2_key, arquivado from ads.creatives
      where id = any(${ids}::uuid[]) and workspace_id = ${p.workspace_id} and status = 'READY' and r2_key is not null`;
    const midias = ids.map((id) => lista.find((x) => x.id === id)).filter((x): x is Criativo => !!x);
    if (midias.length !== ids.length) throw new Error("Uma das mídias foi apagada da biblioteca");
    await c.log(`publicando ${p.tipo} em @${conta.username} (${midias.length} mídia(s))`);

    // URL pública (pré-assinada, 2 h) de cada mídia, no formato que a API aceita
    let alvo: { W: number; H: number } | null = null;
    const urls: { url: string; video: boolean }[] = [];
    for (const [i, m] of midias.entries()) {
      if (m.type === "VIDEO") {
        if (m.arquivado) { await c.log("vídeo arquivado no Drive: trazendo de volta"); await restaurar(m.id); }
        if (m.storage === "r2" && (m.mime === "video/mp4" || m.r2_key.endsWith(".mp4"))) {
          urls.push({ url: await r2Presign(m.r2_key, "GET", 7200), video: true });
        } else {
          const orig = join(pasta, `orig-${i}`);
          writeFileSync(orig, await lerArquivo(m));
          const mp4 = join(pasta, `${i}.mp4`);
          const r = await ffmpeg(["-i", orig, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", mp4], { timeoutMs: 900_000, signal: c.signal });
          if (r.code !== 0) throw new Error(`Falha ao converter o vídeo: ${r.err.slice(-300)}`);
          const key = `instagram/${p.id}/${i}.mp4`;
          await r2Put(key, readFileSync(mp4), "video/mp4");
          temporarios.push(key);
          urls.push({ url: await r2Presign(key, "GET", 7200), video: true });
        }
        continue;
      }
      const orig = join(pasta, `orig-${i}`);
      writeFileSync(orig, await lerArquivo(m));
      const d = await dimensoes(orig);
      // carrossel: todos no formato do primeiro item (o Instagram corta os outros para ele)
      if (p.tipo === "STORY") alvo = { W: 1080, H: 1920 };
      else if (!alvo || p.tipo !== "CARROSSEL") { const r = proporcaoFeed(d.w, d.h); alvo = { W: 1080, H: Math.round(1080 / r / 2) * 2 }; }
      const jpg = join(pasta, `${i}.jpg`);
      await paraJpeg(orig, jpg, alvo.W, alvo.H);
      const key = `instagram/${p.id}/${i}.jpg`;
      await r2Put(key, readFileSync(jpg), "image/jpeg");
      temporarios.push(key);
      urls.push({ url: await r2Presign(key, "GET", 7200), video: false });
    }

    const legenda: Record<string, string> = p.tipo === "STORY" ? {} : { caption: p.legenda };
    let container: string;
    if (p.tipo === "CARROSSEL") {
      const filhos: string[] = [];
      for (const u of urls) {
        const f = await api.criarContainer(conta.ig_user_id, u.video ? { media_type: "VIDEO", video_url: u.url, is_carousel_item: "true" } : { image_url: u.url, is_carousel_item: "true" });
        if (u.video) await aguardar(api, f.id, c);
        filhos.push(f.id);
      }
      container = (await api.criarContainer(conta.ig_user_id, { media_type: "CAROUSEL", children: filhos.join(","), ...legenda })).id;
    } else if (p.tipo === "REELS") {
      container = (await api.criarContainer(conta.ig_user_id, {
        media_type: "REELS", video_url: urls[0]!.url, share_to_feed: String(p.opcoes.compartilharNoFeed !== false), ...legenda,
        ...(p.opcoes.capaMs != null ? { thumb_offset: String(p.opcoes.capaMs) } : {}),
      })).id;
    } else if (p.tipo === "STORY") {
      container = (await api.criarContainer(conta.ig_user_id, urls[0]!.video ? { media_type: "STORIES", video_url: urls[0]!.url } : { media_type: "STORIES", image_url: urls[0]!.url })).id;
    } else {
      container = (await api.criarContainer(conta.ig_user_id, { image_url: urls[0]!.url, ...legenda })).id;
    }
    await aguardar(api, container, c);
    const pub = await api.publicar(conta.ig_user_id, container);
    const link = await api.permalink(pub.id).then((x) => x.permalink ?? null, () => null);
    await sql`update ads.instagram_posts set status = 'PUBLICADO', publicado_em = now(), ig_media_id = ${pub.id}, permalink = ${link}, updated_at = now() where id = ${p.id}`;
    await c.log(`publicado: ${link ?? pub.id}`);
    if (p.tipo !== "STORY") await agendarStory(p.id, c.log); // antes de arquivar: o story usa a arte (e o vídeo fica protegido enquanto agendado)
    await arquivarPublicados(ids).catch(() => {}); // nunca vira falha da publicação. Já está no Instagram: o original vai para o Drive (fica a prévia no R2)
    if (!p.opcoes.repostDe) await avisar(`✅ ${NOME[p.tipo]} publicado${perfil}${link ? `
${link}` : ""}`);
    return { mediaId: pub.id, permalink: link };
  } catch (e) {
    await sql`update ads.instagram_posts set status = 'FALHOU', erro = ${(e as Error).message.slice(0, 2000)}, updated_at = now() where id = ${p.id}`;
    await avisar(`❌ ${NOME[p.tipo]} não foi publicado${perfil}
Motivo: ${(e as Error).message.slice(0, 300)}
Veja em Instagram → Planejados.`);
    throw e;
  } finally {
    for (const k of temporarios) await r2Delete(k).catch(() => {});
    rmSync(pasta, { recursive: true, force: true });
  }
}

/** Vídeo leva um tempo para o Instagram processar: espera o container ficar pronto (até 15 min). */
async function aguardar(api: InstagramApi, id: string, c: { signal: AbortSignal; log: (m: string) => Promise<void> }) {
  for (let i = 0; i < 180; i++) {
    if (c.signal.aborted) throw new Error("Cancelado");
    const s = await api.statusContainer(id);
    if (s.status_code === "FINISHED" || s.status_code === "PUBLISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`O Instagram recusou a mídia: ${s.status ?? s.status_code}`);
    if (i % 6 === 0) await c.log("Instagram processando a mídia…");
    await dormir(5000);
  }
  throw new Error("O Instagram demorou demais para processar a mídia (15 min)");
}
