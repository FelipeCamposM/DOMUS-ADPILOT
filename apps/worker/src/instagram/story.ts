import { brandSchema, configCalendario, db, guardarArquivo, LIMITES_IG, lerArquivo, r2Key, type Json } from "@domus-ads/core";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../env";
import { capturar } from "../video/imagem";

/**
 * Repost nos stories: todo post publicado (menos story) volta como story alguns minutos depois. A API do Instagram não
 * "compartilha o post no story", então: post e carrossel viram uma arte 9:16 com a moldura da marca (a arte no centro,
 * fundo desfocado dela mesma, logo e chamada); Reels vai o próprio vídeo (até 60 s). Custo de IA: zero.
 */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fonteOk = (f: string) => /^[\w\s-]{2,60}$/.test(f);

function moldura(o: { arte: string; logo: string | null; usuario: string; tipo: "FEED" | "CARROSSEL"; slides: number; fundo: string; destaque: string; texto: string; fonteTitulo: string; fonteTexto: string }) {
  const familias = [...new Set([o.fonteTitulo, o.fonteTexto].filter(fonteOk))];
  const fontes = familias.length ? `<link href="https://fonts.googleapis.com/css2?${familias.map((f) => `family=${encodeURIComponent(f)}:wght@500;700;800`).join("&")}&display=swap" rel="stylesheet">` : "";
  const ft = fonteOk(o.fonteTitulo) ? `'${o.fonteTitulo}', ` : "";
  const fx = fonteOk(o.fonteTexto) ? `'${o.fonteTexto}', ` : "";
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=1080, height=1920">${fontes}
<style>
  html, body { width:1080px; height:1920px; margin:0; overflow:hidden; }
  body { background:${o.fundo}; color:${o.texto}; font-family:${fx}system-ui, sans-serif; }
  #root { position:relative; width:1080px; height:1920px; overflow:hidden; }
  .fundo { position:absolute; inset:-80px; background:url('${o.arte}') center/cover; filter:blur(46px) saturate(1.2) brightness(.5); transform:scale(1.15); }
  .veu { position:absolute; inset:0; background:linear-gradient(180deg, ${o.fundo}cc 0%, ${o.fundo}33 30%, ${o.fundo}33 70%, ${o.fundo}e6 100%); }
  .topo { position:absolute; top:120px; left:0; right:0; display:flex; justify-content:center; }
  .topo img { height:86px; max-width:420px; object-fit:contain; filter:drop-shadow(0 6px 18px rgba(0,0,0,.35)); }
  .topo b { font-family:${ft}system-ui, sans-serif; font-size:40px; font-weight:800; letter-spacing:-.01em; }
  .selo { position:absolute; top:${o.logo ? 250 : 210}px; left:0; right:0; display:flex; justify-content:center; }
  .selo span { padding:16px 34px; border-radius:999px; background:${o.destaque}; color:${o.fundo}; font-family:${ft}system-ui, sans-serif; font-weight:800; font-size:34px; letter-spacing:.08em; text-transform:uppercase; box-shadow:0 0 50px ${o.destaque}88; }
  .cartao { position:absolute; left:50%; top:52%; transform:translate(-50%,-50%); width:860px; }
  .cartao .atras { position:absolute; inset:0; border-radius:40px; background:rgba(255,255,255,.14); border:2px solid rgba(255,255,255,.18); }
  .cartao .atras.a { transform:rotate(-5deg) translate(-30px, 10px); }
  .cartao .atras.b { transform:rotate(4deg) translate(30px, 6px); }
  .cartao img { position:relative; display:block; width:100%; max-height:1150px; object-fit:cover; border-radius:40px; box-shadow:0 40px 90px rgba(0,0,0,.55), 0 0 0 2px rgba(255,255,255,.12); }
  .cont { position:absolute; right:30px; top:-30px; padding:10px 20px; border-radius:999px; background:rgba(0,0,0,.6); color:#fff; font-size:30px; font-weight:700; }
  .rodape { position:absolute; bottom:170px; left:0; right:0; text-align:center; }
  .rodape b { display:block; font-family:${ft}system-ui, sans-serif; font-size:52px; font-weight:800; letter-spacing:-.02em; }
  .rodape span { display:inline-block; margin-top:18px; font-size:34px; opacity:.85; }
</style></head>
<body><div id="root" data-composition-id="main" data-start="0" data-duration="1" data-width="1080" data-height="1920">
  <div class="fundo"></div><div class="veu"></div>
  <div class="topo">${o.logo ? `<img src="${o.logo}" alt="">` : `<b>@${esc(o.usuario)}</b>`}</div>
  <div class="selo"><span>${o.tipo === "CARROSSEL" ? "Novo carrossel" : "Novo post"}</span></div>
  <div class="cartao">${o.tipo === "CARROSSEL" ? `<div class="atras a"></div><div class="atras b"></div>` : ""}<img src="${o.arte}" alt="">${o.tipo === "CARROSSEL" ? `<span class="cont">1/${o.slides} ›</span>` : ""}</div>
  <div class="rodape"><b>${o.tipo === "CARROSSEL" ? "Arrasta pro lado lá no perfil" : "Já está no perfil"}</b><span>Toque em @${esc(o.usuario)} para ver</span></div>
</div></body></html>`;
}

/** Depois de publicar: agenda o story do post (nunca lança: story não pode virar falha do post). */
export async function agendarStory(postId: string, log: (m: string) => Promise<void>) {
  try {
    const cfg = await configCalendario();
    if (!cfg.stories) return;
    const sql = db();
    const [p] = await sql<{ id: string; workspace_id: string; ig_account_id: string; brand_id: string | null; tipo: string; midias: { creativeId: string }[]; username: string; brand: unknown }[]>`
      select p.id, p.workspace_id, p.ig_account_id, p.brand_id, p.tipo, p.midias, a.username, b.brand
      from ads.instagram_posts p join ads.instagram_accounts a on a.id = p.ig_account_id left join ads.brands b on b.id = p.brand_id
      where p.id = ${postId} and p.tipo <> 'STORY'`;
    if (!p) return;
    const [primeira] = await sql<{ id: string; type: string; storage: string; r2_key: string; arquivado: boolean; duration_ms: number | null; mime: string | null }[]>`
      select id, type, storage, r2_key, arquivado, duration_ms, mime from ads.creatives where id = ${p.midias[0]?.creativeId ?? null} and workspace_id = ${p.workspace_id}`;
    if (!primeira) return;
    let midia: string;
    if (primeira.type === "VIDEO") {
      if ((primeira.duration_ms ?? 0) > LIMITES_IG.storyVideoMaxSeg * 1000) { await log(`story: vídeo passa de ${LIMITES_IG.storyVideoMaxSeg} s, sem repost`); return; }
      midia = primeira.id; // Reels: o próprio vídeo
    } else {
      midia = await gerarMoldura(p, primeira, p.midias.length);
    }
    await sql`insert into ads.instagram_posts (workspace_id, ig_account_id, brand_id, tipo, midias, opcoes, status, agendado_para)
      values (${p.workspace_id}, ${p.ig_account_id}, ${p.brand_id}, 'STORY', ${sql.json([{ creativeId: midia }])}, ${sql.json({ repostDe: p.id } as Json)},
        'AGENDADO', now() + make_interval(mins => ${cfg.storyAtrasoMin}))`;
    await log(`story agendado para daqui a ${cfg.storyAtrasoMin} min`);
  } catch (e) {
    await log(`story não agendado: ${(e as Error).message}`).catch(() => {});
  }
}

async function gerarMoldura(p: { id: string; workspace_id: string; tipo: string; username: string; brand: unknown }, arte: { id: string; storage: string; r2_key: string; arquivado: boolean; mime: string | null }, slides: number): Promise<string> {
  const pasta = join(DATA_DIR, "instagram", `story-${p.id}`);
  mkdirSync(join(pasta, "assets"), { recursive: true });
  try {
    const sql = db();
    const ext = (m: string | null, k: string) => (m === "image/jpeg" ? "jpg" : m === "image/webp" ? "webp" : m === "image/svg+xml" ? "svg" : k.split(".").pop() ?? "png");
    writeFileSync(join(pasta, "assets", `arte.${ext(arte.mime, arte.r2_key)}`), await lerArquivo(arte));
    const b = brandSchema.safeParse(p.brand ?? {});
    const brand = b.success ? b.data : null;
    let logo: string | null = null;
    if (brand?.logoId) {
      const [l] = await sql<{ storage: string; r2_key: string; arquivado: boolean; mime: string | null }[]>`select storage, r2_key, arquivado, mime from ads.creatives where id = ${brand.logoId} and r2_key is not null`;
      if (l) { logo = `assets/logo.${ext(l.mime, l.r2_key)}`; writeFileSync(join(pasta, logo), await lerArquivo(l)); }
    }
    const cor = (i: number, padrao: string) => brand?.cores[i]?.hex ?? padrao;
    const html = moldura({
      arte: `assets/arte.${ext(arte.mime, arte.r2_key)}`, logo, usuario: p.username, tipo: p.tipo === "CARROSSEL" ? "CARROSSEL" : "FEED", slides,
      fundo: cor(0, "#0B0B12"), destaque: cor(1, "#A855FF"), texto: cor(2, "#FAFAFC"), fonteTitulo: brand?.fonteTitulo ?? "", fonteTexto: brand?.fonteTexto ?? "",
    });
    const png = await capturar(pasta, html, AbortSignal.timeout(180_000));
    const id = crypto.randomUUID();
    const key = r2Key(p.workspace_id, "images", `${id}.png`);
    const storage = await guardarArquivo(key, png, "image/png");
    // tag "story": não aparece na biblioteca (é derivado do post)
    await sql`insert into ads.creatives (id, workspace_id, name, type, status, storage, r2_key, mime, size_bytes, width, height, tags, metadata)
      values (${id}, ${p.workspace_id}, ${`Story · ${p.username}`}, 'IMAGE', 'READY', ${storage}, ${key}, 'image/png', ${statSync(png).size}, 1080, 1920, ${["story"]}, ${sql.json({ storyDe: p.id })})`;
    return id;
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}
