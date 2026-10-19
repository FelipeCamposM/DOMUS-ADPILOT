import { lookup } from "node:dns/promises";
import { readFile, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { basename, dirname, join } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { acharChrome } from "./qa";
import { FFMPEG, FFPROBE, rodar } from "./tools";

/**
 * Referências visuais a partir de links (site, post ou perfil do Instagram) e de imagens: o worker baixa as fotos para a
 * pasta do projeto e extrai a paleta (CSS do site + cores predominantes das fotos). A IA não acessa a internet: só vê o
 * que chega na pasta. Toda busca passa por buscarSeguro (nada de rede local, a cada redirecionamento).
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
// o Instagram só entrega título, descrição e og:image (foto do post ou do perfil) para robôs de prévia de link
const UA_PREVIA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const UA_CEL = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAX_FOTOS = 6;

/** Endereços que um link enviado pelo usuário nunca pode alcançar a partir do PC do worker (SSRF). */
export function privado(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const v4 = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return v4 ? privado(v4) : false;
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** GET de endereço público: só http(s), até 3 redirecionamentos (todos checados) e no máximo `max` bytes. */
export async function buscarSeguro(url: string, o: { accept: string; max: number; ua?: string }): Promise<{ url: URL; tipo: string; corpo: Buffer; cortado: boolean }> {
  let atual = new URL(url);
  for (let i = 0; i < 4; i++) {
    if (!/^https?:$/.test(atual.protocol)) throw new Error("só http(s)");
    const ips = await lookup(atual.hostname, { all: true });
    if (!ips.length || ips.some((x) => privado(x.address))) throw new Error("endereço de rede local não é permitido");
    const r = await fetch(atual, { redirect: "manual", signal: AbortSignal.timeout(12_000), headers: { "User-Agent": o.ua ?? UA, Accept: o.accept } });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { atual = new URL(r.headers.get("location")!, atual); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { corpo, cortado } = await lerAte(r, o.max);
    return { url: atual, tipo: (r.headers.get("content-type") ?? "").toLowerCase(), corpo, cortado };
  }
  throw new Error("redirecionamentos demais");
}

async function lerAte(r: Response, max: number): Promise<{ corpo: Buffer; cortado: boolean }> {
  const leitor = r.body?.getReader();
  if (!leitor) return { corpo: Buffer.alloc(0), cortado: false };
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done || !value) break;
    partes.push(value);
    total += value.length;
    if (total >= max) { await leitor.cancel(); return { corpo: Buffer.concat(partes), cortado: true }; }
  }
  return { corpo: Buffer.concat(partes), cortado: false };
}

const ehInstagram = (u: URL) => /(^|\.)instagram\.com$/i.test(u.hostname);
const decodificar = (t: string) => t.replace(/&#(\d{1,6});/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]{1,6});/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Hex de 6 dígitos em minúsculas; aceita #abc, #aabbcc e rgb()/rgba() opacos. */
function normalizarCor(c: string): string | null {
  const h = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (h) return `#${(h.length === 3 ? [...h].map((x) => x + x).join("") : h).toLowerCase()}`;
  const m = c.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
  if (!m) return null;
  if (m[4] && parseFloat(m[4]) < (m[4].endsWith("%") ? 60 : 0.6)) return null; // quase transparente não é cor da marca
  return hex(Number(m[1]), Number(m[2]), Number(m[3]));
}

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const distancia = (a: string, b: string) => { const [x, y] = [rgb(a), rgb(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

/** Conta as cores escritas num CSS/HTML (hex e rgb) e devolve as mais usadas, sem quase-repetidas. */
export function coresDoTexto(css: string, max = 8): string[] {
  const n = new Map<string, number>();
  for (const m of css.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]{5,40}\)/gi)) {
    const c = normalizarCor(m[0]);
    if (c) n.set(c, (n.get(c) ?? 0) + 1);
  }
  return distintas([...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c), max);
}

function distintas(cores: string[], max: number, minimo = 40): string[] {
  const out: string[] = [];
  for (const c of cores) {
    if (out.length >= max) break;
    if (out.every((o) => distancia(o, c) > minimo)) out.push(c);
  }
  return out;
}

/** Garimpa o HTML: textos, fotos candidatas (og:image primeiro), folhas de estilo e cores. */
export function garimpar(html: string, base: URL) {
  const metas = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const at = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [m[1]!.toLowerCase(), decodificar(m[2]!)]));
    const k = (at.property || at.name || "").toLowerCase();
    if (k && at.content && !metas.has(k)) metas.set(k, at.content);
  }
  const abs = (u: string | undefined) => { try { return u ? new URL(decodificar(u.trim()), base).toString() : null; } catch { return null; } };
  const imagens: string[] = [];
  const add = (u: string | null) => { if (u && /^https?:/.test(u) && !/\.(svg|gif|ico)(\?|#|$)/i.test(u) && !imagens.includes(u)) imagens.push(u); };
  for (const k of ["og:image", "og:image:secure_url", "og:image:url", "twitter:image", "twitter:image:src"]) add(abs(metas.get(k)));
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const at = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [m[1]!.toLowerCase(), m[2]!]));
    // srcset: a última costuma ser a maior
    const srcset = (at.srcset || at["data-srcset"])?.split(",").map((x) => x.trim().split(/\s+/)[0]).filter(Boolean).pop();
    add(abs(srcset || at["data-src"] || at.src));
    if (imagens.length >= 24) break;
  }
  const folhas = [...html.matchAll(/<link\b[^>]*rel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi)]
    .map((m) => abs(m[0].match(/href=["']([^"']+)["']/i)?.[1])).filter((u): u is string => !!u).slice(0, 2);
  const estilos = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n") + [...html.matchAll(/style=["']([^"']+)["']/gi)].map((m) => m[1]).join(";");
  const tema = normalizarCor(metas.get("theme-color") ?? "");
  const limpo = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ");
  const texto = decodificar(limpo.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 2500);
  return {
    titulo: decodificar(html.match(/<title[^>]*>([^<]{1,200})/i)?.[1]?.trim() ?? "") || metas.get("og:title") || "",
    descricao: metas.get("description") || metas.get("og:description") || "",
    texto, imagens, folhas, estilos, tema,
  };
}

/** Cores predominantes de uma imagem (ffmpeg reduz para 64×64 e as cores são agrupadas). Vazio se não der para ler. */
export async function paletaDeImagem(arquivo: string, max = 5): Promise<string[]> {
  const raw = join(dirname(arquivo), `.pal-${basename(arquivo)}.rgb`);
  try {
    const r = await rodar(FFMPEG, ["-v", "error", "-y", "-i", arquivo, "-vf", "scale=64:64:flags=area", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", raw], { timeoutMs: 30_000 });
    if (r.code !== 0) return [];
    return quantizar(await readFile(raw), max);
  } catch {
    return [];
  } finally {
    await rm(raw, { force: true });
  }
}

/** Agrupa pixels RGB em caixas de 16 níveis por canal; as mais cheias viram a paleta (sem cores quase iguais). */
export function quantizar(px: Uint8Array, max = 5): string[] {
  const caixas = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 2 < px.length; i += 3) {
    const [r, g, b] = [px[i]!, px[i + 1]!, px[i + 2]!];
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const c = caixas.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++; c.r += r; c.g += g; c.b += b;
    caixas.set(k, c);
  }
  const total = px.length / 3;
  const ordem = [...caixas.values()].filter((c) => c.n / total >= 0.01).sort((a, b) => b.n - a.n).map((c) => hex(c.r / c.n, c.g / c.n, c.b / c.n));
  return distintas(ordem, max, 48);
}

const luz = (h: string) => { const [r, g, b] = rgb(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contraste = (a: string, b: string) => { const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p) as [number, number]; return (x + 0.05) / (y + 0.05); };
const saturacao = (h: string) => { const v = rgb(h); const mx = Math.max(...v), mn = Math.min(...v); return mx === 0 ? 0 : (mx - mn) / mx; };

/**
 * Ordena uma paleta extraída nos papéis dos modelos de vídeo: [fundo, destaque, texto, destaque 2].
 * Fundo: a primeira cor bem clara ou bem escura. Texto: a primeira legível sobre o fundo (ou branco/quase preto).
 * Destaques: as mais saturadas que ainda aparecem sobre o fundo.
 */
export function papeis(cores: string[]): string[] {
  if (!cores.length) return [];
  const bg = cores.find((c) => luz(c) < 0.06 || luz(c) > 0.8) ?? cores[0]!;
  const resto = cores.filter((c) => c !== bg);
  // texto: a cor da marca mais usada que já é legível sobre o fundo; senão branco ou quase preto
  const tx = resto.find((c) => contraste(c, bg) >= 4.5) ?? (contraste("#ffffff", bg) >= contraste("#111111", bg) ? "#ffffff" : "#111111");
  const destaques = resto.filter((c) => c !== tx && contraste(c, bg) >= 1.8).sort((a, b) => saturacao(b) - saturacao(a));
  return [bg, destaques[0] ?? tx, tx, destaques[1] ?? destaques[0] ?? tx];
}

export interface Referencia { url: string; titulo: string; texto: string; fotos: { arquivo: string; dim: string; cores: string[] }[]; prints: { arquivo: string; dim: string; tela: string }[]; coresSite: string[]; aviso?: string }

/** Lê um link: textos, até 6 fotos (salvas em `dir` como `<prefixo>-N.ext`) com a paleta de cada uma, e as cores do site. */
export async function lerReferencia(url: string, dir: string, prefixo: string): Promise<Referencia> {
  const u = new URL(url);
  const ig = ehInstagram(u);
  const pag = await buscarSeguro(url, { accept: "text/html,application/xhtml+xml", max: 2_000_000, ua: ig ? UA_PREVIA : undefined });
  const g = garimpar(pag.corpo.toString("utf8"), pag.url);
  const css = ig ? "" : (await Promise.all(g.folhas.map((f) => buscarSeguro(f, { accept: "text/css", max: 800_000 }).then((r) => r.corpo.toString("utf8"), () => "")))).join("\n");
  const coresSite = ig ? [] : distintas([...(g.tema ? [g.tema] : []), ...coresDoTexto(`${g.estilos}\n${css}`, 10)], 8);

  const fotos: Referencia["fotos"] = [];
  for (const src of g.imagens) {
    if (fotos.length >= MAX_FOTOS) break;
    try {
      const r = await buscarSeguro(src, { accept: "image/avif,image/webp,image/png,image/jpeg,image/*", max: 10_000_000, ua: ig ? UA_PREVIA : undefined });
      const ext = r.tipo.match(/image\/(jpe?g|png|webp|avif)/)?.[1]?.replace("jpeg", "jpg");
      if (!ext || r.cortado || r.corpo.length < 8_000) continue; // ícones, pixels de rastreio e arquivos enormes ficam de fora
      const nome = `${prefixo}-${fotos.length + 1}.${ext}`;
      const destino = join(dir, nome);
      await writeFile(destino, r.corpo);
      const d = await rodar(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", destino]);
      const [w, h] = d.out.trim().split("x").map(Number) as [number, number];
      if (!w || !h || Math.min(w, h) < 200) { await rm(destino, { force: true }); continue; }
      fotos.push({ arquivo: nome, dim: `${w}x${h}`, cores: await paletaDeImagem(destino) });
    } catch {
      // foto que não baixa não impede as outras
    }
  }
  const prints = ig ? [] : await printsDaPagina(pag.url.href, dir, prefixo).catch(() => []);
  return {
    url, titulo: g.titulo, coresSite, fotos, prints,
    texto: [g.descricao && `Descrição: ${g.descricao}`, !ig && g.texto && `Texto: ${g.texto}`].filter(Boolean).join("\n"),
    aviso: ig && /instagram\.com\/[^/]+\/?$/.test(u.href) && !/\/(p|reel)\//.test(u.pathname)
      ? "perfil do Instagram: sem login vêm só a bio e miniaturas pequenas dos últimos posts (boas para tirar a paleta, fracas para usar na arte). Para fotos grandes, cole links de posts (instagram.com/p/…) ou envie as imagens."
      : undefined,
  };
}

/** Prints reais da página no Chrome sem cabeça: computador 1440×900, celular 390×844 @2x e o celular rolando (até 3 telas). Toda requisição da página passa pelo filtro de rede local. */
async function printsDaPagina(url: string, dir: string, prefixo: string): Promise<Referencia["prints"]> {
  const chrome = acharChrome();
  if (!chrome) return [];
  const hosts = new Map<string, Promise<boolean>>();
  const publico = (h: string) => {
    if (!hosts.has(h)) hosts.set(h, lookup(h, { all: true }).then((ips) => ips.length > 0 && !ips.some((x) => privado(x.address)), () => false));
    return hosts.get(h)!;
  };
  const b = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--hide-scrollbars", "--mute-audio"] });
  const out: Referencia["prints"] = [];
  const abrir = async (page: Page, w: number, h: number, cel: boolean) => {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: cel ? 2 : 1, isMobile: cel, hasTouch: cel });
    await page.setUserAgent({ userAgent: cel ? UA_CEL : UA });
    // site com conexão sempre aberta (chat, analytics) nunca fica "ocioso": segue com o que carregou
    await page.goto(url, { waitUntil: "networkidle2", timeout: 25_000 }).catch(() => {});
    // rola até o fim (até 6000 px) para carregar imagens preguiçosas e animações de entrada, e volta ao topo
    await page.evaluate(async () => {
      for (let y = 0; y < Math.min(document.body.scrollHeight, 6000); y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); }
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 1500));
  };
  const salvar = async (page: Page, nome: string, tela: string, w: number, h: number, escala: number) => {
    const arquivo = `${prefixo}-print-${nome}.png`;
    await writeFile(join(dir, arquivo), await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h }, captureBeyondViewport: true }));
    out.push({ arquivo, dim: `${w * escala}x${h * escala}`, tela });
  };
  try {
    const page = await b.newPage();
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.protocol === "data:" || u.protocol === "blob:") return void r.continue();
      if (!/^https?:$/.test(u.protocol)) return void r.abort();
      void publico(u.hostname).then((ok) => (ok ? r.continue() : r.abort()), () => r.abort());
    });
    await abrir(page, 1440, 900, false);
    await salvar(page, "computador", "computador, primeira tela", 1440, 900, 1);
    await abrir(page, 390, 844, true);
    await salvar(page, "celular", "celular, primeira tela", 390, 844, 2);
    const altura = await page.evaluate(() => document.documentElement.scrollHeight);
    if (altura > 844 * 1.5) await salvar(page, "celular-rolando", "celular, página rolando (até 3 telas)", 390, Math.min(altura, 844 * 3), 2);
  } finally {
    await b.close();
  }
  return out;
}

// sem https: só domínios com TLD conhecido (evita "Node.js", "logo.png"); e-mail e @perfil ficam de fora
const LINK = /https?:\/\/[^\s<>"'`)\]]+|(?<![@\w./-])(?:[a-z0-9-]+\.)+(?:com|net|org|io|app|dev|site|online|store|shop|tech|ai|br)\b(?:\/[^\s<>"'`)\]]*)?/gi;

/** Até 5 links escritos no meio de um texto (ex.: nas orientações), com ou sem https:// ("castilhoadvogados.adv.br"). */
export const linksDoTexto = (t: string) =>
  [...new Set([...t.matchAll(LINK)].map((m) => m[0].replace(/[.,;:!?]+$/, "")).map((u) => (/^https?:/i.test(u) ? u : `https://${u}`)))].slice(0, 5);
