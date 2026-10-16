import { z } from "zod";

/** Identidade visual do workspace. Tudo opcional: o que estiver preenchido vira regra para a IA. */
export const brandSchema = z.object({
  cores: z.array(z.object({
    nome: z.string().trim().max(40).default(""),
    hex: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Cor no formato #RRGGBB"),
  })).max(10, "No máximo 10 cores").default([]),
  fonteTitulo: z.string().trim().max(60).default(""), // nome de Google Font, ex.: "Plus Jakarta Sans"
  fonteTexto: z.string().trim().max(60).default(""),
  logoId: z.string().uuid().nullable().default(null), // criativo IMAGE com a logo
  tom: z.string().trim().max(500).default(""),       // tom de voz
  sobre: z.string().trim().max(2000).default(""),    // o que a marca faz, para quem
  regras: z.string().trim().max(2000).default(""),   // faça / não faça
  referencias: z.array(z.string().trim().url("Link inválido").max(500)).max(10).default([]),
  // site oficial: a IA lê para tirar temas, produtos e linguagem (calendário de conteúdo, legendas)
  site: z.string().trim().max(500).refine((u) => !u || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(u), "Site inválido: use o endereço completo, ex.: https://digitaldomus.com.br").default(""),
});
export type Brand = z.infer<typeof brandSchema>;

/** Anexos do projeto: "incluir" entra na arte (logo, print, foto, vídeo); "inspiracao" só orienta o estilo. */
export const anexosSchema = z.object({
  assets: z.array(z.object({
    creativeId: z.string().uuid(),
    uso: z.enum(["incluir", "inspiracao"]).default("incluir"),
    nota: z.string().trim().max(300).default(""),
  })).max(12, "No máximo 12 arquivos por projeto").default([]),
  links: z.array(z.object({
    url: z.string().trim().url("Link inválido").max(500).refine((u) => /^https?:\/\//i.test(u), "Só links http(s)"),
    nota: z.string().trim().max(300).default(""),
  })).max(8, "No máximo 8 links por projeto").default([]),
});
export type Anexos = z.infer<typeof anexosSchema>;

/**
 * Paleta resolvida de um vídeo (salva na revisão do roteiro): de onde veio (marca salva, referências ou o padrão do
 * estilo) e as cores por papel. O que o usuário aprovar aqui é o que a composição usa, sem a IA trocar.
 */
export const PAPEIS_COR = ["Fundo", "Destaque", "Texto", "Destaque 2"] as const;
export const paletaSchema = z.object({
  origem: z.enum(["marca", "referencias", "estilo", "usuario"]),
  marca: z.string().max(60).nullable().default(null),
  cores: z.array(z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Cor no formato #RRGGBB")).min(1, "Informe ao menos a cor de fundo").max(4),
  fonteTitulo: z.string().trim().max(60).regex(/^[\w\s-]*$/, "Nome de fonte inválido").default(""),
  fonteTexto: z.string().trim().max(60).regex(/^[\w\s-]*$/, "Nome de fonte inválido").default(""),
});
export type PaletaProjeto = z.infer<typeof paletaSchema>;
