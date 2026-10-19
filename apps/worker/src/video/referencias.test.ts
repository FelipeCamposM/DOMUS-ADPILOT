import { describe, expect, it } from "vitest";
import { contraste, coresDoTexto, garimpar, linksDoTexto, papeis, quantizar } from "./referencias";

describe("referências visuais", () => {
  it("garimpa og:image primeiro, srcset maior, ignora svg/gif e acha folhas e tema", () => {
    const html = `<html><head><title>Your Cookies &amp; Co &#064;yc</title>
      <meta content="Cookies artesanais" name="description">
      <meta property="og:image" content="/img/capa.jpg">
      <meta name="theme-color" content="#5A2D0C">
      <link rel="stylesheet" href="/css/app.css"><style>.a{color:#F2C14E}.b{background:#f2c14e}.c{color:rgba(0,0,0,.1)}</style></head>
      <body><img src="/logo.svg"><img src="p.jpg" srcset="p-400.jpg 400w, p-1200.jpg 1200w"><img data-src="//cdn.x.com/a.png"></body></html>`;
    const g = garimpar(html, new URL("https://www.yourcookies.com/loja/"));
    expect(g.titulo).toBe("Your Cookies & Co @yc");
    expect(g.descricao).toBe("Cookies artesanais");
    expect(g.imagens).toEqual(["https://www.yourcookies.com/img/capa.jpg", "https://www.yourcookies.com/loja/p-1200.jpg", "https://cdn.x.com/a.png"]);
    expect(g.folhas).toEqual(["https://www.yourcookies.com/css/app.css"]);
    expect(g.tema).toBe("#5a2d0c");
    expect(coresDoTexto(g.estilos)).toEqual(["#f2c14e"]); // repetida conta uma vez; quase transparente fica de fora
  });

  it("quantiza pixels nas cores predominantes, sem quase-repetidas", () => {
    const px: number[] = [];
    for (let i = 0; i < 700; i++) px.push(250, 240, 230); // creme (70%)
    for (let i = 0; i < 250; i++) px.push(90, 45, 12, 92, 46, 13); // marrom em dois tons quase iguais
    for (let i = 0; i < 50; i++) px.push(0, 0, 0); // 2,5%: entra
    const p = quantizar(Uint8Array.from(px));
    expect(p[0]).toBe("#faf0e6");
    expect(p).toHaveLength(3);
  });

  it("papéis: fundo claro/escuro, texto legível e destaque saturado", () => {
    const [bg, a, tx] = papeis(["#7a7a7a", "#fdf6ec", "#5a2d0c", "#e8452c"]);
    expect(bg).toBe("#fdf6ec");
    expect(tx).toBe("#5a2d0c"); // marrom da marca, não um preto genérico
    expect(contraste(tx!, bg!)).toBeGreaterThanOrEqual(4.5);
    expect(a).toBe("#e8452c");
  });

  it("acha links escritos nas orientações", () => {
    expect(linksDoTexto("use as fotos de https://www.yourcookies.com, e o insta https://instagram.com/yourcookies.")).toEqual(["https://www.yourcookies.com", "https://instagram.com/yourcookies"]);
    expect(linksDoTexto("Prints reais de castilhoadvogados.adv.br em mockup; logo.png, Node.js, oi@domus.com.br e @domus.com ficam de fora")).toEqual(["https://castilhoadvogados.adv.br"]);
  });
});
