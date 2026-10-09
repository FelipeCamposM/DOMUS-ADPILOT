import { expect, test } from "vitest";
import { retimeScenes, storyboardSchema } from "./video";

test("retime alonga cenas para a narração e leva os SFX junto", () => {
  const sb = storyboardSchema.parse({
    title: "t", duration: 6,
    scenes: [{ start: 0, end: 3, headline: "A" }, { start: 3, end: 6, headline: "B" }],
    sfx: [{ time: 1.5, effect: "whoosh" }, { time: 3, effect: "pop" }],
  });
  const r = retimeScenes(sb, [4.5, 1]);
  expect(r.scenes.map((s) => [s.start, s.end])).toEqual([[0, 4.5], [4.5, 7.5]]);
  expect(r.duration).toBe(7.5);
  expect(r.sfx.map((e) => e.time)).toEqual([2.25, 4.5]); // meio da cena 1, início da cena 2
});

test("storyboard rejeita efeito fora da biblioteca", () => {
  expect(storyboardSchema.safeParse({ title: "t", duration: 3, scenes: [{ start: 0, end: 3, headline: "A" }], sfx: [{ time: 1, effect: "explosao" }] }).success).toBe(false);
});
