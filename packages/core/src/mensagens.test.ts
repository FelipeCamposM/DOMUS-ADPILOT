import { expect, test } from "vitest";
import { contatoSchema, formatarNumero, normalizarNumero, preencherModelo } from "./mensagens";

test("número: DDD vira +55, estrangeiro com +, lixo é recusado", () => {
  expect(normalizarNumero("(31) 99999-8888")).toBe("5531999998888");
  expect(normalizarNumero("+55 31 3333-4444")).toBe("553133334444");
  expect(normalizarNumero("+1 555 123 4567")).toBe("15551234567");
  expect(normalizarNumero("123")).toBeNull();
  expect(normalizarNumero("55 31 9")).toBeNull();
  expect(formatarNumero("5531999998888")).toBe("+55 (31) 99999-8888");
});

test("contato exige nome e número", () => {
  expect(contatoSchema.safeParse({ nome: "", numero: "31999998888" }).success).toBe(false);
  expect(contatoSchema.safeParse({ nome: "Maria", numero: "" }).success).toBe(false);
  expect(contatoSchema.parse({ nome: " Maria Souza ", numero: "31 99999-8888" })).toEqual({ nome: "Maria Souza", numero: "5531999998888" });
});

test("modelo troca as variáveis", () => {
  expect(preencherModelo("Oi {primeiro_nome}! {nome}", { nome: "Maria Souza", numero: "5531999998888" })).toBe("Oi Maria! Maria Souza");
});
