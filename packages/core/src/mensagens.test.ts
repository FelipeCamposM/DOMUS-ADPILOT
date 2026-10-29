import { expect, test } from "vitest";
import { contatoSchema, dominioPermitido, formatarNumero, leadSchema, leadSiteSchema, linkWhatsapp, normalizarNumero, preencherModelo, temLink } from "./mensagens";

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

test("lead: sem consentimento não entra; UTM e página guardados", () => {
  expect(leadSchema.safeParse({ nome: "Ana", numero: "31999998888" }).success).toBe(false);
  expect(leadSchema.safeParse({ nome: "Ana", numero: "31999998888", consentimento: "off" }).success).toBe(false);
  expect(leadSchema.parse({ nome: " Ana Lima ", numero: "(31) 99999-8888", consentimento: "on", pagina: "https://x.com/a", utm_source: "instagram", utm_medium: "" }))
    .toEqual({ nome: "Ana Lima", numero: "5531999998888", mensagem: "", pagina: "https://x.com/a", utm: { source: "instagram" } });
});

test("domínios do site: subdomínio vale, outro site não", () => {
  const d = leadSiteSchema.parse({ nome: "Castilho", dominios: "https://www.castilho.adv.br/, outro.com", mensagem_inicial: "Olá, vim do site" }).dominios;
  expect(d).toEqual(["castilho.adv.br", "outro.com"]);
  expect(dominioPermitido("https://www.castilho.adv.br", d)).toBe(true);
  expect(dominioPermitido("https://castilho.adv.br.golpe.com", d)).toBe(false);
  expect(dominioPermitido(null, d)).toBe(false);
  expect(dominioPermitido(null, [])).toBe(true);
});

test("link do WhatsApp, {site} e detecção de link", () => {
  expect(linkWhatsapp("5531999998888", "Oi, vim do site")).toBe("https://wa.me/5531999998888?text=Oi%2C%20vim%20do%20site");
  expect(preencherModelo("Vim do {site}", { nome: "A", numero: "1", site: "Castilho" })).toBe("Vim do Castilho");
  expect(temLink("veja www.site.com")).toBe(true);
  expect(temLink("acesse castilho.adv.br")).toBe(true);
  expect(temLink("Oi Maria, tudo bem? Vi seu contato.")).toBe(false);
});
