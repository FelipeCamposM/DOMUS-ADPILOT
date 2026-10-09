import { expect, test } from "vitest";
import { violacoes } from "./compose";

const ok = `<html><head><script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"></head>
<body><div id="root" data-composition-id="main"></div><script>const tl=gsap.timeline({paused:true});window.__timelines["main"]=tl;</script></body></html>`;

test("composição limpa passa", () => expect(violacoes(ok)).toEqual([]));

test("barra rede, aleatoriedade, scripts e recursos externos", () => {
  const ruim = ok
    .replace("</body>", `<script src="https://evil.example/x.js"></script><img src="http://x.com/a.png"><script>fetch("/x");Math.random()</script></body>`)
    .replace("</head>", "<style>.a{animation:x 1s; background:url(https://x.com/b.png)}</style></head>");
  const e = violacoes(ruim).join(" | ");
  for (const s of ["Math.random", "rede", "evil.example", "x.com/a.png", "x.com/b.png", "@keyframes"]) expect(e).toContain(s);
});

test("anexos: só assets/<arquivo>; bloqueia .., caminho absoluto e file:", () => {
  const base = ok.replace("</body>", '<img src="assets/logo.png"><video src="assets/anexo-1.mp4"></video></body>');
  expect(violacoes(base)).toEqual([]);
  for (const ruim of ['<img src="../.env">', '<img src="C:/Windows/x.png">', '<img src="/etc/passwd">', '<img src="file:///C:/x.png">', '<img src="assets/../segredo.txt">'])
    expect(violacoes(base.replace("</body>", `${ruim}</body>`)).length, ruim).toBeGreaterThan(0);
});

test("preconnect do Google Fonts (sem barra no fim) é permitido", () => {
  const html = ok.replace("</head>", '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin></head>');
  expect(violacoes(html)).toEqual([]);
  expect(violacoes(ok.replace("</head>", '<link href="https://fonts.googleapis.com.evil.io/x"></head>')).length).toBeGreaterThan(0);
});
