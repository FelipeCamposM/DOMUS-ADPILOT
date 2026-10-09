import { expect, test } from "vitest";
import { palavrasDe } from "./tts";

test("alinhamento por caractere vira início de cada palavra", () => {
  const texto = "Olá, professor goiano";
  const a = { characters: texto.split(""), character_start_times_seconds: texto.split("").map((_, i) => i * 0.05) };
  expect(palavrasDe(a)).toEqual([{ w: "Olá,", start: 0 }, { w: "professor", start: 0.25 }, { w: "goiano", start: 0.75 }]);
  expect(palavrasDe(undefined)).toBeUndefined();
});
