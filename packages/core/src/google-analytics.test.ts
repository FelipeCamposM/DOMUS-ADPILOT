import { expect, test } from "vitest";
import { filtroPaginas, periodos } from "./google-analytics";
import { leadSiteSchema } from "./mensagens";

test("período atual e anterior de mesmo tamanho, sem buraco nem sobreposição", () => {
  const hoje = new Date("2026-11-15T15:00:00Z");
  expect(periodos(7, 0, hoje)).toEqual({ atual: { ini: "2026-11-09", fim: "2026-11-15" }, anterior: { ini: "2026-11-02", fim: "2026-11-08" } });
  expect(periodos(28, 2, hoje)).toEqual({ atual: { ini: "2026-10-17", fim: "2026-11-13" }, anterior: { ini: "2026-09-19", fim: "2026-10-16" } });
});

test("filtro do Search Console separa domínio de subdomínio", () => {
  const re = new RegExp(filtroPaginas(["digitaldomus.com.br"])!);
  expect(re.test("https://digitaldomus.com.br/")).toBe(true);
  expect(re.test("https://www.digitaldomus.com.br/contato")).toBe(true);
  expect(re.test("https://digitaldomus.com.br")).toBe(true);
  expect(re.test("https://siaplus.digitaldomus.com.br/")).toBe(false);
  expect(re.test("https://digitaldomus.com.br.evil.com/")).toBe(false);
  expect(new RegExp(filtroPaginas(["siaplus.digitaldomus.com.br"])!).test("https://siaplus.digitaldomus.com.br/planos")).toBe(true);
  expect(filtroPaginas([])).toBeNull();
});

test("GA4 e Search Console opcionais no site", () => {
  const base = { nome: "Domus", dominios: "domus.com.br", mensagem_inicial: "Olá, vim pelo site" };
  expect(leadSiteSchema.parse(base)).toMatchObject({ ga4: null, gsc: null });
  expect(leadSiteSchema.parse({ ...base, ga4: " 412345678 ", gsc: "sc-domain:domus.com.br" })).toMatchObject({ ga4: "412345678", gsc: "sc-domain:domus.com.br" });
  expect(leadSiteSchema.parse({ ...base, gsc: "https://domus.com.br/" }).gsc).toBe("https://domus.com.br/");
  expect(leadSiteSchema.safeParse({ ...base, ga4: "G-ABC123" }).success).toBe(false);
  expect(leadSiteSchema.safeParse({ ...base, gsc: "domus.com.br" }).success).toBe(false);
});
