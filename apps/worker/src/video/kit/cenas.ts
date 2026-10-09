import type { Brand, Brief, EstiloVisual, Storyboard } from "@domus-ads/core";

/**
 * MONTADOR DE CENAS PRONTAS: transforma o storyboard aprovado em composição HyperFrames, sem IA.
 * Cada tipo de cena (abertura, título, lista, número, comparação, produto, citação, CTA) tem layout fixo e testado;
 * o estilo (HUD, clay, editorial) troca a pele e o movimento. O runtime (cenas-runtime.ts) encaixa o texto na área
 * segura e anima. Resultado: qualidade constante, nada saindo da tela e tempo de leitura garantido.
 */
type Cena = Storyboard["scenes"][number];
type Estilo = Exclude<EstiloVisual, "livre">;

interface Paleta { bg: string; a: string; a2: string; a3: string; tx: string; ft: string; fb: string; fm: string }
const PADRAO: Record<Estilo, Paleta> = {
  hud: { bg: "#07070A", a: "#A855FF", a2: "#22D3EE", a3: "#F472B6", tx: "#FAFAFC", ft: "Space Grotesk", fb: "Inter", fm: "JetBrains Mono" },
  clay: { bg: "#EFE9FF", a: "#8B5CF6", a2: "#FF9EC4", a3: "#7DD3FC", tx: "#2B2341", ft: "Fredoka", fb: "Nunito", fm: "Nunito" },
  editorial: { bg: "#F2EEE6", a: "#C2410C", a2: "#1F2937", a3: "#9A8F7F", tx: "#161412", ft: "Playfair Display", fb: "Inter", fm: "IBM Plex Mono" },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const limpa = (w: string) => w.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");

/** Headline palavra a palavra (para a animação), com as palavras de destaque marcadas. */
function palavras(texto: string, destaque: string[] = []): string {
  const hl = new Set(destaque.flatMap((d) => d.split(/\s+/)).map(limpa).filter(Boolean));
  return texto.trim().split(/\s+/).map((w) => `<span class="w"><span class="wi${hl.has(limpa(w)) ? " hl" : ""}">${esc(w)}</span></span>`).join(" ");
}

const ICONE_OK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
const ICONE_X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

function conteudo(c: Cena, i: number, est: Estilo, ctx: { rotulo: string; cta: string; logo: string | null; assets: Set<string>; deitado: boolean }): { html: string; deco: string } {
  const tit = (cls: string) => `<h2 class="${cls}" data-a="titulo">${palavras(c.headline, c.destaque)}</h2>`;
  const sub = c.subtext?.trim() ? `<p class="t-sub" data-a="sub">${esc(c.subtext)}</p>` : "";
  const deco = est === "hud" ? `<div class="anel deco"></div><div class="anel anel2 deco"></div>` : est === "clay" ? `<div class="massa deco"></div><div class="massa massa2 deco"></div>` : "";
  switch (c.tipo ?? (i === 0 ? "abertura" : "titulo")) {
    case "abertura":
      return { deco, html: `<div class="kicker" data-a="kicker">${esc(ctx.rotulo)}</div>${est === "editorial" ? `<div class="regua deco"></div>` : ""}${tit("t-display")}${sub}` };
    case "lista": {
      const itens = (c.itens ?? []).slice(0, 4).map((t, n) => `<li data-a="item"><span class="marca">${est === "editorial" ? String(n + 1).padStart(2, "0") : ICONE_OK}</span><span>${esc(t)}</span></li>`).join("");
      return { deco: est === "clay" ? `<div class="massa massa2 deco"></div>` : "", html: `${tit("t-h2")}<ul class="lista">${itens}</ul>` };
    }
    case "numero": {
      const n = c.numero ?? { valor: 0, prefixo: "", sufixo: "", casas: 0 };
      return { deco, html: `<div class="numero" data-a="numero" data-valor="${n.valor}" data-casas="${n.casas}" data-pre="${esc(n.prefixo)}" data-suf="${esc(n.sufixo)}"><span class="num-v">${esc(n.prefixo)}0${esc(n.sufixo)}</span></div>${tit("t-h2")}${sub}` };
    }
    case "comparacao": {
      const [ruim = "", bom = "", rotRuim = "Antes", rotBom = "Depois"] = c.itens ?? [];
      const card = (cls: string, rot: string, txt: string, ic: string) => `<div class="card ${cls}" data-a="card"><span class="card-rot"><i>${ic}</i>${esc(rot)}</span><p>${esc(txt)}</p></div>`;
      return { deco: "", html: `${tit("t-h2")}<div class="duo${ctx.deitado ? " duo-lado" : ""}">${card("ruim", rotRuim, ruim, ICONE_X)}${card("bom", rotBom, bom, ICONE_OK)}</div>` };
    }
    case "produto": {
      const img = c.asset && ctx.assets.has(c.asset) ? `<img src="${esc(c.asset)}" alt="">` : `<div class="esqueleto"><i></i><i></i><i class="curto"></i><b></b><b></b><b></b></div>`;
      const mock = `<div class="mock ${ctx.deitado ? "mock-nav" : "mock-cel"}" data-a="mock"><div class="mock-tela">${img}</div></div>`;
      return { deco: est === "clay" ? `<div class="massa deco"></div>` : "", html: ctx.deitado ? `<div class="lado">${mock}<div class="lado-txt">${tit("t-h2")}${sub}</div></div>` : `${mock}${tit("t-h2")}${sub}` };
    }
    case "citacao":
      return { deco: "", html: `<div class="aspas" data-a="quote">“</div><blockquote class="t-quote" data-a="titulo">${palavras(c.headline, c.destaque)}</blockquote>${c.subtext?.trim() ? `<p class="t-sub autor" data-a="sub">${esc(c.subtext)}</p>` : ""}` };
    case "cta": {
      const botao = (c.itens?.[0] ?? ctx.cta) || "Saiba mais";
      return { deco, html: `${ctx.logo ? `<img class="logo" data-a="logo" src="${esc(ctx.logo)}" alt="">` : ""}${tit("t-h1")}${sub}<div class="botao" data-a="cta"><span>${esc(botao)}</span><i class="brilho"></i></div>` };
    }
    default: // titulo
      return { deco, html: `${tit("t-h1")}${sub}` };
  }
}

/** Legenda em blocos curtos (até 5 palavras), cada bloco no ar durante a fala dele; palavras acendem com a voz. */
export function blocosLegenda(c: Cena): { s: number; e: number; txt: string[]; p: number[] }[] {
  const texto = c.narration?.trim();
  if (!texto) return [];
  const ws = texto.split(/\s+/);
  let tempos: number[];
  if (c.words?.length) tempos = ws.map((_, i) => c.words![Math.min(i, c.words!.length - 1)]!.start);
  else {
    const ini = c.start + 0.25, dur = Math.max(0.8, (c.fala ?? c.end - c.start - 0.85));
    const pesos = ws.map((w) => 0.6 + w.length * 0.12), soma = pesos.reduce((a, b) => a + b, 0);
    let acc = 0;
    tempos = pesos.map((p) => { const t = ini + (acc / soma) * dur; acc += p; return +t.toFixed(3); });
  }
  const blocos: { i: number; f: number }[] = [];
  let ini = 0;
  ws.forEach((w, i) => {
    const n = i - ini + 1, chars = ws.slice(ini, i + 1).join(" ").length;
    if (i === ws.length - 1 || n >= 5 || chars >= 30 || (n >= 2 && /[.,!?;:]$/.test(w))) { blocos.push({ i: ini, f: i }); ini = i + 1; }
  });
  // junta blocos curtos demais para ler (< 0,8 s) com o seguinte, se couber
  for (let k = 0; k < blocos.length - 1; k++) {
    const b = blocos[k]!, prox = blocos[k + 1]!;
    if (tempos[prox.i]! - tempos[b.i]! < 0.8 && prox.f - b.i < 7) { b.f = prox.f; blocos.splice(k + 1, 1); k--; }
  }
  const fimFala = (c.fala ? c.start + 0.25 + c.fala : c.end - 0.3);
  return blocos.map((b, k) => {
    const s = tempos[b.i]!;
    const e = k < blocos.length - 1 ? tempos[blocos[k + 1]!.i]! : Math.min(c.end - 0.12, Math.max(fimFala + 0.35, s + 1));
    return { s: +s.toFixed(3), e: +Math.max(e, s + 0.5).toFixed(3), txt: ws.slice(b.i, b.f + 1), p: tempos.slice(b.i, b.f + 1) };
  });
}

export function montarComposicao(o: { sb: Storyboard; brief: Brief; brand: Brand; w: number; h: number; assets: string[]; rotulo: string }): string {
  const est = (o.brief.estiloVisual === "livre" ? "hud" : o.brief.estiloVisual) as Estilo;
  const pad = PADRAO[est];
  const cores = o.brand.cores.map((c) => c.hex);
  const P: Paleta = { ...pad, bg: cores[0] ?? pad.bg, a: cores[1] ?? pad.a, tx: cores[2] ?? pad.tx, a2: cores[3] ?? pad.a2, ft: o.brand.fonteTitulo || pad.ft, fb: o.brand.fonteTexto || pad.fb };
  const { w, h, sb } = o;
  const vertical = h / w > 1.2, deitado = w / h > 1.2;
  const u = Math.min(w, h) / 100;
  // área segura: no vertical, livre a interface do Reels/Stories em cima e embaixo
  const seg = vertical ? { x: w * 0.08, t: h * 0.12, b: h * 0.15 } : deitado ? { x: w * 0.07, t: h * 0.1, b: h * 0.1 } : { x: w * 0.08, t: h * 0.08, b: h * 0.09 };
  const assets = new Set(o.assets.map((a) => `assets/${a}`));
  const logo = o.assets.find((a) => a.startsWith("logo.")) ?? null;
  const ctx = { rotulo: o.rotulo, cta: o.brief.cta, logo: logo ? `assets/${logo}` : null, assets, deitado };
  const legendas = o.brief.legendas && o.brief.voz !== "none";

  const dados = { w, h, total: sb.duration, estilo: est, rotulo: o.rotulo, semente: 7 + sb.scenes.length, cenas: [] as { s: number; e: number; leg: { s: number; e: number; p: number[] }[] }[] };
  const secoes = sb.scenes.map((c, i) => {
    const { html, deco } = conteudo(c, i, est, ctx);
    const leg = legendas ? blocosLegenda(c) : [];
    dados.cenas.push({ s: c.start, e: c.end, leg: leg.map(({ s, e, p }) => ({ s, e, p })) });
    const legHtml = leg.map((b, n) => `<div class="leg" id="c${i}-l${n}">${b.txt.map((t) => `<span>${esc(t)}</span>`).join(" ")}</div>`).join("");
    return `<section id="c${i}" class="clip cena tipo-${c.tipo ?? "titulo"}" data-start="${c.start}" data-duration="${+(c.end - c.start).toFixed(2)}" data-track-index="0">
  <div class="camera">${deco}<div class="area"><div class="conteudo">${html}</div>${legendas ? `<div class="legenda">${legHtml}</div>` : ""}</div></div>
</section>`;
  }).join("\n");

  const familias = [...new Set([P.ft, P.fb, P.fm])].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500`).join("&");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${w}, height=${h}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${familias}&display=block" rel="stylesheet">
<style>
html,body,#root{width:${w}px;height:${h}px}
:root{--bg:${P.bg};--a:${P.a};--a2:${P.a2};--a3:${P.a3};--tx:${P.tx};--ft:'${P.ft}';--fb:'${P.fb}';--fm:'${P.fm}';--u:${u}px;--sx:${seg.x}px;--st:${seg.t}px;--sb:${seg.b}px}
${CSS_BASE}
${CSS_ESTILO[est]}
</style>
</head>
<body class="estilo-${est}${vertical ? " vertical" : deitado ? " deitado" : ""}">
<div id="root" data-composition-id="main" data-start="0" data-duration="${sb.duration}" data-width="${w}" data-height="${h}">
${secoes}
</div>
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<script src="assets/cenas.js"></script>
<script>
const tl = C.init(${JSON.stringify(dados)});
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
</script>
</body>
</html>`;
}

const CSS_BASE = `
html,body{margin:0;padding:0;overflow:hidden;background:var(--bg)}
#root{position:relative;width:100vw;height:100vh;overflow:hidden;background:var(--bg);color:var(--tx);font-family:var(--fb),system-ui,sans-serif;-webkit-font-smoothing:antialiased;perspective:calc(var(--u)*150)}
.clip{position:absolute;inset:0}
.fundo{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.cena{z-index:2}
.camera{position:absolute;inset:0;transform-style:preserve-3d}
.area{position:absolute;left:var(--sx);right:var(--sx);top:var(--st);bottom:var(--sb);display:flex;flex-direction:column;gap:calc(var(--u)*2)}
.conteudo{--k:1;flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:calc(var(--u)*2.8*var(--k))}
.conteudo>*{flex-shrink:0;max-width:100%}
.legenda{position:relative;flex:none;height:calc(var(--u)*13)}
.leg{position:absolute;left:0;right:0;bottom:0;margin:0 auto;width:max-content;max-width:100%;text-align:center;font-weight:700;font-size:calc(var(--u)*4.4);line-height:1.2;visibility:hidden;white-space:nowrap}
.leg span{color:color-mix(in srgb,var(--a) calc(var(--on,0)*100%),currentColor)}
h1,h2,p,blockquote,ul{margin:0}
.w{display:inline-block}.wi{display:inline-block}
.t-display,.t-h1,.t-h2,.t-quote{font-family:var(--ft),system-ui,sans-serif;text-wrap:balance;overflow-wrap:normal}
.t-display{font-size:calc(var(--u)*13*var(--k));line-height:.98;font-weight:700;letter-spacing:-.035em}
.t-h1{font-size:calc(var(--u)*10*var(--k));line-height:1.02;font-weight:700;letter-spacing:-.03em}
.t-h2{font-size:calc(var(--u)*7.4*var(--k));line-height:1.08;font-weight:700;letter-spacing:-.025em}
.t-sub{font-size:calc(var(--u)*3.9*var(--k));line-height:1.38;opacity:.82;max-width:92%;text-wrap:pretty}
.t-quote{font-size:calc(var(--u)*7.2*var(--k));line-height:1.14;font-weight:600}
.kicker{font-family:var(--fm),ui-monospace,monospace;font-size:calc(var(--u)*2.5*var(--k));letter-spacing:.2em;text-transform:uppercase;color:var(--a);font-weight:600}
.hl{color:color-mix(in srgb,var(--a) calc(var(--hl,1)*100%),var(--tx))}
.lista{list-style:none;padding:0;display:flex;flex-direction:column;gap:calc(var(--u)*2*var(--k));width:100%;text-align:left}
.lista li{display:flex;align-items:center;gap:calc(var(--u)*2.4*var(--k));font-size:calc(var(--u)*4.6*var(--k));font-weight:600;line-height:1.25}
.marca{flex:none;display:grid;place-items:center;width:calc(var(--u)*7*var(--k));height:calc(var(--u)*7*var(--k))}
.marca svg{width:55%;height:55%}
.numero{font-family:var(--ft),system-ui,sans-serif;font-weight:800;font-size:calc(var(--u)*24*var(--k));line-height:.9;letter-spacing:-.05em;color:var(--a);white-space:nowrap;font-variant-numeric:tabular-nums}
.duo{display:flex;flex-direction:column;gap:calc(var(--u)*2.4*var(--k));width:100%}
.duo-lado{flex-direction:row}
.card{flex:1;text-align:left;padding:calc(var(--u)*3.4*var(--k));border-radius:calc(var(--u)*3)}
.card p{font-size:calc(var(--u)*4.4*var(--k));line-height:1.3;font-weight:600;margin-top:calc(var(--u)*1.2*var(--k))}
.card-rot{display:inline-flex;align-items:center;gap:calc(var(--u)*1.2);font-size:calc(var(--u)*2.5*var(--k));letter-spacing:.14em;text-transform:uppercase;font-weight:700}
.card-rot i{display:grid;place-items:center;width:calc(var(--u)*4.4*var(--k));height:calc(var(--u)*4.4*var(--k));border-radius:50%}
.card-rot svg{width:60%;height:60%}
.mock{position:relative}
.mock-cel{width:calc(var(--u)*46*var(--k));aspect-ratio:9/17;border-radius:calc(var(--u)*6);padding:calc(var(--u)*1.6)}
.mock-nav{width:calc(var(--u)*80*var(--k));aspect-ratio:16/10;border-radius:calc(var(--u)*2.4);padding:calc(var(--u)*3.2) calc(var(--u)*1.2) calc(var(--u)*1.2)}
.mock-tela{width:100%;height:100%;border-radius:calc(var(--u)*4.4);overflow:hidden;position:relative}
.mock-nav .mock-tela{border-radius:calc(var(--u)*1.2)}
.mock-tela img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.esqueleto{position:absolute;inset:0;padding:12%;display:flex;flex-direction:column;gap:7%}
.esqueleto i{display:block;height:6%;border-radius:99px;opacity:.5}.esqueleto i.curto{width:60%}
.esqueleto b{display:block;flex:1;border-radius:calc(var(--u)*2);opacity:.35}
.lado{display:flex;align-items:center;gap:calc(var(--u)*6);width:100%}
.lado-txt{flex:1;display:flex;flex-direction:column;gap:calc(var(--u)*2.4*var(--k));text-align:left;align-items:flex-start}
.aspas{font-family:var(--ft),serif;font-size:calc(var(--u)*22*var(--k));line-height:.6;height:calc(var(--u)*9*var(--k));color:var(--a)}
.autor{font-weight:600;opacity:.75}
.logo{max-height:calc(var(--u)*12*var(--k));max-width:60%;object-fit:contain}
.botao{position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;padding:calc(var(--u)*2.8*var(--k)) calc(var(--u)*6.4*var(--k));border-radius:999px;font-weight:800;font-size:calc(var(--u)*4.6*var(--k));white-space:nowrap}
.brilho{position:absolute;top:-50%;bottom:-50%;width:30%;left:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);transform:skewX(-20deg)}
.deco{position:absolute;pointer-events:none}
`;

const CSS_ESTILO: Record<Estilo, string> = {
  hud: `
.blob{position:absolute;border-radius:50%;filter:blur(calc(var(--u)*10))}
.grade{position:absolute;inset:-6%;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:calc(var(--u)*6) calc(var(--u)*6);-webkit-mask-image:radial-gradient(ellipse 75% 65% at 50% 45%,#000 25%,transparent 78%);mask-image:radial-gradient(ellipse 75% 65% at 50% 45%,#000 25%,transparent 78%)}
.ponto{position:absolute;width:calc(var(--u)*.45);height:calc(var(--u)*.45);border-radius:50%;background:var(--a);box-shadow:0 0 calc(var(--u)*1.2) var(--a)}
.vinheta{position:absolute;inset:0;background:radial-gradient(ellipse 85% 75% at 50% 45%,transparent 45%,rgba(0,0,0,.7) 100%)}
.hud{position:absolute;inset:calc(var(--u)*3.4);z-index:40;pointer-events:none;font-family:var(--fm),monospace;font-size:calc(var(--u)*1.5);letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.5)}
.canto{position:absolute;width:calc(var(--u)*3.2);height:calc(var(--u)*3.2);border:0 solid color-mix(in srgb,var(--a) 75%,transparent)}
.c1{left:0;top:0;border-left-width:2px;border-top-width:2px}.c2{right:0;top:0;border-right-width:2px;border-top-width:2px}.c3{left:0;bottom:0;border-left-width:2px;border-bottom-width:2px}.c4{right:0;bottom:0;border-right-width:2px;border-bottom-width:2px}
.hud-rotulo{position:absolute;left:calc(var(--u)*4.4);top:calc(var(--u)*.7)}
.hud-prog{position:absolute;left:calc(var(--u)*4.4);right:calc(var(--u)*4.4);bottom:calc(var(--u)*1.2);height:2px;background:rgba(255,255,255,.08)}
.hud-prog i{display:block;height:100%;background:var(--a);transform-origin:left;box-shadow:0 0 calc(var(--u)*1.2) var(--a)}
.estilo-hud .w{overflow:hidden;vertical-align:bottom;padding-bottom:.12em;margin-bottom:-.12em}
.estilo-hud .hl{text-shadow:0 0 calc(var(--u)*2.4*var(--hl,1)) color-mix(in srgb,var(--a) 75%,transparent)}
.estilo-hud .t-sub{color:color-mix(in srgb,var(--tx) 80%,transparent)}
.estilo-hud .anel{left:50%;top:44%;width:calc(var(--u)*78);height:calc(var(--u)*78);margin:calc(var(--u)*-39) 0 0 calc(var(--u)*-39);border-radius:50%;border:1.5px dashed color-mix(in srgb,var(--a) 35%,transparent);z-index:-1}
.estilo-hud .anel2{width:calc(var(--u)*56);height:calc(var(--u)*56);margin:calc(var(--u)*-28) 0 0 calc(var(--u)*-28);border:2px solid color-mix(in srgb,var(--a2) 30%,transparent);border-left-color:transparent;border-right-color:transparent}
.estilo-hud .lista li,.estilo-hud .card{background:linear-gradient(160deg,color-mix(in srgb,var(--a) 14%,transparent),rgba(255,255,255,.03));border:1px solid color-mix(in srgb,var(--a) 45%,transparent);box-shadow:0 0 calc(var(--u)*4) color-mix(in srgb,var(--a) 18%,transparent),inset 0 1px 0 rgba(255,255,255,.1);border-radius:calc(var(--u)*2.4)}
.estilo-hud .lista li{padding:calc(var(--u)*2*var(--k)) calc(var(--u)*2.6*var(--k))}
.estilo-hud .marca{border-radius:calc(var(--u)*1.6);background:color-mix(in srgb,var(--a) 22%,transparent);color:var(--a2);box-shadow:0 0 calc(var(--u)*2) color-mix(in srgb,var(--a) 50%,transparent)}
.estilo-hud .numero{text-shadow:0 0 calc(var(--u)*5) color-mix(in srgb,var(--a) 70%,transparent)}
.estilo-hud .card.ruim{opacity:.85;filter:saturate(.4)}.estilo-hud .ruim .card-rot i{background:rgba(255,255,255,.12)}
.estilo-hud .bom .card-rot{color:var(--a2)}.estilo-hud .bom .card-rot i{background:color-mix(in srgb,var(--a2) 25%,transparent)}
.estilo-hud .mock{background:linear-gradient(160deg,#1c1c26,#0b0b10);border:1px solid color-mix(in srgb,var(--a) 50%,transparent);box-shadow:0 0 calc(var(--u)*6) color-mix(in srgb,var(--a) 35%,transparent),0 calc(var(--u)*4) calc(var(--u)*8) rgba(0,0,0,.6)}
.estilo-hud .mock-tela{background:#0d0d14}.estilo-hud .esqueleto i{background:var(--a)}.estilo-hud .esqueleto b{background:linear-gradient(160deg,var(--a),var(--a2))}
.estilo-hud .botao{background:var(--a);color:#fff;box-shadow:0 0 calc(var(--u)*6) color-mix(in srgb,var(--a) 70%,transparent),inset 0 1px 0 rgba(255,255,255,.3)}
.estilo-hud .leg{padding:calc(var(--u)*1.2) calc(var(--u)*2.6);border-radius:calc(var(--u)*1.6);background:rgba(8,8,12,.62);border:1px solid rgba(255,255,255,.08);color:#fff}
.estilo-hud .varre{position:absolute;top:-20%;bottom:-20%;left:0;width:40%;z-index:30;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--a) 40%,transparent),rgba(255,255,255,.35),color-mix(in srgb,var(--a) 40%,transparent),transparent);transform:skewX(-16deg);mix-blend-mode:screen;opacity:0}
`,
  clay: `
.bolha{position:absolute;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.95) 0 5%,transparent 26%),radial-gradient(circle at 38% 34%,color-mix(in srgb,var(--cor) 55%,#fff),var(--cor) 62%,color-mix(in srgb,var(--cor) 80%,#000) 100%);box-shadow:inset calc(var(--u)*-.9) calc(var(--u)*-1.3) calc(var(--u)*2.2) rgba(0,0,0,.16),inset calc(var(--u)*.7) calc(var(--u)*.9) calc(var(--u)*1.6) rgba(255,255,255,.65),0 calc(var(--u)*2.4) calc(var(--u)*4.4) rgba(70,40,140,.22)}
#root{background:radial-gradient(120% 90% at 30% 10%,color-mix(in srgb,var(--bg) 70%,#fff),var(--bg) 55%,color-mix(in srgb,var(--bg) 85%,var(--a)))}
.estilo-clay .t-display,.estilo-clay .t-h1,.estilo-clay .t-h2,.estilo-clay .t-quote{font-weight:700;letter-spacing:-.01em;text-shadow:0 .035em 0 color-mix(in srgb,var(--tx) 14%,transparent),0 .09em .12em color-mix(in srgb,var(--a) 25%,transparent)}
.estilo-clay .hl{color:var(--tx);background:color-mix(in srgb,var(--a2) calc(var(--hl,1)*70%),transparent);border-radius:.32em;padding:0 .14em;box-shadow:inset 0 -.06em .1em rgba(0,0,0,.08),inset 0 .06em .1em rgba(255,255,255,.6)}
.estilo-clay .kicker{font-family:var(--ft);letter-spacing:.08em;color:var(--a);background:color-mix(in srgb,#fff 70%,var(--bg));padding:calc(var(--u)*1) calc(var(--u)*2.6);border-radius:999px;box-shadow:calc(var(--u)*.6) calc(var(--u)*.9) calc(var(--u)*1.8) rgba(80,50,160,.18),inset 0 calc(var(--u)*.3) calc(var(--u)*.6) rgba(255,255,255,.9)}
.estilo-clay .massa{right:-8%;top:8%;width:calc(var(--u)*46);height:calc(var(--u)*46);border-radius:42% 58% 55% 45%/48% 42% 58% 52%;background:radial-gradient(circle at 34% 30%,color-mix(in srgb,var(--a) 45%,#fff),var(--a) 60%,color-mix(in srgb,var(--a) 75%,#000));box-shadow:inset calc(var(--u)*-1.6) calc(var(--u)*-2) calc(var(--u)*3.4) rgba(0,0,0,.2),inset calc(var(--u)*1.2) calc(var(--u)*1.4) calc(var(--u)*2.4) rgba(255,255,255,.55),0 calc(var(--u)*3) calc(var(--u)*6) rgba(70,40,140,.25);z-index:-1;opacity:.9}
.estilo-clay .massa2{left:-10%;right:auto;top:auto;bottom:6%;width:calc(var(--u)*34);height:calc(var(--u)*34);border-radius:55% 45% 40% 60%/50% 55% 45% 50%;background:radial-gradient(circle at 34% 30%,color-mix(in srgb,var(--a3) 45%,#fff),var(--a3) 60%,color-mix(in srgb,var(--a3) 75%,#000))}
.estilo-clay .lista li,.estilo-clay .card,.estilo-clay .mock{background:color-mix(in srgb,#fff 62%,var(--bg));border-radius:calc(var(--u)*4);box-shadow:calc(var(--u)*1.2) calc(var(--u)*1.8) calc(var(--u)*3.2) rgba(80,50,160,.2),inset calc(var(--u)*-.6) calc(var(--u)*-.9) calc(var(--u)*1.4) rgba(60,30,120,.08),inset calc(var(--u)*.6) calc(var(--u)*.9) calc(var(--u)*1.4) rgba(255,255,255,.95)}
.estilo-clay .lista li{padding:calc(var(--u)*2.2*var(--k)) calc(var(--u)*2.8*var(--k))}
.estilo-clay .marca{border-radius:50%;color:#fff;background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--a) 50%,#fff),var(--a) 65%);box-shadow:inset calc(var(--u)*-.4) calc(var(--u)*-.6) calc(var(--u)*1) rgba(0,0,0,.2),inset calc(var(--u)*.3) calc(var(--u)*.4) calc(var(--u)*.8) rgba(255,255,255,.6)}
.estilo-clay .numero{color:var(--a);text-shadow:0 .04em 0 color-mix(in srgb,var(--a) 60%,#000),0 .1em .14em rgba(70,40,140,.3)}
.estilo-clay .ruim .card-rot{color:color-mix(in srgb,var(--tx) 60%,transparent)}.estilo-clay .ruim .card-rot i{background:rgba(0,0,0,.08)}.estilo-clay .card.ruim p{opacity:.7}
.estilo-clay .bom .card-rot{color:var(--a)}.estilo-clay .bom .card-rot i{color:#fff;background:var(--a)}
.estilo-clay .mock{padding:calc(var(--u)*2)}.estilo-clay .mock-tela{background:color-mix(in srgb,var(--bg) 80%,#fff);box-shadow:inset 0 calc(var(--u)*.6) calc(var(--u)*1.4) rgba(60,30,120,.15)}
.estilo-clay .esqueleto i{background:var(--a)}.estilo-clay .esqueleto b{background:linear-gradient(160deg,var(--a2),var(--a3));opacity:.6}
.estilo-clay .botao{background:radial-gradient(120% 140% at 30% 20%,color-mix(in srgb,var(--a) 55%,#fff),var(--a) 60%);color:#fff;box-shadow:calc(var(--u)*.8) calc(var(--u)*1.4) calc(var(--u)*3) rgba(80,50,160,.35),inset calc(var(--u)*-.5) calc(var(--u)*-.8) calc(var(--u)*1.2) rgba(0,0,0,.2),inset calc(var(--u)*.5) calc(var(--u)*.8) calc(var(--u)*1.2) rgba(255,255,255,.55)}
.estilo-clay .aspas{color:var(--a2);text-shadow:0 .04em 0 rgba(0,0,0,.1)}
.estilo-clay .leg{padding:calc(var(--u)*1.3) calc(var(--u)*3);border-radius:999px;background:color-mix(in srgb,#fff 80%,var(--bg));color:var(--tx);box-shadow:calc(var(--u)*.5) calc(var(--u)*.9) calc(var(--u)*2) rgba(80,50,160,.22),inset 0 calc(var(--u)*.3) calc(var(--u)*.6) rgba(255,255,255,.9)}
.estilo-clay .bolhao{position:absolute;left:50%;top:50%;width:calc(var(--u)*240);height:calc(var(--u)*240);margin:calc(var(--u)*-120) 0 0 calc(var(--u)*-120);border-radius:50%;z-index:30;background:radial-gradient(circle at 40% 35%,color-mix(in srgb,var(--a) 40%,#fff),var(--a) 60%);transform:scale(0)}
`,
  editorial: `
.papel{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 0%,color-mix(in srgb,var(--bg) 60%,#fff),var(--bg) 60%),var(--bg)}
.fio{position:absolute;left:var(--sx);right:var(--sx);height:1px;background:color-mix(in srgb,var(--tx) 35%,transparent);transform-origin:left}
.fio-topo{top:calc(var(--st) - var(--u)*4)}.fio-base{bottom:calc(var(--sb) - var(--u)*3)}
.cabecalho{position:absolute;left:var(--sx);right:var(--sx);top:calc(var(--st) - var(--u)*7.6);display:flex;justify-content:space-between;font-family:var(--fm),monospace;font-size:calc(var(--u)*1.9);letter-spacing:.18em;text-transform:uppercase;color:color-mix(in srgb,var(--tx) 70%,transparent)}
.estilo-editorial .conteudo{align-items:flex-start;text-align:left}
.estilo-editorial .w{overflow:hidden;vertical-align:bottom;padding-bottom:.1em;margin-bottom:-.1em}
.estilo-editorial .t-display,.estilo-editorial .t-h1,.estilo-editorial .t-h2,.estilo-editorial .t-quote{font-weight:500;letter-spacing:-.02em}
.estilo-editorial .t-display{font-size:calc(var(--u)*14*var(--k));line-height:.95}
.estilo-editorial .t-h1{font-size:calc(var(--u)*11.5*var(--k))}.estilo-editorial .t-h2{font-size:calc(var(--u)*8.6*var(--k))}.estilo-editorial .t-quote{font-size:calc(var(--u)*8*var(--k));font-style:italic}
.estilo-editorial .hl{font-style:italic}
.estilo-editorial .t-sub{max-width:85%;font-size:calc(var(--u)*3.7*var(--k));opacity:.78}
.estilo-editorial .kicker{color:var(--a);letter-spacing:.24em;font-weight:500}
.estilo-editorial .regua{position:relative;width:calc(var(--u)*16);height:3px;background:var(--a);transform-origin:left}
.estilo-editorial .lista{gap:0}
.estilo-editorial .lista li{padding:calc(var(--u)*2.4*var(--k)) 0;border-top:1px solid color-mix(in srgb,var(--tx) 25%,transparent);font-weight:500}
.estilo-editorial .lista li:last-child{border-bottom:1px solid color-mix(in srgb,var(--tx) 25%,transparent)}
.estilo-editorial .marca{width:auto;height:auto;font-family:var(--fm),monospace;font-size:calc(var(--u)*2.4*var(--k));color:var(--a);letter-spacing:.1em;min-width:calc(var(--u)*6*var(--k))}
.estilo-editorial .numero{font-weight:500;color:var(--tx);font-size:calc(var(--u)*26*var(--k))}
.estilo-editorial .card{border:1px solid color-mix(in srgb,var(--tx) 30%,transparent);border-radius:0;background:transparent}
.estilo-editorial .ruim{opacity:.6}.estilo-editorial .ruim .card-rot i{border:1px solid currentColor}
.estilo-editorial .bom{border-color:var(--a)}.estilo-editorial .bom .card-rot{color:var(--a)}.estilo-editorial .bom .card-rot i{background:var(--a);color:var(--bg)}
.estilo-editorial .mock{background:var(--tx);box-shadow:0 calc(var(--u)*3) calc(var(--u)*6) rgba(0,0,0,.18)}
.estilo-editorial .mock-tela{background:color-mix(in srgb,var(--bg) 92%,#fff)}.estilo-editorial .esqueleto i{background:var(--tx)}.estilo-editorial .esqueleto b{background:var(--a);opacity:.25}
.estilo-editorial .botao{background:var(--tx);color:var(--bg);border-radius:0;letter-spacing:.06em;text-transform:uppercase;font-weight:600;font-size:calc(var(--u)*3.6*var(--k))}
.estilo-editorial .brilho{display:none}
.estilo-editorial .aspas{font-style:italic}
.estilo-editorial .leg{font-family:var(--fb);font-weight:600;color:var(--tx);padding-bottom:calc(var(--u)*.8);border-bottom:2px solid var(--a)}
.estilo-editorial .cortina{position:absolute;inset:0;z-index:30;background:var(--a);transform:scaleX(0)}
`,
};
