import { expect, test } from "vitest";
import { JOB_TYPES, tiposLivres } from "./jobs";
import { deltaPct, hashChave, novaChave } from "./sistemas";

test("vaga extra só pega respostas rápidas", () => {
  expect(tiposLivres(2, 3, JOB_TYPES)).toBe(JOB_TYPES);
  expect(tiposLivres(3, 3, JOB_TYPES)).toEqual(["AI_CHAT", "AI_SISTEMA", "WHATSAPP_ENVIAR"]);
  expect(tiposLivres(4, 3, JOB_TYPES)).toBeNull();
});

test("chave nova: só o hash vai para o banco", () => {
  const k = novaChave();
  expect(k.chave).toMatch(/^domus_[\w-]{43}$/);
  expect(k.hash).toBe(hashChave(k.chave));
  expect(k.hash).not.toContain(k.chave);
  expect(k.fim).toBe(k.chave.slice(-4));
});

test("delta da janela de 5 h", () => {
  const r = "2026-10-22T18:00:00.000Z";
  expect(deltaPct({ pct: 40, resets_at: r }, { pct: 42.5, resets_at: r })).toBe(2.5);
  expect(deltaPct({ pct: 90, resets_at: r }, { pct: 3, resets_at: "2026-10-22T23:00:00.000Z" })).toBeNull();
  expect(deltaPct(undefined, { pct: 3, resets_at: r })).toBeNull();
});
