import { expect, test } from "vitest";
import { alturaLegenda, aplicarCorrecoes, reescrever, blocosLegenda, cortarPausas, faixaLivre, limitesVerticais, paraEditado, zonasPara } from "./edicao";

const P = (w: string, s: number, e: number) => ({ w, s, e });

test("corta as pausas longas e remapeia as palavras", () => {
  const ws = [P("Oi", 1, 1.3), P("gente", 1.4, 1.8), P("hoje", 4, 4.3), P("vamos", 4.35, 4.7)];
  const r = cortarPausas(ws, 10);
  expect(r.cortes).toEqual([{ de: 0.85, ate: 1.95 }, { de: 3.85, ate: 5.1 }]);
  expect(r.palavras[0]!.s).toBe(0.15);
  expect(r.palavras[2]!.s).toBeCloseTo(1.25, 3); // 1,1 s do 1º trecho + 0,15 de folga
  expect(paraEditado(r.cortes, 3)).toBeCloseTo(1.1, 3); // caiu num corte: vai para a emenda
});

test("sem fala o vídeo fica inteiro", () => {
  expect(cortarPausas([], 12.5).cortes).toEqual([{ de: 0, ate: 12.5 }]);
});

test("correções da IA trocam e apagam palavras, mas nunca acrescentam", () => {
  const ws = [P("domus", 0, 0.5), P("éé", 0.5, 0.8), P("legenda", 0.8, 1.6)];
  const r = aplicarCorrecoes(ws, [{ i: 0, w: "DOMUS" }, { i: 1, w: "" }, { i: 2, w: "a legenda" }]);
  expect(r.map((p) => p.w)).toEqual(["DOMUS", "legenda"]);
  expect(r[1]!.s).toBe(0.8);
});

test("reescrever divide o tempo entre as palavras novas", () => {
  const r = reescrever([P("adpilot", 0.8, 1.6)], 0, 0, "Ad Pilot");
  expect(r.map((p) => [p.w, p.s, p.e])).toEqual([["Ad", 0.8, 1.054], ["Pilot", 1.054, 1.6]]);
});

test("blocos quebram na pontuação e respeitam o estilo de uma palavra", () => {
  const ws = [P("Isso", 0, 0.3), P("muda", 0.3, 0.6), P("tudo.", 0.6, 1), P("Sério", 1.1, 1.5)];
  expect(blocosLegenda(ws, "karaoke").map((b) => [b.i0, b.i1])).toEqual([[0, 2], [3, 3]]);
  expect(blocosLegenda(ws, "palavra")).toHaveLength(4);
});

test("zonas do Instagram: legenda acima da descrição e fora da coluna de botões", () => {
  const z = zonasPara("instagram", "9:16");
  const { topo, base } = limitesVerticais(z, 1080, 1920);
  expect(topo).toBeCloseTo(268.8, 1);
  expect(base).toBeCloseTo(1248, 1);
  expect(faixaLivre(z, 1100, 1240, 1080)).toEqual({ x0: 64.8, x1: 928.8 });
});

test("legenda sobe quando o rosto ocupa a faixa de baixo", () => {
  const zonas = zonasPara("tiktok", "9:16");
  const base = alturaLegenda({ zonas, w: 1080, h: 1920, alt: 160, rostos: [], s: 0, e: 2 });
  expect(base).toBeGreaterThan(1000);
  const comRosto = alturaLegenda({ zonas, w: 1080, h: 1920, alt: 160, rostos: [{ t: 1, x0: 0.3, y0: 0.45, x1: 0.7, y1: 0.66 }], s: 0, e: 2 });
  expect(comRosto).toBeLessThan(400);
});
