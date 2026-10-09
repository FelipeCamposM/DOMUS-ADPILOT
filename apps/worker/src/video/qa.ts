import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

/**
 * CONTROLE DE QUALIDADE da composição, antes do render: abre o index.html no Chrome headless, percorre o timeline
 * (a cada 0,2 s) e MEDE o texto de verdade na tela:
 *  - texto saindo do quadro (ou, no vertical, entrando na faixa da interface do Reels/Stories);
 *  - textos se sobrepondo;
 *  - texto que fica pouco tempo para ser lido (mínimo por número de palavras).
 * Só conta o que persiste por 2 amostras seguidas (ignora o meio de uma entrada/saída).
 */
export async function revisarComposicao(pasta: string, o: { w: number; h: number; total: number }): Promise<string[]> {
  const chrome = acharChrome();
  if (!chrome) return []; // sem Chrome conhecido: não trava o vídeo (o lint já passou)
  const b = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--allow-file-access-from-files", "--disable-web-security", "--hide-scrollbars"] });
  try {
    const pg = await b.newPage();
    await pg.setViewport({ width: o.w, height: o.h });
    await pg.goto(pathToFileURL(join(pasta, "index.html")).href, { waitUntil: "networkidle0", timeout: 60_000 });
    await pg.waitForFunction(() => !!(window as unknown as { __timelines?: Record<string, unknown> }).__timelines?.main, { timeout: 20_000 });
    await pg.evaluate(() => document.fonts.ready.then(() => new Promise((ok) => setTimeout(ok, 300))));
    // o tsx/esbuild embrulha funções com __name(...) para preservar nomes; a página precisa dessa função também
    await pg.evaluate("window.__name = window.__name || ((f) => f)");
    return await pg.evaluate(medir, o.w, o.h, o.total);
  } finally {
    await b.close();
  }
}

/** Roda DENTRO do navegador (serializada pelo puppeteer): nada de imports aqui. */
function medir(W: number, H: number, T: number): string[] {
  type Tl = { seek: (t: number, s?: boolean) => void };
  const tl = (window as unknown as { __timelines: Record<string, Tl> }).__timelines.main!;
  const vertical = H / W > 1.2;
  const raiz = document.getElementById("root") ?? document.body;
  // unidade de leitura: o bloco que contém o texto (título inteiro, item, legenda), não cada palavra solta
  const unidade = (e: Element): HTMLElement => {
    let x = e as HTMLElement;
    while (x.parentElement && x.parentElement !== raiz && getComputedStyle(x).display.startsWith("inline")) x = x.parentElement;
    return x;
  };
  const unidades = new Set<HTMLElement>();
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim()) continue;
    const pai = n.parentElement;
    if (!pai || pai.closest("script,style,.hud,.mk-hud,.cabecalho,.deco,.mk-marquee,[data-deco]")) continue; // moldura e faixas decorativas
    unidades.add(unidade(pai));
  }
  const lista = [...unidades].filter((u) => ![...unidades].some((o) => o !== u && o.contains(u)));
  let agora = 0;
  // como a HyperFrames: um clip só existe dentro da janela data-start … data-start + data-duration
  const foraDoClip = (x: HTMLElement) => {
    if (!x.classList.contains("clip") || !x.hasAttribute("data-start")) return false;
    const ini = parseFloat(x.getAttribute("data-start") || "0"), dur = parseFloat(x.getAttribute("data-duration") || "0");
    return dur > 0 && (agora < ini - 1e-6 || agora >= ini + dur - 1e-6);
  };
  const opac = (e: HTMLElement) => {
    let v = 1;
    for (let x: HTMLElement | null = e; x && x !== document.body; x = x.parentElement) {
      if (foraDoClip(x)) return 0;
      const cs = getComputedStyle(x);
      if (cs.display === "none" || cs.visibility === "hidden") return 0;
      v *= parseFloat(cs.opacity || "1");
    }
    return v;
  };
  const nome = (e: HTMLElement) => {
    const t = (e.children.length > 1 ? [...e.children].map((c) => c.textContent?.trim() ?? "").join(" ") : e.textContent ?? "").trim().replace(/\s+/g, " "); return t.length > 40 ? `${t.slice(0, 40)}…` : t; };
  const fmt = (t: number) => `${t.toFixed(1).replace(".", ",")} s`;

  const fora = new Map<HTMLElement, number>(), sobre = new Map<string, number>();
  const problemas: string[] = [];
  const corrida = new Map<HTMLElement, { ini: number; max: number }>();
  const PASSO = 0.2;
  for (let t = 0; t <= T + 1e-6; t += PASSO) {
    agora = t;
    tl.seek(t, false);
    const vis: { e: HTMLElement; r: DOMRect }[] = [];
    for (const e of lista) {
      const op = opac(e);
      const r = e.getBoundingClientRect();
      // tempo de leitura: maior trecho contínuo bem visível
      const c = corrida.get(e) ?? { ini: -1, max: 0 };
      if (op > 0.85 && r.width > 0) { if (c.ini < 0) c.ini = t; c.max = Math.max(c.max, t - c.ini + PASSO); }
      else c.ini = -1;
      corrida.set(e, c);
      if (op < 0.6 || r.width < 2 || r.height < 2) { fora.delete(e); continue; }
      vis.push({ e, r });
      const margemV = vertical ? { t: H * 0.06, b: H * 0.08 } : { t: 0, b: 0 };
      const saiu = r.left < -2 || r.right > W + 2 || r.top < margemV.t - 2 || r.bottom > H - margemV.b + 2;
      if (saiu) {
        const n = (fora.get(e) ?? 0) + 1; fora.set(e, n);
        if (n === 2) problemas.push(`Texto “${nome(e)}” sai do quadro${vertical ? " ou entra na faixa da interface do Reels" : ""} em ${fmt(t)} (caixa ${Math.round(r.left)},${Math.round(r.top)} até ${Math.round(r.right)},${Math.round(r.bottom)} num quadro ${W}×${H})`);
      } else fora.delete(e);
    }
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i]!, b = vis[j]!;
      const ix = Math.max(0, Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)), iy = Math.max(0, Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top));
      const menor = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
      const chave = `${lista.indexOf(a.e)}-${lista.indexOf(b.e)}`;
      if (menor > 0 && (ix * iy) / menor > 0.25) {
        const n = (sobre.get(chave) ?? 0) + 1; sobre.set(chave, n);
        if (n === 2) problemas.push(`Textos sobrepostos em ${fmt(t)}: “${nome(a.e)}” e “${nome(b.e)}”`);
      } else sobre.delete(chave);
    }
  }
  for (const [e, c] of corrida) {
    if (c.max <= 0) continue;
    const palavras = (e.innerText || "").trim().split(/\s+/).filter(Boolean).length;
    const legenda = !!e.closest(".leg");
    const minimo = legenda ? 0.7 : Math.min(3, Math.max(1, 0.25 * palavras + 0.5));
    const terminouNoFim = c.ini >= 0; // ainda visível no último quadro: não é "curto demais"
    if (!terminouNoFim && palavras >= 2 && c.max + 0.05 < minimo) problemas.push(`Texto “${nome(e)}” fica só ${fmt(c.max)} visível (mínimo para ler: ${fmt(minimo)})`);
  }
  return [...new Set(problemas)].slice(0, 10);
}

/** Chrome do worker: CHROME_PATH, ou o headless-shell que a HyperFrames/Puppeteer já baixou. */
export function acharChrome(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const bases = [join(homedir(), ".cache", "hyperframes", "chrome", "chrome-headless-shell"), join(homedir(), ".cache", "puppeteer", "chrome-headless-shell")];
  for (const base of bases) {
    if (!existsSync(base)) continue;
    const versoes = readdirSync(base).sort().reverse();
    for (const v of versoes) {
      const sub = readdirSync(join(base, v)).find((d) => d.startsWith("chrome-headless-shell"));
      const exe = sub && [join(base, v, sub, "chrome-headless-shell.exe"), join(base, v, sub, "chrome-headless-shell")].find(existsSync);
      if (exe) return exe;
    }
  }
  return null;
}
