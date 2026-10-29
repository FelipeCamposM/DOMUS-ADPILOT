import { z } from "zod";

/** Mensagens do WhatsApp do DOMUS (tela Mensagens): números, contatos e modelos. Sem banco: serve também no navegador. */

/**
 * Número como o WhatsApp usa: só dígitos, com DDI. Brasileiro sem DDI (10–11 dígitos com DDD) ganha o 55.
 * Devolve null se não parecer um telefone.
 */
export function normalizarNumero(entrada: string): string | null {
  const comDdi = /^\s*(\+|00)/.test(entrada); // "+1 555…" é DDI explícito, mesmo com 11 dígitos
  let d = entrada.replace(/\D/g, "").replace(/^00/, "");
  if (!comDdi && (d.length === 10 || d.length === 11)) d = `55${d}`;
  if (d.startsWith("55") && !(d.length === 12 || d.length === 13)) return null;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** Mesmo número com ou sem o 9 do celular brasileiro (o WhatsApp guarda alguns sem). */
export const mesmoNumero = (a: string, b: string) =>
  a === b || (a.startsWith("55") && b.startsWith("55") && a.slice(0, 4) === b.slice(0, 4) && a.slice(-8) === b.slice(-8));

/** +55 (31) 99999-9999 para mostrar; outros países ficam +DDI e o resto. */
export function formatarNumero(n: string): string {
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(n);
  return br ? `+55 (${br[1]}) ${br[2]}-${br[3]}` : `+${n}`;
}

const nome = z.string().trim().min(2, "Informe o nome (mínimo 2 letras)").max(80, "Nome muito longo");
export const numeroSchema = z.string().trim().min(1, "Informe o número").transform((v, c) => {
  const n = normalizarNumero(v);
  if (!n) { c.addIssue({ code: "custom", message: "Número inválido: use DDD + número (ex.: 31 99999-9999) ou +DDI" }); return z.NEVER; }
  return n;
});
export const contatoSchema = z.object({ nome, numero: numeroSchema });

export const MAX_TEXTO_WA = 4000;
export const templateSchema = z.object({
  nome: z.string().trim().min(2, "Dê um nome ao modelo").max(60, "Nome muito longo"),
  texto: z.string().trim().min(1, "Escreva o texto do modelo").max(MAX_TEXTO_WA, `Até ${MAX_TEXTO_WA} caracteres`),
  categoria: z.string().trim().min(2, "Categoria muito curta").max(30, "Categoria muito longa").default("Geral"),
});
/** Sugestões de categoria no editor de modelos (pode escrever outra). */
export const CATEGORIAS_MODELO = ["Geral", "Boas-vindas", "Ofertas", "Follow-up", "Cobrança", "Suporte"] as const;

/** Variáveis dos modelos. {site} = site de onde o lead veio (vazio se não for lead). */
export const VARIAVEIS_MODELO = { "{nome}": "nome do contato", "{primeiro_nome}": "primeiro nome", "{numero}": "telefone", "{site}": "site de onde o lead veio" } as const;
export function preencherModelo(texto: string, c: { nome: string; numero: string; site?: string | null }): string {
  const primeiro = c.nome.trim().split(/\s+/)[0] ?? "";
  return texto.replaceAll("{primeiro_nome}", primeiro).replaceAll("{nome}", c.nome.trim()).replaceAll("{numero}", formatarNumero(c.numero)).replaceAll("{site}", c.site ?? "");
}

/** Tipo de mídia da mensagem pelo mime. */
export const tipoMidia = (mime: string): "imagem" | "video" | "audio" | "documento" =>
  mime.startsWith("image/") ? "imagem" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "documento";

// ───────────── Leads dos sites (mini-CRM) ─────────────

/** Colunas do funil (tabela ads.crm_etapas, configuráveis em Leads). A chave é o que fica no contato. */
export const TIPOS_ETAPA = ["ABERTO", "GANHO", "PERDIDO"] as const;
export type TipoEtapa = (typeof TIPOS_ETAPA)[number];
export interface EtapaCrm { chave: string; nome: string; cor: string; ordem: number; tipo: TipoEtapa; dica: string | null }
/** Etapa de entrada: todo lead chega nela; não pode ser apagada. */
export const ETAPA_ENTRADA = "NOVO";
export const etapaSchema = z.string().regex(/^[A-Z0-9_]{2,40}$/, "Etapa inválida").nullable();
export const CORES_ETAPA = ["#c084fc", "#a855ff", "#5b8cff", "#22d3ee", "#2dd4bf", "#3ddc97", "#a3e635", "#facc15", "#ffb020", "#fb923c", "#ff4d5e", "#f472b6", "#9696a8"] as const;
export const etapaCrmSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome à coluna").max(30, "Nome muito longo (até 30)"),
  cor: z.string().trim().toLowerCase().regex(/^#[0-9a-f]{6}$/, "Cor inválida"),
  tipo: z.enum(TIPOS_ETAPA, { message: "Tipo inválido" }),
  dica: z.string().trim().max(80, "Descrição muito longa (até 80)").transform((v) => v || null),
});
/** "Em proposta" → "EM_PROPOSTA" (chave nova; o banco garante que não repete). */
export const chaveEtapa = (nome: string) =>
  nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "ETAPA";
/** Filtros do funil (salvos em ads.crm_filtros). Campo ausente = padrão, então filtro salvo antigo continua válido. */
export const filtroCrmSchema = z.object({
  busca: z.string().trim().max(100).default(""),
  periodo: z.enum(["hoje", "7", "30", "90", "tudo"]).default("30"),
  situacao: z.enum(["todas", "esperando", "esfriando", "respondeu", "silencio", "parado"]).default("todas"),
  sites: z.array(z.string().max(60)).max(30).default([]),
  origens: z.array(z.string().max(80)).max(30).default([]),
  valor: z.enum(["todos", "com", "sem"]).default("todos"),
  ordem: z.enum(["recentes", "antigos", "valor", "parado", "nome"]).default("recentes"),
});
export type FiltrosCrm = z.output<typeof filtroCrmSchema>;
export interface FiltroSalvo { id: string; nome: string; filtros: FiltrosCrm; favorito: boolean; padrao: boolean }
/** "#22c55e" → "34 197 94", o formato das variáveis de cor do CSS (rgb(var(--e) / 0.1)). */
export const rgbCor = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0).join(" ");
/** "1234.5" → "R$ 1.234,50"; inteiro sem centavos se `curto`. */
export const reais = (v: string | number, curto = false) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: curto ? 0 : 2, minimumFractionDigits: curto ? 0 : 2 });

export const CONSENTIMENTO = "Aceito ser contatado pelo WhatsApp.";
const curto = (max: number) => z.string().trim().max(max).optional().catch(undefined);

/** O que o formulário do site manda. Consentimento é obrigatório (LGPD): sem ele o lead não entra. */
export const leadSchema = z.object({
  nome,
  numero: numeroSchema,
  mensagem: z.string().trim().max(1000, "Mensagem muito longa (até 1000 caracteres)").optional().default(""),
  consentimento: z.union([z.literal(true), z.enum(["on", "sim", "true", "1"])], { message: "Marque que aceita ser contatado pelo WhatsApp" }),
  pagina: curto(500),
  utm_source: curto(120), utm_medium: curto(120), utm_campaign: curto(120), utm_term: curto(120), utm_content: curto(120),
}).transform((l) => ({
  nome: l.nome, numero: l.numero, mensagem: l.mensagem, pagina: l.pagina || null,
  utm: Object.fromEntries(Object.entries({ source: l.utm_source, medium: l.utm_medium, campaign: l.utm_campaign, term: l.utm_term, content: l.utm_content })
    .filter((e): e is [string, string] => !!e[1])),
}));
export type Lead = z.output<typeof leadSchema>;

/**
 * Lead mandado por um sistema conectado (servidor→servidor, com a chave domus_). O consentimento é o texto que a
 * pessoa aceitou lá (ex.: a Política de Privacidade do teste grátis): obrigatório, fica guardado no contato.
 */
export const leadSistemaSchema = z.object({
  nome,
  numero: numeroSchema,
  consentimento: z.string({ message: "Mande o texto que a pessoa aceitou (consentimento)" }).trim().min(5, "Mande o texto que a pessoa aceitou (consentimento)").max(300),
  origem: z.string().trim().min(2).max(60).optional(),
  mensagem: z.string().trim().max(1000, "Mensagem muito longa (até 1000 caracteres)").optional(),
  email: z.email("E-mail inválido").max(200).optional(),
  pagina: curto(500),
});

/** "https://www.castilho.adv.br/, outro.com" → ["castilho.adv.br", "outro.com"]. */
export const lerDominios = (t: string) =>
  [...new Set(t.split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/:].*$/, "")).filter(Boolean))];

export const leadSiteSchema = z.object({
  nome: z.string().trim().min(2, "Dê um nome ao site").max(60, "Nome muito longo"),
  dominios: z.string().max(500, "Domínios demais").transform(lerDominios)
    .pipe(z.array(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Domínio inválido: use só o endereço (ex.: meusite.com.br)")).max(10, "Até 10 domínios")),
  mensagem_inicial: z.string().trim().min(5, "Escreva a mensagem que o lead manda ao abrir o WhatsApp").max(500, "Mensagem muito longa"),
});

/** Origem do navegador está nos domínios do site (subdomínio vale). Lista vazia = qualquer um. */
export function dominioPermitido(origem: string | null, dominios: string[]): boolean {
  if (!dominios.length) return true;
  let host: string;
  try { host = new URL(origem ?? "").hostname.toLowerCase(); } catch { return false; }
  return dominios.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Link que abre o WhatsApp do lead já com a mensagem escrita: é ele quem começa a conversa. */
export const linkWhatsapp = (numero: string, texto: string) => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;

// ───────────── Travas contra ban (primeiro contato) ─────────────

/** Link na primeira mensagem (conversa em que a pessoa nunca respondeu) é o que mais vira denúncia de spam. */
export const temLink = (t: string) => /(https?:\/\/|www\.)\S+|\b[\w-]+\.(com|br|net|org|app|io|site|link|ly)\b/i.test(t);
export const FRIO = {
  /** mensagens numa conversa antes da pessoa responder */
  porConversa: 3,
  /** conversas novas que nós começamos */
  porHora: 10,
  porDia: 40,
  /** espera entre dois envios do número (segundos, sorteado) */
  intervalo: [4, 12] as const,
};
