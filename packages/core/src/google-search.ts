import { z } from "zod";
import { toMicros } from "./money";

/**
 * Campanha de PESQUISA do Google Ads, no formato que a IA escreve, o usuário edita e o provider publica.
 * Os limites são os do Google (títulos 30, descrições 90, caminhos 15, palavra-chave 80/10 palavras):
 * validar aqui evita ida e volta com a API.
 */
export const LIMITES_RSA = { titulo: 30, descricao: 90, caminho: 15, minTitulos: 3, maxTitulos: 15, minDescricoes: 2, maxDescricoes: 4 } as const;
export const IDIOMAS = { pt: { nome: "Português", id: 1014 }, en: { nome: "Inglês", id: 1000 }, es: { nome: "Espanhol", id: 1003 } } as const;
export const LANCES = {
  MAXIMIZE_CLICKS: "Maximizar cliques",
  MAXIMIZE_CONVERSIONS: "Maximizar conversões",
  MANUAL_CPC: "CPC manual",
} as const;
export const CORRESPONDENCIAS = { AMPLA: "BROAD", FRASE: "PHRASE", EXATA: "EXACT" } as const;
type Correspondencia = keyof typeof CORRESPONDENCIAS;

const dinheiro = z.string().trim().regex(/^\d{1,9}([.,]\d{1,2})?$/, "Use um valor como 70 ou 70,50");
const url = z.string().trim().url("URL inválida (use https://…)").refine((u) => /^https?:\/\//i.test(u), "URL precisa começar com http(s)://");
const palavra = z.object({
  texto: z.string().trim().min(1, "Palavra-chave vazia").max(80, "Palavra-chave com mais de 80 caracteres")
    .refine((t) => t.split(/\s+/).length <= 10, "Palavra-chave com mais de 10 palavras")
    .refine((t) => !/[!@%^*()={};~`<>?\\|]/.test(t), "Palavra-chave com caractere não permitido"),
  correspondencia: z.enum(Object.keys(CORRESPONDENCIAS) as [Correspondencia, ...Correspondencia[]]).default("FRASE"),
});
const titulo = z.string().trim().min(1, "Título vazio").max(LIMITES_RSA.titulo, `Título com mais de ${LIMITES_RSA.titulo} caracteres`);
const descricao = z.string().trim().min(1, "Descrição vazia").max(LIMITES_RSA.descricao, `Descrição com mais de ${LIMITES_RSA.descricao} caracteres`);
const caminho = z.string().trim().max(LIMITES_RSA.caminho, `Caminho com mais de ${LIMITES_RSA.caminho} caracteres`).regex(/^[^\s/]*$/, "Caminho sem espaços nem barras").default("");

export const anuncioRsaSchema = z.object({
  titulos: z.array(titulo).min(LIMITES_RSA.minTitulos, `Pelo menos ${LIMITES_RSA.minTitulos} títulos`).max(LIMITES_RSA.maxTitulos, `No máximo ${LIMITES_RSA.maxTitulos} títulos`),
  descricoes: z.array(descricao).min(LIMITES_RSA.minDescricoes, `Pelo menos ${LIMITES_RSA.minDescricoes} descrições`).max(LIMITES_RSA.maxDescricoes, `No máximo ${LIMITES_RSA.maxDescricoes} descrições`),
  caminho1: caminho,
  caminho2: caminho,
  urlFinal: url.optional(), // vazio = a URL da campanha
}).refine((a) => new Set(a.titulos.map((t) => t.toLowerCase())).size === a.titulos.length, "Títulos repetidos no mesmo anúncio");

export const grupoSchema = z.object({
  nome: z.string().trim().min(2, "Dê um nome ao grupo").max(120),
  palavras: z.array(palavra).min(1, "Cada grupo precisa de palavras-chave").max(80, "No máximo 80 palavras-chave por grupo"),
  negativas: z.array(palavra).max(80).default([]),
  anuncios: z.array(anuncioRsaSchema).min(1, "Cada grupo precisa de pelo menos 1 anúncio").max(3, "No máximo 3 anúncios por grupo"),
  cpcMax: dinheiro.optional(), // só no CPC manual
});

export const googleSearchSchema = z.object({
  nome: z.string().trim().min(3, "Nome muito curto").max(120, "Nome muito longo"),
  orcamentoDiario: dinheiro,
  lances: z.enum(Object.keys(LANCES) as [keyof typeof LANCES, ...(keyof typeof LANCES)[]]).default("MAXIMIZE_CLICKS"),
  cpcMax: dinheiro.optional(), // teto de CPC no "maximizar cliques" / padrão do CPC manual
  urlFinal: url,
  localizacoes: z.array(z.string().trim().min(2).max(80)).min(1, "Informe pelo menos uma localização (ex.: Brasil, Goiás, Goiânia)").max(20),
  idiomas: z.array(z.enum(Object.keys(IDIOMAS) as [keyof typeof IDIOMAS, ...(keyof typeof IDIOMAS)[]])).min(1).default(["pt"]),
  parceirosPesquisa: z.boolean().default(false),
  negativas: z.array(palavra).max(200).default([]),
  grupos: z.array(grupoSchema).min(1, "Pelo menos 1 grupo de anúncios").max(10, "No máximo 10 grupos"),
  sitelinks: z.array(z.object({
    texto: z.string().trim().min(1).max(25, "Texto do sitelink com mais de 25 caracteres"),
    descricao1: z.string().trim().max(35, "Descrição do sitelink com mais de 35 caracteres").default(""),
    descricao2: z.string().trim().max(35, "Descrição do sitelink com mais de 35 caracteres").default(""),
    url,
  })).max(8).default([]),
  frasesDestaque: z.array(z.string().trim().min(1).max(25, "Frase de destaque com mais de 25 caracteres")).max(10).default([]),
});
export type GoogleSearchSpec = z.infer<typeof googleSearchSchema>;
export type PalavraChave = z.infer<typeof palavra>;

/** Notação do próprio Google: [exata], "frase", ampla. Facilita editar a lista como texto. */
export function palavraParaTexto(p: PalavraChave): string {
  return p.correspondencia === "EXATA" ? `[${p.texto}]` : p.correspondencia === "FRASE" ? `"${p.texto}"` : p.texto;
}
export function textoParaPalavras(texto: string): PalavraChave[] {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^\[(.+)\]$/.exec(l) ?? null, f = /^"(.+)"$/.exec(l) ?? null;
    return m ? { texto: m[1]!.trim(), correspondencia: "EXATA" as const } : f ? { texto: f[1]!.trim(), correspondencia: "FRASE" as const } : { texto: l, correspondencia: "AMPLA" as const };
  });
}

/**
 * Monta TODAS as operações de criação numa única chamada googleAds:mutate (atômica: ou cria tudo ou nada).
 * Recursos novos usam ids temporários negativos para se referenciarem na mesma chamada.
 * A campanha nasce PAUSADA: só vai ao ar quando alguém ativar na lista de campanhas.
 */
export function operacoesSearch(customerId: string, s: GoogleSearchSpec, geo: string[], sufixo: string): Record<string, unknown>[] {
  const c = `customers/${customerId}`;
  let tmp = 0;
  const novo = (tipo: string) => `${c}/${tipo}/${--tmp}`;
  const ops: Record<string, unknown>[] = [];
  const kw = (p: PalavraChave) => ({ text: p.texto, matchType: CORRESPONDENCIAS[p.correspondencia] });

  const orc = novo("campaignBudgets");
  ops.push({ campaignBudgetOperation: { create: { resourceName: orc, name: `${s.nome} · ${sufixo}`, amountMicros: toMicros(s.orcamentoDiario).toString(), deliveryMethod: "STANDARD", explicitlyShared: false } } });

  const camp = novo("campaigns");
  const lance = s.lances === "MAXIMIZE_CONVERSIONS" ? { maximizeConversions: {} }
    : s.lances === "MANUAL_CPC" ? { manualCpc: { enhancedCpcEnabled: false } }
    : { targetSpend: s.cpcMax ? { cpcBidCeilingMicros: toMicros(s.cpcMax).toString() } : {} };
  ops.push({ campaignOperation: { create: {
    resourceName: camp, name: s.nome, status: "PAUSED", advertisingChannelType: "SEARCH", campaignBudget: orc,
    networkSettings: { targetGoogleSearch: true, targetSearchNetwork: s.parceirosPesquisa, targetContentNetwork: false, targetPartnerSearchNetwork: false },
    containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    ...lance,
  } } });

  for (const g of geo) ops.push({ campaignCriterionOperation: { create: { campaign: camp, location: { geoTargetConstant: g } } } });
  for (const i of s.idiomas) ops.push({ campaignCriterionOperation: { create: { campaign: camp, language: { languageConstant: `languageConstants/${IDIOMAS[i].id}` } } } });
  for (const n of s.negativas) ops.push({ campaignCriterionOperation: { create: { campaign: camp, negative: true, keyword: kw(n) } } });

  for (const g of s.grupos) {
    const ag = novo("adGroups");
    const cpc = g.cpcMax ?? s.cpcMax;
    ops.push({ adGroupOperation: { create: { resourceName: ag, campaign: camp, name: g.nome, status: "ENABLED", type: "SEARCH_STANDARD",
      ...(s.lances === "MANUAL_CPC" && cpc ? { cpcBidMicros: toMicros(cpc).toString() } : {}) } } });
    for (const p of g.palavras) ops.push({ adGroupCriterionOperation: { create: { adGroup: ag, status: "ENABLED", keyword: kw(p) } } });
    for (const n of g.negativas) ops.push({ adGroupCriterionOperation: { create: { adGroup: ag, negative: true, keyword: kw(n) } } });
    for (const a of g.anuncios) ops.push({ adGroupAdOperation: { create: { adGroup: ag, status: "ENABLED", ad: {
      finalUrls: [a.urlFinal || s.urlFinal],
      responsiveSearchAd: {
        headlines: a.titulos.map((text) => ({ text })),
        descriptions: a.descricoes.map((text) => ({ text })),
        ...(a.caminho1 ? { path1: a.caminho1 } : {}),
        ...(a.caminho1 && a.caminho2 ? { path2: a.caminho2 } : {}),
      },
    } } } });
  }

  for (const sl of s.sitelinks) {
    const as = novo("assets");
    ops.push({ assetOperation: { create: { resourceName: as, finalUrls: [sl.url], sitelinkAsset: { linkText: sl.texto, ...(sl.descricao1 && sl.descricao2 ? { description1: sl.descricao1, description2: sl.descricao2 } : {}) } } } });
    ops.push({ campaignAssetOperation: { create: { campaign: camp, asset: as, fieldType: "SITELINK" } } });
  }
  for (const t of s.frasesDestaque) {
    const as = novo("assets");
    ops.push({ assetOperation: { create: { resourceName: as, calloutAsset: { calloutText: t } } } });
    ops.push({ campaignAssetOperation: { create: { campaign: camp, asset: as, fieldType: "CALLOUT" } } });
  }
  return ops;
}
