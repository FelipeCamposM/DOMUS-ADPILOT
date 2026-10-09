import { resolve } from "node:path";
import { expect, test } from "vitest";
import { caminhoLocal } from "./storage";

test("chave local fica sempre dentro de MEDIA_DIR", () => {
  process.env.MEDIA_DIR = resolve("/tmp/media-teste");
  expect(caminhoLocal("ads/workspaces/abc/videos/x.mp4")).toBe(resolve("/tmp/media-teste/ads/workspaces/abc/videos/x.mp4"));
  expect(() => caminhoLocal("../fora.txt")).toThrow();
  expect(() => caminhoLocal("ads/../../fora.txt")).toThrow();
  expect(() => caminhoLocal(resolve("/etc/passwd"))).toThrow();
});
