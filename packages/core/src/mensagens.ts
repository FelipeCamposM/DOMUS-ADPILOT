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
});

/** Variáveis dos modelos. */
export const VARIAVEIS_MODELO = { "{nome}": "nome do contato", "{primeiro_nome}": "primeiro nome", "{numero}": "telefone" } as const;
export function preencherModelo(texto: string, c: { nome: string; numero: string }): string {
  const primeiro = c.nome.trim().split(/\s+/)[0] ?? "";
  return texto.replaceAll("{primeiro_nome}", primeiro).replaceAll("{nome}", c.nome.trim()).replaceAll("{numero}", formatarNumero(c.numero));
}

/** Tipo de mídia da mensagem pelo mime. */
export const tipoMidia = (mime: string): "imagem" | "video" | "audio" | "documento" =>
  mime.startsWith("image/") ? "imagem" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "documento";
