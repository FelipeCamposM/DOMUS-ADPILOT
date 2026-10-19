import { z } from "zod";
import { FORMATOS, IDENTIDADES, MUSICA_TAGS, SFX_CATEGORIAS, type Formato } from "./video";

/**
 * EDITAR MEU VÍDEO: o usuário envia o próprio vídeo (falando para a câmera ou não) e o worker transcreve no PC
 * (Whisper local, GPU), corta as pausas, legenda palavra por palavra e coloca animações por cima.
 */
export const MAX_FONTE_S = 180; // até 3 min de vídeo enviado
export const MAX_FONTE_MB = 1024;

/** Redes com a interface do app por cima do vídeo vertical. "todas" = respeita as três ao mesmo tempo. */
export const REDES = { instagram: "Instagram Reels", tiktok: "TikTok", youtube: "YouTube Shorts", todas: "Todas as redes" } as const;
export type Rede = keyof typeof REDES;

/**
 * Áreas cobertas pela interface no 9:16, em fração do quadro (x0,y0 → x1,y1). Fontes (conferidas em out/2026):
 * Instagram: guia de anúncios da Meta ("14% do topo, 35% de baixo e 6% de cada lado"), com a coluna de botões à direita.
 * TikTok: modelo de área segura do TikTok Ads Manager (240/660/120/120 px a 1080×1920; botões alargam a direita para 300 px na metade de baixo).
 * YouTube Shorts: Google ("evite os 10% de cima, os 25% de baixo e os 10% da direita").
 * Nenhuma rede publica a área do orgânico: as do anúncio são as mais conservadoras.
 */
export interface Zona { x0: number; y0: number; x1: number; y1: number; rotulo: string }
export const ZONAS_REDE: Record<Exclude<Rede, "todas">, Zona[]> = {
  instagram: [
    { x0: 0, y0: 0, x1: 1, y1: 0.14, rotulo: "Reels e câmera" },
    { x0: 0, y0: 0.65, x1: 1, y1: 1, rotulo: "Perfil, descrição e áudio" },
    { x0: 0.86, y0: 0.45, x1: 1, y1: 0.65, rotulo: "Curtir, comentar, enviar" },
    { x0: 0, y0: 0.14, x1: 0.06, y1: 0.65, rotulo: "Margem" },
    { x0: 0.94, y0: 0.14, x1: 1, y1: 0.45, rotulo: "Margem" },
  ],
  tiktok: [
    { x0: 0, y0: 0, x1: 1, y1: 0.125, rotulo: "Seguindo / Para você" },
    { x0: 0, y0: 0.656, x1: 1, y1: 1, rotulo: "Perfil, descrição e som" },
    { x0: 0.722, y0: 0.5, x1: 1, y1: 0.656, rotulo: "Curtir, comentar, salvar" },
    { x0: 0.889, y0: 0.125, x1: 1, y1: 0.5, rotulo: "Foto do perfil" },
    { x0: 0, y0: 0.125, x1: 0.111, y1: 0.656, rotulo: "Margem" },
  ],
  youtube: [
    { x0: 0, y0: 0, x1: 1, y1: 0.1, rotulo: "Pesquisa e menu" },
    { x0: 0, y0: 0.75, x1: 1, y1: 1, rotulo: "Canal, título e inscrever" },
    { x0: 0.9, y0: 0.1, x1: 1, y1: 0.75, rotulo: "Gostei, comentar, compartilhar" },
  ],
};

/** Zonas bloqueadas em px para a rede e o formato. Fora do 9:16 (feed, YouTube deitado) vale uma margem simples. */
export function zonasPara(rede: Rede, formato: Formato): (Zona & { rede: string })[] {
  const [w, h] = FORMATOS[formato];
  const px = (z: Zona, rede: string) => ({ ...z, x0: z.x0 * w, x1: z.x1 * w, y0: z.y0 * h, y1: z.y1 * h, rede });
  if (formato !== "9:16") {
    const m = 0.05, b = formato === "16:9" ? 0.12 : 0.08;
    return [
      { x0: 0, y0: 0, x1: 1, y1: m, rotulo: "Margem" }, { x0: 0, y0: 1 - b, x1: 1, y1: 1, rotulo: formato === "16:9" ? "Controles do player" : "Margem" },
      { x0: 0, y0: m, x1: m, y1: 1 - b, rotulo: "Margem" }, { x0: 1 - m, y0: m, x1: 1, y1: 1 - b, rotulo: "Margem" },
    ].map((z) => px(z, "geral"));
  }
  const redes = rede === "todas" ? (Object.keys(ZONAS_REDE) as (keyof typeof ZONAS_REDE)[]) : [rede];
  return redes.flatMap((r) => ZONAS_REDE[r].map((z) => px(z, r)));
}

/** Topo e base livres: abaixo das faixas de cima e acima das de baixo (as que ocupam a largura toda). */
export function limitesVerticais(zonas: Zona[], w: number, h: number) {
  const larga = zonas.filter((z) => z.x0 <= 1 && z.x1 >= w - 1);
  return { topo: Math.max(0, ...larga.filter((z) => z.y0 <= 1).map((z) => z.y1)), base: Math.min(h, ...larga.filter((z) => z.y1 >= h - 1).map((z) => z.y0)) };
}

/** Largura livre numa faixa horizontal (de y0 a y1): desconta margens e colunas de botões que encostam nas laterais. */
export function faixaLivre(zonas: Zona[], y0: number, y1: number, w: number): { x0: number; x1: number } {
  let x0 = 0, x1 = w;
  for (const z of zonas) {
    if (z.y1 <= y0 || z.y0 >= y1) continue;
    if (z.x0 <= 1 && z.x1 < w - 1) x0 = Math.max(x0, z.x1);
    else if (z.x1 >= w - 1 && z.x0 > 1) x1 = Math.min(x1, z.x0);
  }
  return { x0, x1 };
}

/** Estilos de legenda (a palavra falada sempre ganha destaque, cada estilo de um jeito). */
export const ESTILOS_LEGENDA = {
  karaoke: { nome: "Karaokê", descricao: "Caixa escura; a palavra falada acende na cor da marca" },
  impacto: { nome: "Impacto", descricao: "Caixa alta, fonte pesada com contorno; a palavra falada cresce em amarelo" },
  marca: { nome: "Faixa da marca", descricao: "Fundo na cor da marca; um marcador corre atrás da palavra falada" },
  minimal: { nome: "Minimalista", descricao: "Branco com sombra suave, sem caixa; a palavra falada ganha sublinhado" },
  neon: { nome: "Neon", descricao: "Texto brilhando na cor de destaque, sem fundo" },
  palavra: { nome: "Uma palavra", descricao: "Uma palavra por vez, grande, com pop" },
  profundidade: { nome: "3D", descricao: "Texto com profundidade (extrusão) e entrada girando em 3D" },
} as const;
export type EstiloLegenda = keyof typeof ESTILOS_LEGENDA;

const chaves = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const briefEdicaoSchema = z.object({
  produto: z.string().trim().min(2, "Dê um título ou assunto ao vídeo").max(120, "Título muito longo"),
  orientacao: z.string().trim().max(4000, "Orientação muito longa (até 4000 caracteres)").default(""),
  videoId: z.string().uuid("Envie o vídeo"),
  formato: z.enum(chaves(FORMATOS), { message: "Formato inválido" }).default("9:16"),
  rede: z.enum(chaves(REDES), { message: "Rede inválida" }).default("todas"),
  legendas: z.coerce.boolean().default(true),
  estiloLegenda: z.enum(chaves(ESTILOS_LEGENDA), { message: "Estilo de legenda inválido" }).default("karaoke"),
  cortarPausas: z.coerce.boolean().default(true),
  animacoes: z.coerce.boolean().default(true), // títulos, destaques e CTA automáticos
  musica: z.enum(["none", "auto", ...MUSICA_TAGS], { message: "Música inválida" }).default("none"),
  identidade: z.enum(IDENTIDADES).default("workspace"),
});
export type BriefEdicao = z.infer<typeof briefEdicaoSchema>;

export const TIPOS_OVERLAY = ["titulo", "destaque", "lista", "numero", "cta", "nome", "emoji"] as const;
/** Entradas com cara de 3D (perspectiva CSS + GSAP). */
export const ENTRADAS = ["flip", "orbita", "profundidade", "dobra", "pop", "deslize"] as const;
/** Efeitos no próprio vídeo, aplicados sob pedido. */
export const EFEITOS_VIDEO = ["inclinar", "flash", "tremor", "pb", "vinheta", "desfoque"] as const;

const t = z.number().min(0).max(MAX_FONTE_S + 5);
const palavraSchema = z.object({ w: z.string().min(1).max(40), s: t, e: t });
export type Palavra = z.infer<typeof palavraSchema>;

/** Uma animação por cima do vídeo (título, destaque, lista, número, CTA, nome, emoji). */
export const overlaySchema = z.object({
  tipo: z.enum(TIPOS_OVERLAY),
  start: t, end: t,
  texto: z.string().trim().min(1).max(90),
  sub: z.string().trim().max(140).optional().default(""),
  itens: z.array(z.string().trim().min(1).max(60)).max(4).optional(),
  numero: z.object({ valor: z.number(), prefixo: z.string().max(6).default(""), sufixo: z.string().max(10).default("") }).optional(),
  entrada: z.enum(ENTRADAS).default("flip"),
  posicao: z.enum(["topo", "centro", "base"]).default("topo"),
}).refine((o) => o.end > o.start, "Animação com fim antes do início");

export const planoEdicaoSchema = z.object({
  title: z.string().min(1).max(120),
  duration: z.number().positive().max(MAX_FONTE_S + 5),
  fps: z.literal(30).default(30),
  // trechos do vídeo original que ficam (o resto é pausa cortada), em segundos do original
  cortes: z.array(z.object({ de: z.number().min(0), ate: z.number().positive() })).min(1).max(600),
  // pausa máxima mantida (s); null = sem cortar pausas
  pausa: z.number().min(0.2).max(2).nullable().default(0.45),
  // fala transcrita, em segundos do vídeo JÁ editado
  palavras: z.array(palavraSchema).max(3000).default([]),
  // rosto(s) na tela (fração do quadro), para a legenda não cobrir
  rostos: z.array(z.object({ t, x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })).max(800).default([]),
  overlays: z.array(overlaySchema).max(40).default([]),
  zooms: z.array(z.object({ start: t, end: t, escala: z.number().min(1.02).max(1.8).default(1.15), x: z.number().min(0).max(1).default(0.5), y: z.number().min(0).max(1).default(0.4) })).max(60).default([]),
  efeitos: z.array(z.object({ tipo: z.enum(EFEITOS_VIDEO), start: t, end: t })).max(40).default([]),
  sfx: z.array(z.object({ time: t, effect: z.enum(SFX_CATEGORIAS), volume: z.number().min(0).max(1).default(0.5) })).max(80).default([]),
  music: z.object({ tag: z.enum(MUSICA_TAGS), volume: z.number().min(0).max(1).default(0.12) }).nullable().default(null),
});
export type PlanoEdicao = z.infer<typeof planoEdicaoSchema>;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Corta as pausas: mantém só os trechos com fala (mais uma folga antes/depois de cada um) e remapeia as palavras para
 * o tempo do vídeo editado. Sem fala, o vídeo fica inteiro.
 */
export function cortarPausas(palavras: Palavra[], duracao: number, o: { pausa?: number; folga?: number } = {}): { cortes: { de: number; ate: number }[]; palavras: Palavra[] } {
  const pausa = o.pausa ?? 0.45, folga = o.folga ?? 0.15;
  if (!palavras.length) return { cortes: [{ de: 0, ate: r3(duracao) }], palavras: [] };
  const cortes: { de: number; ate: number }[] = [];
  let de = Math.max(0, palavras[0]!.s - folga);
  palavras.forEach((p, i) => {
    const prox = palavras[i + 1];
    if (prox && prox.s - p.e <= pausa) return;
    const ate = Math.min(duracao, p.e + (prox ? folga : folga + 0.25));
    const ultimo = cortes.at(-1);
    if (ultimo && de - ultimo.ate < 0.05) ultimo.ate = r3(ate); // folgas se encostaram: um trecho só
    else cortes.push({ de: r3(de), ate: r3(ate) });
    if (prox) de = Math.max(ate, prox.s - folga);
  });
  return { cortes, palavras: palavras.map((p) => ({ w: p.w, s: paraEditado(cortes, p.s), e: paraEditado(cortes, p.e) })) };
}

/** Tempo do original → tempo do editado (o que cai num corte vai para a emenda seguinte). */
export function paraEditado(cortes: { de: number; ate: number }[], t: number): number {
  let acc = 0;
  for (const c of cortes) {
    if (t < c.de) return r3(acc);
    if (t <= c.ate) return r3(acc + t - c.de);
    acc += c.ate - c.de;
  }
  return r3(acc);
}

/** Tempo do editado → tempo do original (para recortar de novo com outra pausa sem perder as animações). */
export function paraOriginal(cortes: { de: number; ate: number }[], t: number): number {
  let acc = 0;
  for (const c of cortes) {
    const d = c.ate - c.de;
    if (t <= acc + d) return r3(c.de + Math.max(0, t - acc));
    acc += d;
  }
  return r3(cortes.at(-1)?.ate ?? t);
}

export const duracaoEditada =(cortes: { de: number; ate: number }[]) => r3(cortes.reduce((a, c) => a + c.ate - c.de, 0));

/** Troca o texto de um intervalo de palavras mantendo o tempo total; palavras novas dividem o tempo pelo tamanho. */
export function reescrever(palavras: Palavra[], i0: number, i1: number, texto: string): Palavra[] {
  const a = palavras[i0], b = palavras[i1];
  if (!a || !b || i1 < i0) return palavras;
  const novas = texto.trim().split(/\s+/).filter(Boolean).map((w) => w.slice(0, 40));
  const s = a.s, e = Math.max(b.e, s + 0.05);
  const pesos = novas.map((w) => 0.6 + w.length), soma = pesos.reduce((x, y) => x + y, 0);
  let acc = 0;
  const trecho = novas.map((w, k) => { const ini = s + ((e - s) * acc) / soma; acc += pesos[k]!; return { w, s: r3(ini), e: r3(s + ((e - s) * acc) / soma) }; });
  return [...palavras.slice(0, i0), ...trecho, ...palavras.slice(i1 + 1)];
}

/**
 * Correções da IA por índice (ortografia, nomes, pontuação): uma palavra por outra, ou "" para apagar a que o Whisper
 * inventou. Nunca vira mais de uma palavra: a legenda é exatamente a fala (a IA tende a "melhorar" a frase).
 */
export function aplicarCorrecoes(palavras: Palavra[], correcoes: { i: number; w: string }[]): Palavra[] {
  let out = palavras;
  const unicas = [...new Map(correcoes.filter((c) => Number.isInteger(c.i) && c.i >= 0 && c.i < palavras.length && !/\s/.test(c.w.trim())).map((c) => [c.i, c])).values()];
  for (const c of unicas.sort((x, y) => y.i - x.i)) out = reescrever(out, c.i, c.i, c.w);
  return out;
}

/** Blocos de legenda: poucas palavras por vez, quebrando em pontuação e em respiros da fala. */
export function blocosLegenda(palavras: Palavra[], estilo: EstiloLegenda): { i0: number; i1: number; s: number; e: number }[] {
  const maxP = estilo === "palavra" ? 1 : estilo === "impacto" ? 3 : 4, maxC = estilo === "impacto" ? 18 : 24;
  const blocos: { i0: number; i1: number; s: number; e: number }[] = [];
  let i0 = 0;
  palavras.forEach((p, i) => {
    const prox = palavras[i + 1];
    const n = i - i0 + 1, chars = palavras.slice(i0, i + 1).map((x) => x.w).join(" ").length;
    const quebra = !prox || n >= maxP || chars + 1 + prox.w.length > maxC || (n >= 2 && /[.,!?;:]$/.test(p.w)) || prox.s - p.e > 0.6;
    if (!quebra) return;
    blocos.push({ i0, i1: i, s: palavras[i0]!.s, e: p.e });
    i0 = i + 1;
  });
  // cada bloco fica até o próximo começar (ou um respiro depois da última palavra)
  return blocos.map((b, k) => ({ ...b, s: r3(b.s), e: r3(Math.max(b.s + 0.3, Math.min(blocos[k + 1]?.s ?? Infinity, b.e + 0.45))) }));
}

/**
 * Onde a legenda fica (topo da faixa, em px): logo acima da interface de baixo; se um rosto estiver ali no tempo
 * do bloco, sobe para o meio ou vai para cima. Altura da faixa: alt (px).
 */
export function alturaLegenda(o: { zonas: Zona[]; w: number; h: number; alt: number; rostos: PlanoEdicao["rostos"]; s: number; e: number }): number {
  const { topo, base } = limitesVerticais(o.zonas, o.w, o.h);
  const folga = o.h * 0.015;
  const opcoes = [base - folga - o.alt, o.h * 0.5, topo + folga + o.h * 0.02];
  const rostos = o.rostos.filter((r) => r.t >= o.s - 0.5 && r.t <= o.e + 0.5);
  const cobre = (y: number) => rostos.some((r) => r.y0 * o.h < y + o.alt && r.y1 * o.h > y);
  return Math.round(opcoes.find((y) => !cobre(y)) ?? opcoes[0]!);
}
