import { z } from "zod";
import { normalizarNumero } from "./mensagens";

// ───────────── Prospecção (Google Maps → empresas que precisam de site) ─────────────

export const STATUS_PROSPECTO = ["NOVO", "CONTATADO", "DESCARTADO", "LEAD"] as const;
export type StatusProspecto = (typeof STATUS_PROSPECTO)[number];
export type TipoSite = "NENHUM" | "REDE_SOCIAL" | "PROPRIO";

/** Nichos que costumam comprar site (sugestões do campo; pode escrever qualquer outro). */
export const NICHOS_SUGERIDOS = [
  "dentista", "clínica odontológica", "advogado", "contabilidade", "clínica de estética", "salão de beleza", "barbearia",
  "academia", "pet shop", "clínica veterinária", "imobiliária", "oficina mecânica", "restaurante", "pizzaria", "padaria",
  "psicólogo", "fisioterapia", "nutricionista", "arquiteto", "loja de móveis", "escola de idiomas", "autoescola", "floricultura", "ótica",
] as const;

export const prospeccaoSchema = z.object({
  nicho: z.string().trim().min(2, "Diga o tipo de empresa (ex.: dentista)").max(80, "Nicho muito longo"),
  cidade: z.string().trim().min(2, "Diga a cidade (ex.: Belo Horizonte, MG)").max(120, "Cidade muito longa"),
  bairros: z.array(z.string().trim().min(2).max(60)).max(15, "Até 15 bairros por busca").default([]),
  profundidade: z.coerce.number().int().min(1).max(6).default(3),
});

/** Domínios que não são site próprio: a empresa só tem rede social ou página de link. */
const REDES = /(^|\.)(instagram\.com|facebook\.com|fb\.com|wa\.me|whatsapp\.com|linktr\.ee|linktree\.com|tiktok\.com|youtube\.com|beacons\.ai|bio\.link|linkin\.bio|taplink\.cc|ifood\.com\.br|goo\.gl|google\.com|business\.site|negocio\.site|sites\.google\.com)$/i;

export function tipoSite(url: string | null | undefined): TipoSite {
  if (!url?.trim()) return "NENHUM";
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
    return REDES.test(host) ? "REDE_SOCIAL" : "PROPRIO";
  } catch {
    return "NENHUM";
  }
}

/** Celular brasileiro (DDD + 9 + 8 dígitos) vira número do WhatsApp; fixo não. */
export function whatsappDe(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  const n = normalizarNumero(telefone);
  return n && /^55\d{2}9\d{8}$/.test(n) ? n : null;
}

/**
 * 0–100: quanto a empresa parece precisar de um site e ter como pagar.
 * Sem site pesa mais; nota e avaliações dizem se o negócio está ativo; WhatsApp e e-mail dizem se dá para falar.
 */
export function pontuar(p: { tipo: TipoSite; nota: number | null; avaliacoes: number | null; whatsapp: string | null; emails: number; aberto: boolean }): number {
  let s = p.tipo === "NENHUM" ? 45 : p.tipo === "REDE_SOCIAL" ? 38 : 8;
  const av = p.avaliacoes ?? 0;
  s += av >= 100 ? 20 : av >= 30 ? 15 : av >= 10 ? 9 : av > 0 ? 4 : 0;
  if (p.nota != null) s += p.nota >= 4.5 ? 10 : p.nota >= 4 ? 7 : p.nota >= 3.5 ? 3 : 0;
  if (p.whatsapp) s += 15;
  if (p.emails) s += 5;
  if (!p.aberto) s -= 30;
  return Math.max(0, Math.min(100, s));
}

export const ROTULO_TIPO_SITE: Record<TipoSite, string> = { NENHUM: "Sem site", REDE_SOCIAL: "Só rede social", PROPRIO: "Tem site" };
