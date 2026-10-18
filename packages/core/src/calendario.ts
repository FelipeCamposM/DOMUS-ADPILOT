import { z } from "zod";
import { LIMITES_IG } from "./instagram-regras";
import { ESTILOS, VOZES, type EstiloVisual } from "./video";

/**
 * Calendário de conteúdo (sem dependência de servidor: a tela usa as mesmas regras que o worker).
 * Stories ficam de fora: na fase 3 todo post vira story automaticamente.
 */
export const FORMATOS_CAL = { FEED: "Post", CARROSSEL: "Carrossel", REELS: "Reels" } as const;
export type FormatoCal = keyof typeof FORMATOS_CAL;
const formatos = Object.keys(FORMATOS_CAL) as [FormatoCal, ...FormatoCal[]];

/** Um campo plano para todos os formatos: post usa headline/apoio/cta/visual; carrossel, slides; Reels, narração e duração. */
export const roteiroSchema = z.object({
  headline: z.string().trim().max(120, "Título da arte com no máximo 120 caracteres").default(""),
  apoio: z.string().trim().max(200, "Texto de apoio com no máximo 200 caracteres").default(""),
  cta: z.string().trim().max(60, "Chamada com no máximo 60 caracteres").default(""),
  visual: z.string().trim().max(400, "Descrição visual com no máximo 400 caracteres").default(""),
  slides: z.array(z.object({
    headline: z.string().trim().min(1, "Todo slide precisa de um título").max(120, "Título do slide muito longo"),
    apoio: z.string().trim().max(200, "Texto do slide muito longo").default(""),
    visual: z.string().trim().max(400, "Visual do slide muito longo").default(""),
  })).max(LIMITES_IG.carrosselMax, `No máximo ${LIMITES_IG.carrosselMax} slides`).default([]),
  narracao: z.string().trim().max(1500, "Narração muito longa").default(""),
  duracao: z.coerce.number().refine((n) => n === 15 || n === 30, "Duração: 15 ou 30 segundos").default(30),
});
export type Roteiro = z.infer<typeof roteiroSchema>;

export const hashtagsSchema = z.array(z.string().trim().regex(/^#[\p{L}\p{N}_]{2,60}$/u, "Hashtag inválida (comece com # e sem espaços)"))
  .max(LIMITES_IG.hashtags, `No máximo ${LIMITES_IG.hashtags} hashtags`);

export const itemCalSchema = z.object({
  dataHora: z.string().datetime({ offset: true, message: "Data inválida" }),
  formato: z.enum(formatos, { message: "Formato inválido" }),
  tema: z.string().trim().min(2, "Escreva o tema").max(160, "Tema com no máximo 160 caracteres"),
  objetivo: z.string().trim().max(300, "Objetivo muito longo").default(""),
  roteiro: roteiroSchema,
  legenda: z.string().trim().max(LIMITES_IG.legenda, `Legenda com no máximo ${LIMITES_IG.legenda} caracteres`).default(""),
  hashtags: hashtagsSchema.default([]),
});
export type ItemCal = z.infer<typeof itemCalSchema>;

/** O que falta para aprovar (vazio = pode aprovar). */
export function faltasItem(i: { formato: FormatoCal; roteiro: Roteiro; legenda: string; hashtags: string[] }): string[] {
  const f: string[] = [];
  if (i.formato === "FEED" && !i.roteiro.headline) f.push("Falta o título da arte");
  if (i.formato === "CARROSSEL" && i.roteiro.slides.length < LIMITES_IG.carrosselMin) f.push(`O carrossel precisa de pelo menos ${LIMITES_IG.carrosselMin} slides`);
  if (i.formato === "REELS" && i.roteiro.narracao.length < 20) f.push("Falta o roteiro da narração");
  if (!i.legenda) f.push("Falta a legenda");
  if (`${i.legenda}\n\n${i.hashtags.join(" ")}`.length > LIMITES_IG.legenda) f.push(`Legenda + hashtags passam de ${LIMITES_IG.legenda} caracteres`);
  return f;
}

export const CAMPOS_REFAZER = ["item", "tema", "roteiro", "legenda", "hashtags"] as const;
export type CampoRefazer = (typeof CAMPOS_REFAZER)[number];

/** Pedido de um planejamento: período (até 5 semanas), objetivo e quantos de cada formato por semana. */
export const pedidoCalSchema = z.object({
  contaId: z.string().uuid("Perfil inválido"),
  marcaId: z.string().uuid("Marca inválida").nullable(),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inicial inválida"),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data final inválida"),
  objetivo: z.string().trim().min(5, "Conte o objetivo do período (ex.: vender o plano anual, ganhar seguidores)").max(1000, "Objetivo muito longo"),
  mix: z.object({ FEED: z.number().int().min(0).max(7), CARROSSEL: z.number().int().min(0).max(7), REELS: z.number().int().min(0).max(7) }),
}).refine((p) => p.fim >= p.inicio, { message: "A data final vem antes da inicial", path: ["fim"] })
  .refine((p) => (Date.parse(p.fim) - Date.parse(p.inicio)) / 86_400_000 <= 35, { message: "Planeje no máximo 5 semanas por vez", path: ["fim"] })
  .refine((p) => p.mix.FEED + p.mix.CARROSSEL + p.mix.REELS > 0, { message: "Escolha ao menos um post por semana", path: ["mix"] });
export type PedidoCal = z.infer<typeof pedidoCalSchema>;

/** Configurações → Calendário: tolerância de atraso e voz/estilo dos Reels (a arte é gerada logo que o post é aprovado). */
export const configCalSchema = z.object({
  toleranciaH: z.number().min(0.5, "Mínimo meia hora").max(24, "Máximo 24 horas"),
  // Reels do calendário: voz local e estilo visual
  voz: z.enum(Object.keys(VOZES) as [keyof typeof VOZES, ...(keyof typeof VOZES)[]], { message: "Voz inválida" }).default("pf_dora"),
  estiloVideo: z.enum(Object.keys(ESTILOS) as [EstiloVisual, ...EstiloVisual[]], { message: "Estilo inválido" }).default("hud"),
});
export type ConfigCal = z.infer<typeof configCalSchema>;
export const CONFIG_CAL_PADRAO: ConfigCal = { toleranciaH: 3, voz: "pf_dora", estiloVideo: "hud" };
