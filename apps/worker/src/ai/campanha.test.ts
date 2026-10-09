import { errosGoogle, googleSearchSchema, operacoesSearch, palavraParaTexto, textoParaPalavras } from "@domus-ads/core";
import { expect, test } from "vitest";
import { ler } from "./campanha";

const base = {
  nome: "SIAPLUS Professores GO", orcamentoDiario: "70", urlFinal: "https://siaplus.com.br", localizacoes: ["Goiás"],
  negativas: [{ texto: "vagas", correspondencia: "AMPLA" }],
  grupos: [{ nome: "Sistema", palavras: [{ texto: "sistema para professores", correspondencia: "FRASE" }, { texto: "siap goiás", correspondencia: "EXATA" }],
    anuncios: [{ titulos: ["SIAP em Dia em Minutos", "Feito Para Professores", "Teste Grátis por 24h"], descricoes: ["Organize seu SIAP sem planilhas.", "Professores de Goiás já usam. Comece hoje."], caminho1: "professores" }] }],
  sitelinks: [{ texto: "Planos", descricao1: "Veja os planos", descricao2: "Comece grátis", url: "https://siaplus.com.br/planos" }],
  frasesDestaque: ["Suporte humano"],
};

test("monta a criação inteira, numa ordem que respeita as referências, com a campanha pausada", () => {
  const s = googleSearchSchema.parse(base);
  const ops = operacoesSearch("123", s, ["geoTargetConstants/20106"], "x");
  const tipos = ops.map((o) => Object.keys(o)[0]);
  expect(tipos[0]).toBe("campaignBudgetOperation");
  expect(tipos[1]).toBe("campaignOperation");
  const camp = (ops[1] as { campaignOperation: { create: Record<string, unknown> } }).campaignOperation.create;
  expect(camp.status).toBe("PAUSED");
  expect(camp.advertisingChannelType).toBe("SEARCH");
  expect(camp.campaignBudget).toBe((ops[0] as { campaignBudgetOperation: { create: { resourceName: string } } }).campaignBudgetOperation.create.resourceName);
  expect((ops[0] as { campaignBudgetOperation: { create: { amountMicros: string } } }).campaignBudgetOperation.create.amountMicros).toBe("70000000");
  // ids temporários negativos e únicos
  const nomes = JSON.stringify(ops).match(/customers\/123\/\w+\/-\d+/g)!;
  expect(new Set(nomes.filter((n, i) => nomes.indexOf(n) === i)).size).toBeGreaterThanOrEqual(5);
  expect(tipos.filter((t) => t === "adGroupCriterionOperation")).toHaveLength(2);
  expect(tipos).toContain("adGroupAdOperation");
  expect(tipos.filter((t) => t === "campaignAssetOperation")).toHaveLength(2);
  expect(JSON.stringify(ops)).toContain('"matchType":"EXACT"');
});

test("notação de palavras-chave do Google: [exata], \"frase\", ampla", () => {
  const p = textoParaPalavras('[siap goiás]\n"sistema para professores"\nsiap\n\n');
  expect(p.map((x) => x.correspondencia)).toEqual(["EXATA", "FRASE", "AMPLA"]);
  expect(p.map(palavraParaTexto)).toEqual(["[siap goiás]", '"sistema para professores"', "siap"]);
});

test("limites do Google são validados (título > 30 caracteres)", () => {
  const r = googleSearchSchema.safeParse({ ...base, grupos: [{ ...base.grupos[0], anuncios: [{ ...base.grupos[0]!.anuncios[0], titulos: ["Um título que passa muito do limite de trinta", "B", "C"] }] }] });
  expect(r.success).toBe(false);
});

test("resposta da IA: poda títulos longos quando ainda sobra o mínimo; erro claro quando não dá", () => {
  const titulos = ["SIAP em Dia em Minutos", "Feito Para Professores", "Teste Grátis por 24h", "Um título que passa muito do limite de trinta caracteres"];
  const ok = ler("```json\n" + JSON.stringify({ ...base, grupos: [{ ...base.grupos[0], anuncios: [{ ...base.grupos[0]!.anuncios[0], titulos }] }] }) + "\n```");
  expect(ok.ok).toBe(true);
  if (ok.ok) expect(ok.valor.grupos[0]!.anuncios[0]!.titulos).toHaveLength(3);
  const ruim = ler("```json\n" + JSON.stringify({ ...base, urlFinal: "nao-e-url" }) + "\n```");
  expect(ruim.ok).toBe(false);
});

test("erro do Google aponta o item que falhou", () => {
  const s = googleSearchSchema.parse(base);
  const ops = operacoesSearch("123", s, ["geoTargetConstants/20106"], "x");
  const i = ops.findIndex((o) => JSON.stringify(o).includes("siap goiás"));
  const detail = { error: { details: [{ errors: [{ message: "A palavra-chave contém um termo proibido.", location: { fieldPathElements: [{ fieldName: "mutate_operations", index: i }] } }] }] } };
  expect(errosGoogle(detail, ops)[0]).toContain("siap goiás");
});
