import { caminhoDrive, db, estiloPronto, r2Presign, r2Put, temDrive, violacoes } from "@domus-ads/core";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { DATA_DIR } from "../env";
import { bloco, perguntarIA } from "../ai/ask";
import { promptCorrecao } from "./compose";
import { ffmpeg, hyperframes } from "./tools";

/**
 * Biblioteca de estilos (Studio → Estilos), job ESTILOS:
 * - "previa": a IA escreve uma amostra curta (5 s, muda, 1280×800) do estilo pronto e a HyperFrames renderiza; vira um
 *   MP4 leve no R2 (o card toca ao passar o mouse) com cópia no Google Drive.
 * - "drive": copia as referências de um estilo do workspace para o Drive (pasta do estilo).
 */
export type EstilosPayload = { acao: "previa"; chave: string } | { acao: "drive"; id: string };
type Ctx = { signal: AbortSignal; log: (m: string) => Promise<void> };

const W = 1280, H = 800, DUR = 5;
export const chavePreviaEstilo = (chave: string) => `ads/estilos/${chave}.mp4`;

const sistema = (tresD: boolean) => `Você é motion designer sênior e escreve composições de vídeo em HTML para a HyperFrames (Chrome headless, quadro a quadro).
Responda APENAS com um bloco \`\`\`html com o index.html completo.

É uma AMOSTRA de estilo para uma galeria: ${DUR} segundos, sem som, ${W}×${H}, que mostre com clareza a linguagem visual pedida.
Conteúdo: uma cena curta com a palavra "DOMUS" como título e o nome do estilo pequeno, mais elementos visuais que demonstrem o estilo.
O movimento deve ser contínuo do início ao fim (a amostra toca em loop: o último quadro parecido com o primeiro).

ESTRUTURA OBRIGATÓRIA:
- <meta name="viewport" content="width=${W}, height=${H}">, html/body com width:${W}px; height:${H}px; overflow:hidden; margin:0.
- <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
  com UM filho: <section id="cena-0" class="clip" data-start="0" data-duration="${DUR}" data-track-index="0"> (position:absolute; inset:0).
- Scripts no fim do <body>: <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>${tresD ? `
  e <script src="assets/three.min.js"></script> (Three.js r159, global THREE)` : ""}, depois o seu script com
  const tl = gsap.timeline({ paused: true }); … tweens com tempo absoluto …; window.__timelines = window.__timelines || {}; window.__timelines["main"] = tl;
- Nada de CSS @keyframes/animation/transition: todo movimento vem do timeline. PROIBIDO Math.random, Date, fetch, import(), eval, iframe,
  imagens externas. Fontes: Google Fonts (<link>) ou do sistema. Formas e ilustrações em CSS/SVG inline.${tresD ? `
- 3D: <canvas id="gl" width="${W}" height="${H}"> como primeiro filho do #root (position:absolute; inset:0), WebGLRenderer({ canvas,
  antialias: true, preserveDrawingBuffer: true }), setPixelRatio(1), setSize(${W}, ${H}, false). Sem requestAnimationFrame: desenhe com
  tl.to({}, { duration: ${DUR}, onUpdate: render }, 0) e chame render() uma vez. Só geometria procedural, sem texturas externas.` : ""}`;

async function renderizarPrevia(chave: string, c: Ctx) {
  const e = estiloPronto(chave);
  if (!e) throw new Error(`Estilo pronto desconhecido: ${chave}`);
  const pasta = join(DATA_DIR, "estilos", chave);
  rmSync(pasta, { recursive: true, force: true });
  mkdirSync(join(pasta, "assets"), { recursive: true });
  const tresD = e.familia === "3d";
  if (tresD) copyFileSync(join(dirname(createRequire(import.meta.url).resolve("three")), "three.min.js"), join(pasta, "assets", "three.min.js"));
  const ia = (s: string, p: string) => perguntarIA({ workspaceId: null, sistema: s, prompt: p, cwd: pasta, signal: c.signal, log: c.log });
  const sis = sistema(tresD);
  await c.log(`Criando a amostra de “${e.nome}”…`);
  let html = bloco((await ia(sis, `Estilo: "${e.nome}" (${e.familia}).\nDireção de arte: ${e.prompt}`)).text, "html");
  for (let rodada = 0; ; rodada++) {
    writeFileSync(join(pasta, "index.html"), html, "utf8");
    const lint = await hyperframes(["lint", pasta, "--json"], { cwd: pasta, timeoutMs: 120_000 });
    let erros = violacoes(html);
    try {
      const j = JSON.parse(lint.out.slice(lint.out.indexOf("{"))) as { findings?: { severity: string; message: string }[] };
      erros = [...erros, ...(j.findings ?? []).filter((f) => f.severity === "error").map((f) => f.message)];
    } catch { /* lint sem JSON: segue com a barreira de segurança */ }
    if (!erros.length) break;
    if (rodada === 2) throw new Error(`A amostra continuou com erros: ${erros.slice(0, 3).join("; ")}`);
    await c.log(`${erros.length} problema(s); pedindo correção`);
    html = bloco((await ia(sis, promptCorrecao(html, erros))).text, "html");
  }
  await c.log("Renderizando…");
  const bruto = join(pasta, "bruto.mp4"), leve = join(pasta, "previa.mp4");
  const r = await hyperframes(["render", pasta, "-o", bruto, "-q", "draft", "-f", "24", "--quiet"], { cwd: pasta, timeoutMs: 900_000, signal: c.signal });
  if (r.code !== 0 || !existsSync(bruto)) throw new Error(`Falha no render: ${(r.err || r.out).trim().split("\n").at(-1) ?? r.code}`);
  const f = await ffmpeg(["-y", "-i", bruto, "-an", "-vf", "scale=640:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", leve], { timeoutMs: 300_000 });
  if (f.code !== 0) throw new Error(`Falha ao comprimir a amostra: ${f.err.slice(-200)}`);
  const corpo = readFileSync(leve);
  const key = chavePreviaEstilo(chave);
  await r2Put(key, corpo, "video/mp4", corpo.byteLength);
  if (temDrive()) { await mkdir(dirname(caminhoDrive(key)), { recursive: true }); await writeFile(caminhoDrive(key), corpo); }
  await db()`update ads.estilos set previa_key = ${key}, previa_status = 'PRONTA', previa_erro = null, updated_at = now() where chave = ${chave}`;
  rmSync(pasta, { recursive: true, force: true });
  return { chave, key };
}

const pastaSegura = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "estilo";

async function copiarParaDrive(id: string, c: Ctx) {
  if (!temDrive()) { await c.log("Sem DRIVE_DIR no .env: nada para copiar"); return { copiados: 0 }; }
  const sql = db();
  const [e] = await sql<{ workspace_id: string; nome: string; referencias: string[] }[]>`select workspace_id, nome, referencias from ads.estilos where id = ${id}`;
  if (!e) return { copiados: 0 };
  const refs = await sql<{ id: string; name: string; r2_key: string }[]>`
    select id, name, r2_key from ads.creatives where id = any(${e.referencias}::uuid[]) and workspace_id = ${e.workspace_id} and r2_key is not null`;
  let n = 0;
  for (const r of refs) {
    const destino = caminhoDrive(`ads/workspaces/${e.workspace_id}/estilos/${pastaSegura(e.nome)}/${pastaSegura(r.name)}`);
    if (existsSync(destino)) continue;
    const resp = await fetch(await r2Presign(r.r2_key, "GET", 900), { signal: c.signal });
    if (!resp.ok) { await c.log(`não baixou ${r.name}: R2 ${resp.status}`); continue; }
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, Buffer.from(await resp.arrayBuffer()));
    n++;
  }
  await c.log(`${n} referência(s) copiada(s) para o Drive`);
  return { copiados: n };
}

export async function runEstilos(p: EstilosPayload, c: Ctx) {
  if (p.acao === "drive") return copiarParaDrive(p.id, c);
  try {
    return await renderizarPrevia(p.chave, c);
  } catch (e) {
    await db()`update ads.estilos set previa_status = 'FALHOU', previa_erro = ${(e as Error).message.slice(0, 500)}, updated_at = now() where chave = ${p.chave}`;
    throw e;
  }
}
