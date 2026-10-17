import { z } from "zod";
import { decrypt, encrypt } from "./crypto";
import { CONFIG_CAL_PADRAO, configCalSchema, type ConfigCal } from "./calendario";
import { db } from "./db";

/** Segredos globais da plataforma (cifrados no banco). Nunca vão para o navegador. */
export async function lerSegredo(chave: string): Promise<string | null> {
  const [r] = await db()<{ value_enc: string }[]>`select value_enc from ads.settings where key = ${chave}`;
  return r ? decrypt<string>(r.value_enc) : null;
}

export async function gravarSegredo(chave: string, valor: string | null, userId: string | null) {
  if (valor == null) await db()`delete from ads.settings where key = ${chave}`;
  else await db()`insert into ads.settings (key, value_enc, updated_by) values (${chave}, ${encrypt(valor)}, ${userId})
                  on conflict (key) do update set value_enc = excluded.value_enc, updated_by = excluded.updated_by, updated_at = now()`;
}

/** Número (só dígitos, com DDI) que recebe os avisos da plataforma no WhatsApp. */
export const whatsappAvisos = () => lerSegredo("whatsapp_avisos").catch(() => null);

/**
 * Escolha manual da IA (topo → menu das IAs). conta = id da conta preferida (null = rodízio por prioridade);
 * modelo/esforço vazios = padrão do CLI. A conta escolhida no limite ou com erro cai no rodízio normal.
 */
export const ESFORCOS = ["low", "medium", "high", "xhigh", "max"] as const;
const prefProvedor = z.object({ modelo: z.string().max(60).regex(/^[\w.\-]*$/, "Modelo inválido").default(""), esforco: z.enum(["", ...ESFORCOS]).default("") });
export const iaPreferenciasSchema = z.object({
  conta: z.string().uuid("Conta inválida").nullable().default(null),
  claude: prefProvedor.default({ modelo: "", esforco: "" }),
  codex: prefProvedor.default({ modelo: "", esforco: "" }),
});
export type IaPreferencias = z.infer<typeof iaPreferenciasSchema>;

export async function iaPreferencias(): Promise<IaPreferencias> {
  const v = await lerSegredo("ia_preferencias").catch(() => null);
  const p = iaPreferenciasSchema.safeParse(v ? JSON.parse(v) : {});
  return p.success ? p.data : iaPreferenciasSchema.parse({});
}

/** Chave do ElevenLabs: a cadastrada na tela tem prioridade; senão ELEVENLABS_API_KEY do .env. */
export async function chaveElevenLabs(): Promise<string | null> {
  return (await lerSegredo("elevenlabs_api_key").catch(() => null)) ?? process.env.ELEVENLABS_API_KEY ?? null;
}

export interface CreditosElevenLabs { plano: string; usados: number; limite: number; renovaEm: string | null }

/** Créditos do ciclo atual da conta ElevenLabs (precisa da permissão "User: Read" na chave). */
export async function creditosElevenLabs(chave: string): Promise<CreditosElevenLabs> {
  const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": chave }, signal: AbortSignal.timeout(15_000) });
  if (r.status === 401) throw new Error("Ative a permissão \"User: Read\" na chave para ver os créditos");
  if (!r.ok) throw new Error(`ElevenLabs respondeu ${r.status}`);
  const j = (await r.json()) as { tier?: string; character_count?: number; character_limit?: number; next_character_count_reset_unix?: number };
  return {
    plano: j.tier ?? "",
    usados: j.character_count ?? 0,
    limite: j.character_limit ?? 0,
    renovaEm: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : null,
  };
}

export interface VozElevenLabs { id: string; nome: string; categoria: string; preview: string | null; idioma: string | null }

/** Vozes da conta ElevenLabs (prontas + clonadas). Lança erro com mensagem em português se a chave falhar. */
export async function vozesElevenLabs(chave: string): Promise<VozElevenLabs[]> {
  const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": chave }, signal: AbortSignal.timeout(15_000) });
  if (r.status === 401) {
    // chave restrita responde 401 com status "missing_permissions": não é chave inválida
    const d = ((await r.json().catch(() => null)) as { detail?: { status?: string } } | null)?.detail;
    throw new Error(d?.status === "missing_permissions"
      ? "Chave do ElevenLabs sem permissão: ative \"Voices: Read\" e \"Text to Speech\" na chave (elevenlabs.io → Developers → API Keys)"
      : "Chave do ElevenLabs inválida");
  }
  if (!r.ok) throw new Error(`ElevenLabs respondeu ${r.status}`);
  const j = (await r.json()) as { voices?: { voice_id: string; name: string; category?: string; preview_url?: string; labels?: Record<string, string> }[] };
  return (j.voices ?? []).map((v) => ({ id: v.voice_id, nome: v.name, categoria: v.category ?? "", preview: v.preview_url ?? null, idioma: v.labels?.language ?? v.labels?.accent ?? null }));
}

/**
 * Preço por 1.000 créditos do ElevenLabs (US$, mensalidade ÷ créditos do plano), para estimar o custo de cada vídeo.
 * ponytail: tabela de preços de tabela do site (out/2026); ELEVENLABS_USD_POR_1K no .env sobrepõe se o plano mudar.
 */
const USD_POR_1K: Record<string, number> = { free: 0, starter: 5 / 30, creator: 22 / 100, pro: 99 / 500, scale: 330 / 2000, business: 1320 / 11000 };
export function usdPorMilCreditos(plano: string | null): number {
  const env = Number(process.env.ELEVENLABS_USD_POR_1K);
  if (env > 0) return env;
  return USD_POR_1K[(plano ?? "").toLowerCase().replace(/_.*$/, "")] ?? USD_POR_1K.creator!;
}

/**
 * Regras do armazenamento (Configurações → Armazenamento). O R2 é pequeno e dividido com a Domus: guarda o que está em
 * uso e as prévias leves; o original de todo o resto fica só no Google Drive do PC do worker.
 */
export const armazenamentoSchema = z.object({
  limiteGb: z.number({ message: "Informe o limite em GB" }).min(0.2, "Mínimo 0,2 GB").max(9, "O R2 grátis tem 10 GB e é dividido com a Domus: no máximo 9 GB"),
  diasSemUso: z.number({ message: "Informe os dias" }).int("Use um número inteiro de dias").min(1, "Mínimo 1 dia").max(365, "Máximo 365 dias"),
  arquivarPublicados: z.boolean(),
  previas: z.boolean(),
});
export type Armazenamento = z.infer<typeof armazenamentoSchema>;
export const ARMAZENAMENTO_PADRAO: Armazenamento = { limiteGb: Number(process.env.R2_LIMITE_GB || 2), diasSemUso: 7, arquivarPublicados: true, previas: true };

export async function armazenamento(): Promise<Armazenamento> {
  const v = await lerSegredo("armazenamento").catch(() => null);
  const p = v ? armazenamentoSchema.partial().safeParse(JSON.parse(v)) : null;
  return { ...ARMAZENAMENTO_PADRAO, ...(p?.success ? p.data : {}) };
}

/** Prazos do calendário automático (antecedência por formato, tolerância de atraso). */
export async function configCalendario(): Promise<ConfigCal> {
  const v = await lerSegredo("calendario").catch(() => null);
  const p = v ? configCalSchema.safeParse(JSON.parse(v)) : null;
  return p?.success ? p.data : CONFIG_CAL_PADRAO;
}
