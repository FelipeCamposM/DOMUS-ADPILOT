import { alturaLegenda, blocosLegenda, faixaLivre, limitesVerticais, zonasPara, type Brand, type BriefEdicao, type PlanoEdicao } from "@domus-ads/core";
import { paletaCenas } from "./cenas";

/**
 * MONTADOR DA EDIÇÃO: o vídeo enviado (já cortado, assets/base.mp4) vira a camada de baixo da composição HyperFrames;
 * por cima, as animações (títulos, destaques, lista, número, CTA, nome, emoji) com entradas 3D e a legenda palavra por
 * palavra. Posições calculadas aqui, fora das áreas da interface da rede escolhida e longe do rosto.
 * O runtime (edicao-runtime.ts) só encaixa o texto e anima.
 */
type Overlay = PlanoEdicao["overlays"][number];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Altura (fração do quadro) reservada para cada tipo de animação. */
const ALTURA: Record<Overlay["tipo"], number> = { titulo: 0.2, destaque: 0.09, lista: 0.28, numero: 0.22, cta: 0.13, nome: 0.11, emoji: 0.14 };

function conteudo(o: Overlay, logo: string | null): string {
  const palavras = (t: string) => t.split(/\s+/).map((w) => `<span class="ow"><span class="owi">${esc(w)}</span></span>`).join(" ");
  switch (o.tipo) {
    case "titulo":
      return `<div class="ov-card">${o.sub ? `<div class="ov-kicker" data-p>${esc(o.sub)}</div>` : ""}<h2 class="ov-tit ext" data-p>${palavras(o.texto)}</h2></div>`;
    case "destaque":
      return `<div class="ov-pilula" data-p><i class="ov-brilho"></i><span>${esc(o.texto)}</span></div>`;
    case "lista":
      return `<div class="ov-card"><h3 class="ov-sub-tit" data-p>${esc(o.texto)}</h3><ul class="ov-lista">${(o.itens ?? []).map((i) => `<li data-p data-item><b>✓</b><span>${esc(i)}</span></li>`).join("")}</ul></div>`;
    case "numero": {
      const n = o.numero ?? { valor: 0, prefixo: "", sufixo: "" };
      return `<div class="ov-card ov-centro"><div class="ov-num ext" data-p data-valor="${n.valor}" data-pre="${esc(n.prefixo)}" data-suf="${esc(n.sufixo)}">${esc(n.prefixo)}0${esc(n.sufixo)}</div><div class="ov-num-rot" data-p>${esc(o.texto)}</div></div>`;
    }
    case "cta":
      return `<div class="ov-centro">${logo ? `<img class="ov-logo" data-p src="${esc(logo)}" alt="">` : ""}<div class="ov-botao" data-p><span>${esc(o.texto)}</span><i class="ov-brilho"></i></div>${o.sub ? `<div class="ov-cta-sub" data-p>${esc(o.sub)}</div>` : ""}</div>`;
    case "nome":
      return `<div class="ov-nome"><i class="ov-barra"></i><div><b data-p>${esc(o.texto)}</b>${o.sub ? `<span data-p>${esc(o.sub)}</span>` : ""}</div></div>`;
    case "emoji":
      return `<div class="ov-emoji" data-p>${esc(o.texto)}</div>`;
  }
}

export function montarEdicao(o: { plano: PlanoEdicao; brief: BriefEdicao; brand: Brand; w: number; h: number; logo: string | null; video: string }): string {
  const { plano, brief, w, h } = o;
  const { P } = paletaCenas({ estiloVisual: "hud" }, o.brand);
  const u = Math.min(w, h) / 100;
  const zonas = zonasPara(brief.rede, brief.formato);
  const { topo, base } = limitesVerticais(zonas, w, h);
  const pad = w * 0.02;

  // legenda: cada bloco na altura que não cobre o rosto naquele momento
  const estilo = brief.estiloLegenda;
  const altLeg = u * (estilo === "palavra" ? 15 : estilo === "impacto" ? 12.5 : 11);
  const blocos = brief.legendas ? blocosLegenda(plano.palavras, estilo) : [];
  const legendas = blocos.map((b, n) => {
    const y = alturaLegenda({ zonas, w, h, alt: altLeg, rostos: plano.rostos, s: b.s, e: b.e });
    const f = faixaLivre(zonas, y, y + altLeg, w);
    return { n, s: b.s, e: b.e, y, x0: f.x0 + pad, x1: f.x1 - pad, ws: plano.palavras.slice(b.i0, b.i1 + 1) };
  });
  const yLegBase = base - h * 0.015 - altLeg;

  const overlays = plano.overlays.map((ov, i) => {
    const alt = ALTURA[ov.tipo] * h;
    const y0 = ov.posicao === "topo" ? topo + h * 0.025 : ov.posicao === "centro" ? h * 0.42 - alt / 2 : Math.min(base, yLegBase) - h * 0.02 - alt;
    const f = faixaLivre(zonas, y0, y0 + alt, w);
    return { i, ov, y0, alt, x0: f.x0 + pad, x1: f.x1 - pad };
  });

  const dados = {
    w, h, total: plano.duration, estilo,
    legendas: legendas.map((l) => ({ n: l.n, s: l.s, e: l.e, p: l.ws.map((x) => x.s) })),
    overlays: overlays.map(({ i, ov }) => ({ i, s: ov.start, e: ov.end, tipo: ov.tipo, entrada: ov.entrada })),
    zooms: [...plano.zooms].sort((a, b) => a.start - b.start),
    efeitos: plano.efeitos,
  };

  const familias = [...new Set([P.ft, P.fb])].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@500;700;800;900`).join("&");
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
:root{--bg:${P.bg};--a:${P.a};--a2:${P.a2};--tx:${P.tx};--ft:'${P.ft}';--fb:'${P.fb}';--u:${u}px}
${CSS}
</style>
</head>
<body class="lg-${estilo}">
<div id="root" data-composition-id="main" data-start="0" data-duration="${plano.duration}" data-width="${w}" data-height="${h}">
<div class="palco" id="palco"><video id="fonte" class="clip" data-start="0" data-duration="${plano.duration}" src="${esc(o.video)}" muted playsinline></video></div>
<div class="fx" id="fx-vinheta"></div><div class="fx" id="fx-flash"></div>
${overlays.map(({ i, ov, y0, alt, x0, x1 }) => `<section id="o${i}" class="clip ov ov-${ov.tipo}" data-start="${ov.start}" data-duration="${+(ov.end - ov.start).toFixed(2)}" data-track-index="1">
  <div class="ov-box" style="left:${Math.round(x0)}px;top:${Math.round(y0)}px;width:${Math.round(x1 - x0)}px;height:${Math.round(alt)}px">${conteudo(ov, o.logo)}</div>
</section>`).join("\n")}
<div class="legendas">
${legendas.map((l) => `<div class="lg" id="l${l.n}" style="left:${Math.round(l.x0)}px;width:${Math.round(l.x1 - l.x0)}px;top:${Math.round(l.y)}px;height:${Math.round(altLeg)}px"><div class="lg-in">${l.ws.map((x) => `<span class="lw">${esc(x.w)}</span>`).join(" ")}</div></div>`).join("\n")}
</div>
</div>
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<script src="assets/edicao.js"></script>
<script>
const tl = E.init(${JSON.stringify(dados)});
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
</script>
</body>
</html>`;
}

// extrusão (texto com profundidade): camadas de sombra num tom escuro do destaque + sombra projetada
const EXT = `0 calc(var(--u)*.12) 0 color-mix(in srgb,var(--a) 70%,#000),0 calc(var(--u)*.24) 0 color-mix(in srgb,var(--a) 62%,#000),0 calc(var(--u)*.36) 0 color-mix(in srgb,var(--a) 54%,#000),0 calc(var(--u)*.48) 0 color-mix(in srgb,var(--a) 46%,#000),0 calc(var(--u)*.6) 0 color-mix(in srgb,var(--a) 38%,#000),0 calc(var(--u)*1.4) calc(var(--u)*1.6) rgba(0,0,0,.55)`;

const CSS = `
html,body{margin:0;padding:0;overflow:hidden;background:#000}
#root{position:relative;overflow:hidden;background:radial-gradient(120% 80% at 50% 30%,color-mix(in srgb,var(--bg) 70%,var(--a)),var(--bg));color:#fff;font-family:var(--fb),system-ui,sans-serif;-webkit-font-smoothing:antialiased;perspective:calc(var(--u)*160)}
.clip{position:absolute;inset:0}
.palco{position:absolute;inset:0;transform-style:preserve-3d}
#fonte{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.fx{position:absolute;inset:0;pointer-events:none;opacity:0;z-index:5}
#fx-flash{background:#fff}
#fx-vinheta{background:radial-gradient(ellipse 70% 60% at 50% 45%,transparent 40%,rgba(0,0,0,.85) 100%)}
.ov{z-index:10;perspective:calc(var(--u)*140)}
.ov-box{position:absolute;display:flex;flex-direction:column;justify-content:center;align-items:center;transform-style:preserve-3d;--k:1}
.ov-box>*{max-width:100%;transform-style:preserve-3d}
.ov-card{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*1.4*var(--k));padding:calc(var(--u)*3*var(--k)) calc(var(--u)*4*var(--k));border-radius:calc(var(--u)*3.4);
  background:linear-gradient(155deg,color-mix(in srgb,var(--bg) 78%,transparent),color-mix(in srgb,var(--bg) 92%,transparent));border:1px solid color-mix(in srgb,var(--a) 55%,transparent);
  box-shadow:0 calc(var(--u)*3) calc(var(--u)*8) rgba(0,0,0,.55),0 0 calc(var(--u)*5) color-mix(in srgb,var(--a) 30%,transparent),inset 0 1px 0 rgba(255,255,255,.18);text-align:center;backdrop-filter:blur(calc(var(--u)*2))}
.ov-centro{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*1.6*var(--k));text-align:center}
.ov-kicker{font-size:calc(var(--u)*3*var(--k));letter-spacing:.16em;text-transform:uppercase;font-weight:800;color:var(--a)}
.ov-tit{margin:0;font-family:var(--ft),system-ui,sans-serif;font-weight:900;font-size:calc(var(--u)*8.6*var(--k));line-height:1.02;letter-spacing:-.02em;color:#fff;text-wrap:balance}
.ext{text-shadow:${EXT}}
.ow{display:inline-block;perspective:calc(var(--u)*60)}.owi{display:inline-block;transform-origin:50% 100%}
.ov-pilula{position:relative;overflow:hidden;display:inline-flex;align-items:center;padding:calc(var(--u)*2*var(--k)) calc(var(--u)*4.4*var(--k));border-radius:999px;background:var(--a);color:#fff;
  font-family:var(--ft),system-ui,sans-serif;font-weight:900;font-size:calc(var(--u)*5.6*var(--k));white-space:nowrap;box-shadow:0 calc(var(--u)*.9) 0 color-mix(in srgb,var(--a) 55%,#000),0 calc(var(--u)*2.6) calc(var(--u)*4) rgba(0,0,0,.5)}
.ov-brilho{position:absolute;top:-50%;bottom:-50%;width:28%;left:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent);transform:skewX(-20deg)}
.ov-sub-tit{margin:0;font-family:var(--ft),system-ui,sans-serif;font-weight:800;font-size:calc(var(--u)*5.4*var(--k));line-height:1.1}
.ov-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:calc(var(--u)*1.4*var(--k));text-align:left}
.ov-lista li{display:flex;align-items:center;gap:calc(var(--u)*2*var(--k));font-size:calc(var(--u)*4.6*var(--k));font-weight:700}
.ov-lista b{display:grid;place-items:center;width:calc(var(--u)*6*var(--k));height:calc(var(--u)*6*var(--k));border-radius:calc(var(--u)*1.6);background:var(--a);flex:none;font-size:.8em}
.ov-num{font-family:var(--ft),system-ui,sans-serif;font-weight:900;font-size:calc(var(--u)*20*var(--k));line-height:.95;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap}
.ov-num-rot{font-size:calc(var(--u)*4.6*var(--k));font-weight:700}
.ov-logo{max-height:calc(var(--u)*11*var(--k));max-width:60%;object-fit:contain;filter:drop-shadow(0 calc(var(--u)*.8) calc(var(--u)*2) rgba(0,0,0,.5))}
.ov-botao{position:relative;overflow:hidden;padding:calc(var(--u)*3*var(--k)) calc(var(--u)*7*var(--k));border-radius:999px;background:var(--a);color:#fff;font-weight:900;font-size:calc(var(--u)*5.4*var(--k));white-space:nowrap;
  box-shadow:0 calc(var(--u)*1) 0 color-mix(in srgb,var(--a) 55%,#000),0 0 calc(var(--u)*6) color-mix(in srgb,var(--a) 60%,transparent)}
.ov-cta-sub{font-size:calc(var(--u)*3.8*var(--k));font-weight:700;text-shadow:0 2px 8px rgba(0,0,0,.7)}
.ov-box:has(.ov-nome){align-items:flex-start}
.ov-nome{display:flex;align-items:stretch;gap:calc(var(--u)*2);padding:calc(var(--u)*2.2*var(--k)) calc(var(--u)*3.4*var(--k));border-radius:calc(var(--u)*2);background:color-mix(in srgb,var(--bg) 85%,transparent);box-shadow:0 calc(var(--u)*2) calc(var(--u)*5) rgba(0,0,0,.5)}
.ov-barra{width:calc(var(--u)*1);border-radius:99px;background:var(--a);transform-origin:50% 100%}
.ov-nome div{display:flex;flex-direction:column;gap:calc(var(--u)*.4)}
.ov-nome b{font-family:var(--ft),system-ui,sans-serif;font-size:calc(var(--u)*5.2*var(--k));font-weight:900;line-height:1.05}
.ov-nome span{font-size:calc(var(--u)*3.4*var(--k));opacity:.85;font-weight:600}
.ov-emoji{font-size:calc(var(--u)*16*var(--k));line-height:1;filter:drop-shadow(0 calc(var(--u)*1.4) calc(var(--u)*2) rgba(0,0,0,.45))}

.legendas{position:absolute;inset:0;z-index:20;pointer-events:none;perspective:calc(var(--u)*120)}
.lg{position:absolute;display:flex;align-items:center;justify-content:center;visibility:hidden}
.lg-in{display:inline-block;max-width:100%;text-align:center;white-space:nowrap;font-weight:800;font-size:calc(var(--u)*5.4);line-height:1.2;transform-style:preserve-3d}
.lw{display:inline-block;--on:0}
/* karaokê: caixa escura, a palavra falada acende e fica acesa */
.lg-karaoke .lg-in{padding:calc(var(--u)*1.2) calc(var(--u)*2.6);border-radius:calc(var(--u)*1.8);background:rgba(10,10,14,.72);color:#fff}
.lg-karaoke .lw{color:color-mix(in srgb,var(--a) calc(var(--on)*100%),#fff)}
/* impacto: caixa alta pesada com contorno; a palavra falada cresce em amarelo */
.lg-impacto .lg-in{font-family:var(--ft),system-ui,sans-serif;font-weight:900;text-transform:uppercase;font-size:calc(var(--u)*7);letter-spacing:-.01em;color:#fff;-webkit-text-stroke:calc(var(--u)*.5) #000;paint-order:stroke fill;text-shadow:0 calc(var(--u)*.7) 0 #000}
.lg-impacto .lw{color:color-mix(in srgb,#FFE14D calc(var(--on)*100%),#fff);transform:scale(calc(1 + var(--on)*.07));margin:0 .16em} /* a margem segura o crescimento sem encostar na vizinha */
/* faixa da marca: fundo na cor da marca, marcador atrás da palavra falada */
.lg-marca .lg-in{padding:calc(var(--u)*1.1) calc(var(--u)*2);border-radius:calc(var(--u)*1.2);background:var(--a);color:#fff;box-shadow:0 calc(var(--u)*.8) 0 color-mix(in srgb,var(--a) 55%,#000)}
.lg-marca .lw{padding:0 .12em;border-radius:.2em;background:color-mix(in srgb,#fff calc(var(--on)*100%),transparent);color:color-mix(in srgb,var(--a) calc(var(--on)*100%),#fff)}
/* minimalista: branco com sombra, sublinhado na palavra falada */
.lg-minimal .lg-in{font-weight:700;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.75),0 0 2px rgba(0,0,0,.6)}
.lg-minimal .lw{background:linear-gradient(var(--a),var(--a)) no-repeat 0 100%/calc(var(--on)*100%) .12em;padding-bottom:.06em}
/* neon: brilho na cor de destaque */
.lg-neon .lg-in{font-weight:800;color:#fff}
.lg-neon .lw{color:color-mix(in srgb,#fff calc(var(--on)*100%),color-mix(in srgb,var(--a) 50%,#fff));text-shadow:0 0 calc(var(--u)*(.4 + var(--on)*1.6)) var(--a),0 0 calc(var(--u)*(1 + var(--on)*3)) var(--a)}
/* uma palavra: grande, no centro da faixa */
.lg-palavra .lg-in{font-family:var(--ft),system-ui,sans-serif;font-weight:900;font-size:calc(var(--u)*10);text-transform:uppercase;color:#fff;text-shadow:0 calc(var(--u)*.6) 0 color-mix(in srgb,var(--a) 60%,#000),0 calc(var(--u)*1.6) calc(var(--u)*2) rgba(0,0,0,.6)}
/* 3D: texto com profundidade, a palavra falada ganha a cor de destaque */
.lg-profundidade .lg-in{font-family:var(--ft),system-ui,sans-serif;font-weight:900;font-size:calc(var(--u)*6.6);color:#fff;text-shadow:${EXT}}
.lg-profundidade .lw{color:color-mix(in srgb,var(--a) calc(var(--on)*100%),#fff)}
`;
