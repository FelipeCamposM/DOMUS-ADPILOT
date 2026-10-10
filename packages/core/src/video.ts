import { z } from "zod";

/** Vocabulário do Video Studio (spec §15–§21). */
export const FORMATOS = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080], "4:5": [1080, 1350] } as const;
export type Formato = keyof typeof FORMATOS;
export const DURACOES = [10, 15, 20, 30, 45, 60] as const;
export const SFX_CATEGORIAS = ["whoosh", "impact", "click", "pop", "notification", "typing", "success", "transition", "bass", "interface"] as const;
export const MUSICA_TAGS = ["corporate", "technology", "dark", "energetic", "emotional", "minimal", "premium"] as const;
/** Vozes locais (Kokoro, pt-BR). "none" = sem narração. */
export const ehVozLocal = (v: string) => v in VOZES;
export const VOZES = { pf_dora: "Dora (feminina)", pm_alex: "Alex (masculina)", pm_santa: "Santa (masculina, grave)", none: "Sem narração" } as const;

/**
 * Estilos visuais dos vídeos: cada um é um pacote de pele (cores, formas, tipografia) + personalidade de movimento,
 * aplicado sobre as cenas prontas. "livre" = a IA escreve a animação do zero (mais variedade, qualidade menos estável).
 */
export const ESTILOS = {
  hud: { nome: "Tech HUD", descricao: "Fundo escuro com grade, brilho neon, painéis de vidro, moldura de interface; movimento rápido e preciso." },
  clay: { nome: "Claymorphism 3D", descricao: "Formas infladas de massinha, cantos bem redondos, sombras suaves internas e externas, cores pastel; movimento elástico com quique." },
  editorial: { nome: "Editorial", descricao: "Minimalista de revista: muito respiro, tipografia grande serifada, fios finos, cor de destaque única; movimento lento e elegante." },
  livre: { nome: "Livre (IA)", descricao: "A IA cria a animação do zero a cada vídeo: mais variedade, resultado menos previsível." },
} as const;
export type EstiloVisual = keyof typeof ESTILOS;

/** Cenas prontas: a IA escolhe o tipo e escreve os textos; layout e movimento vêm do modelo (qualidade constante). */
export const TIPOS_CENA = ["abertura", "titulo", "lista", "numero", "comparacao", "produto", "citacao", "cta"] as const;
export type TipoCena = (typeof TIPOS_CENA)[number];

/**
 * Identidade visual da peça: a do workspace (Configurações → Marca) ou a das referências do projeto (sites, Instagram e
 * imagens enviadas: o worker baixa as fotos e extrai a paleta). Serve para criar artes de outra marca no mesmo workspace.
 */
export const IDENTIDADES = ["workspace", "referencias"] as const;
export type Identidade = (typeof IDENTIDADES)[number];
const temObjetivo = (b: { objetivo: string; orientacao: string }) => b.objetivo.length >= 2 || b.orientacao.length >= 2;
const MSG_OBJETIVO = { message: "Escreva o objetivo ou as orientações para a IA", path: ["objetivo"] };

export const briefSchema = z.object({
  produto: z.string().trim().min(2, "Informe o produto").max(120),
  objetivo: z.string().trim().max(300).default(""),
  descricao: z.string().trim().max(2000).default(""),
  // orientação livre ("do que se trata"), como se falasse com o diretor de criação
  orientacao: z.string().trim().max(4000, "Orientação muito longa (até 4000 caracteres)").default(""),
  duracao: z.coerce.number().refine((n) => (DURACOES as readonly number[]).includes(n), "Duração inválida"),
  formato: z.enum(Object.keys(FORMATOS) as [Formato, ...Formato[]], { message: "Formato inválido" }),
  estilo: z.string().trim().max(300).default("premium, moderno, tipografia forte"),
  publico: z.string().trim().max(300).default(""),
  cta: z.string().trim().max(120).default(""),
  cores: z.string().trim().max(200).default(""),
  // voz local (Kokoro) ou do ElevenLabs ("el:<voice_id>", com o nome em vozNome)
  voz: z.string().refine((v) => v in VOZES || /^el:[A-Za-z0-9]{8,40}$/.test(v), "Voz inválida").default("pf_dora"),
  vozNome: z.string().trim().max(80).default(""),
  // auto = a IA escolhe o clima; sem música licenciada na biblioteca, a trilha é composta (original) no worker
  musica: z.enum(["none", "auto", ...MUSICA_TAGS]).default("auto"),
  efeitos: z.coerce.boolean().default(true),
  estiloVisual: z.enum(Object.keys(ESTILOS) as [EstiloVisual, ...EstiloVisual[]], { message: "Estilo inválido" }).default("hud"),
  legendas: z.coerce.boolean().default(true),
  identidade: z.enum(IDENTIDADES).default("workspace"),
}).refine(temObjetivo, MSG_OBJETIVO);
export type Brief = z.infer<typeof briefSchema>;

/** Imagens: formatos de feed/stories e o 1,91:1 dos anúncios com link da Meta. */
export const FORMATOS_IMAGEM = { "1:1": [1080, 1080], "4:5": [1080, 1350], "9:16": [1080, 1920], "1.91:1": [1200, 628] } as const;
export type FormatoImagem = keyof typeof FORMATOS_IMAGEM;

/** Carrossel do Instagram: até 20 slides (limite atual do app), em 1:1 ou 4:5. */
export const MAX_SLIDES = 20;

export const briefImagemSchema = z.object({
  produto: z.string().trim().min(2, "Informe o produto").max(120),
  objetivo: z.string().trim().max(300).default(""),
  descricao: z.string().trim().max(2000).default(""),
  orientacao: z.string().trim().max(4000, "Orientação muito longa (até 4000 caracteres)").default(""),
  tipo: z.enum(["avulsa", "carrossel"]).default("avulsa"),
  estiloVisual: z.enum(Object.keys(ESTILOS) as [EstiloVisual, ...EstiloVisual[]], { message: "Estilo inválido" }).default("livre"),
  slides: z.coerce.number().int().min(2, "Carrossel com no mínimo 2 slides").max(MAX_SLIDES, `O Instagram aceita até ${MAX_SLIDES} slides`).default(5),
  publico: z.string().trim().max(300).default(""),
  cta: z.string().trim().max(120).default(""),
  cores: z.string().trim().max(200).default(""),
  estilo: z.string().trim().max(300).default("premium, moderno, tipografia forte"),
  texto: z.string().trim().max(200).default(""), // texto exato desejado na arte (opcional)
  formato: z.enum(Object.keys(FORMATOS_IMAGEM) as [FormatoImagem, ...FormatoImagem[]], { message: "Formato inválido" }),
  variacoes: z.coerce.number().int().min(1, "Mínimo 1 variação").max(4, "Máximo 4 variações").default(3),
  identidade: z.enum(IDENTIDADES).default("workspace"),
}).refine(temObjetivo, MSG_OBJETIVO).refine((b) => b.tipo !== "carrossel" || b.formato === "1:1" || b.formato === "4:5", { message: "Carrossel do Instagram: use 1:1 ou 4:5", path: ["formato"] });
export type BriefImagem = z.infer<typeof briefImagemSchema>;

/** Storyboard estruturado (spec §18): gerado antes do código, editável depois. Tempos em segundos absolutos. */
export const storyboardSchema = z.object({
  title: z.string().min(1).max(120),
  duration: z.number().positive().max(120),
  fps: z.literal(30).default(30),
  scenes: z.array(z.object({
    start: z.number().min(0),
    end: z.number().positive(),
    headline: z.string().min(1).max(140),
    subtext: z.string().max(220).optional().default(""),
    narration: z.string().max(600).optional().default(""),
    // tempo de cada palavra da narração (segundos absolutos), quando a voz informa (ElevenLabs)
    words: z.array(z.object({ w: z.string(), start: z.number() })).max(200).optional(),
    fala: z.number().positive().optional(), // duração da narração da cena (s), preenchida pelo worker
    // cena pronta (estilos com modelo): tipo + dados extras do modelo
    tipo: z.enum(TIPOS_CENA).optional(),
    itens: z.array(z.string().trim().min(1).max(90)).max(4).optional(),
    numero: z.object({ valor: z.number(), prefixo: z.string().max(6).default(""), sufixo: z.string().max(10).default(""), casas: z.number().int().min(0).max(2).default(0) }).optional(),
    destaque: z.array(z.string().max(40)).max(3).optional(),
    asset: z.string().regex(/^assets\/[\w.-]+$/, "Arquivo inválido").optional(),
    animation: z.string().max(60).default("fade-up"),
    visual: z.string().max(400).optional().default(""),
  }).refine((s) => s.end > s.start, "Cena com fim antes do início")).min(1).max(20),
  sfx: z.array(z.object({
    time: z.number().min(0),
    effect: z.enum(SFX_CATEGORIAS),
    volume: z.number().min(0).max(1).default(0.6),
  })).max(40).default([]),
  music: z.object({ tag: z.enum(MUSICA_TAGS), volume: z.number().min(0).max(1).default(0.25) }).nullable().default(null),
});
export type Storyboard = z.infer<typeof storyboardSchema>;

/**
 * Tempo mínimo para LER o texto fixo da cena (headline, apoio, itens, número), em segundos: entrada + leitura
 * (~0,3 s por palavra, mínimo 1,4 s) + saída. A legenda da narração não entra: ela acompanha a voz.
 */
export function tempoLeitura(s: { headline: string; subtext?: string; itens?: string[]; tipo?: string }): number {
  const palavras = (t?: string) => (t ?? "").trim().split(/\s+/).filter(Boolean).length;
  const n = palavras(s.headline) + palavras(s.subtext) + (s.itens ?? []).reduce((a, i) => a + palavras(i), 0);
  const extraItens = (s.itens?.length ?? 0) * 0.35; // itens entram um a um
  return +(0.9 + Math.max(1.4, n * 0.3) + extraItens + 0.5).toFixed(2);
}

/** Reajusta as cenas em sequência para caberem as narrações (dur. mínima por cena). Mantém a ordem e a proporção. */
export function retimeScenes(sb: Storyboard, minPorCena: number[]): Storyboard {
  let t = 0;
  const offsets: { de: number; para: number; fimDe: number; fimPara: number }[] = [];
  const scenes = sb.scenes.map((s, i) => {
    const dur = Math.max(s.end - s.start, minPorCena[i] ?? 0);
    const nova = { ...s, start: round(t), end: round(t + dur) };
    offsets.push({ de: s.start, para: nova.start, fimDe: s.end, fimPara: nova.end });
    t += dur;
    return nova;
  });
  // SFX acompanham a cena em que estavam (mesma posição relativa)
  const sfx = sb.sfx.map((e) => {
    const o = offsets.find((x) => e.time >= x.de && e.time < x.fimDe) ?? offsets.at(-1)!;
    const rel = o.fimDe > o.de ? (e.time - o.de) / (o.fimDe - o.de) : 0;
    return { ...e, time: round(o.para + rel * (o.fimPara - o.para)) };
  });
  return { ...sb, scenes, sfx, duration: round(t) };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Conceitos de imagem que o usuário aprova (e pode editar) antes de a IA desenhar e o worker renderizar. */
export const conceitoImagemSchema = z.object({
  conceito: z.string().trim().min(2, "Descreva o conceito").max(120, "Conceito muito longo"),
  headline: z.string().trim().min(1, "Toda arte precisa de uma headline").max(120, "Headline muito longa"),
  apoio: z.string().trim().max(200, "Texto de apoio muito longo").default(""),
  cta: z.string().trim().max(60, "CTA muito longo").default(""),
  visual: z.string().trim().max(400, "Descrição visual muito longa").default(""),
});
export type ConceitoImagem = z.infer<typeof conceitoImagemSchema>;
// avulsa: até 4 conceitos (A/B) · carrossel: 1 item por slide, até MAX_SLIDES
export const planoImagemSchema = z.object({ conceitos: z.array(conceitoImagemSchema).min(1, "Mantenha pelo menos 1 conceito").max(MAX_SLIDES, `Máximo ${MAX_SLIDES} slides`) });
export type PlanoImagem = z.infer<typeof planoImagemSchema>;

