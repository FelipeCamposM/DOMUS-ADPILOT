import { z } from "zod";

/**
 * Regras de publicação do Instagram (API de Conteúdo da Meta), sem dependência de servidor: o composer da web usa
 * as mesmas validações que o worker.
 */
export const TIPOS_POST = {
  FEED: { nome: "Post", desc: "Uma foto no feed" },
  CARROSSEL: { nome: "Carrossel", desc: "2 a 10 fotos ou vídeos" },
  REELS: { nome: "Reels", desc: "Vídeo vertical 9:16" },
  STORY: { nome: "Story", desc: "Foto ou vídeo por 24 h" },
} as const;
export type TipoPost = keyof typeof TIPOS_POST;

export const LIMITES_IG = { legenda: 2200, hashtags: 30, mencoes: 20, carrosselMin: 2, carrosselMax: 10, reelsMaxSeg: 900, storyVideoMaxSeg: 60 } as const;

export const STATUS_POST: Record<string, string> = {
  RASCUNHO: "Rascunho", AGENDADO: "Agendado", PUBLICANDO: "Publicando", PUBLICADO: "Publicado", FALHOU: "Falhou",
};

export const contarHashtags = (t: string) => (t.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
export const contarMencoes = (t: string) => (t.match(/(^|\s)@[\w.]+/g) ?? []).length;

export interface MidiaInfo { type: string; durationMs: number | null }

/** Problemas da publicação para o tipo escolhido (lista vazia = pode publicar). */
export function problemasPost(p: { tipo: TipoPost; legenda: string; midias: MidiaInfo[] }): string[] {
  const e: string[] = [];
  const n = p.midias.length;
  const videos = p.midias.filter((m) => m.type === "VIDEO");
  if (p.tipo === "FEED") {
    if (n !== 1) e.push("O post leva exatamente 1 imagem");
    else if (videos.length) e.push("Vídeo no feed vai como Reels: troque o tipo para Reels");
  } else if (p.tipo === "CARROSSEL") {
    if (n < LIMITES_IG.carrosselMin || n > LIMITES_IG.carrosselMax) e.push(`O carrossel leva de ${LIMITES_IG.carrosselMin} a ${LIMITES_IG.carrosselMax} itens`);
  } else if (p.tipo === "REELS") {
    if (n !== 1 || videos.length !== 1) e.push("O Reels leva exatamente 1 vídeo");
    else if ((videos[0]!.durationMs ?? 0) > LIMITES_IG.reelsMaxSeg * 1000) e.push("O Reels pode ter no máximo 15 minutos");
  } else if (p.tipo === "STORY") {
    if (n !== 1) e.push("O story leva exatamente 1 foto ou vídeo");
    else if (videos[0] && (videos[0].durationMs ?? 0) > LIMITES_IG.storyVideoMaxSeg * 1000) e.push("Vídeo de story pode ter no máximo 60 segundos");
  }
  if (p.tipo !== "STORY") {
    if (p.legenda.length > LIMITES_IG.legenda) e.push(`A legenda passou de ${LIMITES_IG.legenda} caracteres`);
    if (contarHashtags(p.legenda) > LIMITES_IG.hashtags) e.push(`Máximo de ${LIMITES_IG.hashtags} hashtags`);
    if (contarMencoes(p.legenda) > LIMITES_IG.mencoes) e.push(`Máximo de ${LIMITES_IG.mencoes} menções`);
  }
  return e;
}

export const postSchema = z.object({
  tipo: z.enum(Object.keys(TIPOS_POST) as [TipoPost, ...TipoPost[]], { message: "Tipo de publicação inválido" }),
  legenda: z.string().max(LIMITES_IG.legenda, `A legenda passou de ${LIMITES_IG.legenda} caracteres`).default(""),
  midias: z.array(z.object({ creativeId: z.string().uuid("Mídia inválida") })).max(LIMITES_IG.carrosselMax, "Mídias demais").default([]),
  opcoes: z.object({
    compartilharNoFeed: z.boolean().default(true),
    capaMs: z.number().int().min(0).max(LIMITES_IG.reelsMaxSeg * 1000).optional(),
    // capa do Reels: uma imagem da biblioteca (no lugar de um quadro do vídeo)
    capaId: z.string().uuid("Capa inválida").optional(),
  }).default({ compartilharNoFeed: true }),
});
export type PostInput = z.infer<typeof postSchema>;
