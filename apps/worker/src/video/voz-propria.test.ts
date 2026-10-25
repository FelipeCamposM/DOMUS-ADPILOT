import { legendaEditada, type Storyboard } from "@domus-ads/core";
import { describe, expect, it } from "vitest";
import { encaixarNaFala } from "./voz-propria";

const palavras = "Olá eu sou o Felipe e hoje vou mostrar como o DOMUS cria vídeos sozinho teste grátis".split(" ")
  .map((w, i) => ({ w, s: i * 0.5, e: i * 0.5 + 0.4 }));
const cena = (start: number, end: number, headline: string) => ({ start, end, headline, subtext: "", narration: "", animation: "fade-up", visual: "" });

describe("encaixarNaFala", () => {
  it("cenas contínuas, grudadas nas palavras, com a fala real", () => {
    const sb: Storyboard = { title: "t", duration: 99, fps: 30, scenes: [cena(0.3, 3, "a"), cena(2.9, 6, "b"), cena(6.1, 6.6, "c"), cena(6.4, 9, "d")], sfx: [{ time: 50, effect: "whoosh", volume: 0.6 }], music: null };
    const r = encaixarNaFala(sb, { arquivo: "", dur: 8.5, palavras });
    expect(r.duration).toBe(9.3);
    expect(r.scenes[0]!.start).toBe(0);
    expect(r.scenes.at(-1)!.end).toBe(9.3);
    r.scenes.forEach((s, i) => { if (i) expect(s.start).toBe(r.scenes[i - 1]!.end); });
    expect(r.scenes.length).toBe(3); // "c" (0,5 s) some
    expect(r.scenes.map((s) => s.narration).join(" ")).toBe(palavras.map((p) => p.w).join(" "));
    expect(r.sfx).toEqual([]);
  });
  it("legenda editada na revisão", () => {
    const w = [{ w: "domus", start: 1 }, { w: "cria", start: 1.5 }];
    expect(legendaEditada("DOMUS cria", w)).toEqual([{ w: "DOMUS", start: 1 }, { w: "cria", start: 1.5 }]);
    expect(legendaEditada("O DOMUS cria", w)!.map((x) => x.start)).toEqual([1, 1.25, 1.5]);
    expect(legendaEditada("", w)).toBeUndefined();
  });
});
