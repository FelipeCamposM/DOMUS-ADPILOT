import { expect, test } from "vitest";
import { contarHashtags, problemasPost } from "./instagram-regras";

const img = { type: "IMAGE", durationMs: null };
const vid = (s: number) => ({ type: "VIDEO", durationMs: s * 1000 });

test("regras por tipo de publicação", () => {
  expect(problemasPost({ tipo: "FEED", legenda: "oi", midias: [img] })).toEqual([]);
  expect(problemasPost({ tipo: "FEED", legenda: "", midias: [vid(10)] })[0]).toMatch(/Reels/);
  expect(problemasPost({ tipo: "CARROSSEL", legenda: "", midias: [img] })[0]).toMatch(/2 a 10/);
  expect(problemasPost({ tipo: "CARROSSEL", legenda: "", midias: [img, vid(20), img] })).toEqual([]);
  expect(problemasPost({ tipo: "REELS", legenda: "", midias: [img] })[0]).toMatch(/1 vídeo/);
  expect(problemasPost({ tipo: "STORY", legenda: "", midias: [vid(61)] })[0]).toMatch(/60 segundos/);
  expect(problemasPost({ tipo: "STORY", legenda: "x".repeat(3000), midias: [img] })).toEqual([]); // story não tem legenda
});

test("hashtags contam só palavras com #", () => {
  expect(contarHashtags("Bora! #siap #professorgoiano\n#goiânia e c#sharp")).toBe(3);
  expect(problemasPost({ tipo: "FEED", legenda: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" "), midias: [img] })[0]).toMatch(/30 hashtags/);
});
