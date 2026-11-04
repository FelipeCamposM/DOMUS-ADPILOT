import "server-only";
import { brandSchema, db, type Brand } from "@domus-ads/core";
import { z } from "zod";

export interface Marca { id: string; nome: string; brand: Brand }
/** O que os formulários precisam para escolher a marca (sem regras e textos longos). */
export interface MarcaResumo { id: string; nome: string; cores: { hex: string; nome: string }[]; temLogo: boolean; logoId: string | null }

export async function marcasDoWorkspace(workspaceId: string): Promise<Marca[]> {
  const r = await db()<{ id: string; nome: string; brand: unknown }[]>`
    select id, nome, brand from ads.brands where workspace_id = ${workspaceId} order by nome`;
  return r.map((m) => ({ id: m.id, nome: m.nome, brand: brandSchema.parse(m.brand ?? {}) }));
}

export interface Conhecimento { texto: string; em: string | null; fontes: string[]; job: { status: string; progress: number | null; error: string | null; log: string | null } | null }

/** Base de conhecimento da marca + a geração mais recente (para acompanhar na tela). */
export async function conhecimentoDaMarca(workspaceId: string, brandId: string): Promise<Conhecimento> {
  const sql = db();
  const [m] = await sql<{ conhecimento: string; conhecimento_em: Date | null; conhecimento_fontes: string[] }[]>`
    select conhecimento, conhecimento_em, conhecimento_fontes from ads.brands where id = ${brandId} and workspace_id = ${workspaceId}`;
  const [j] = await sql<{ status: string; progress: number | null; error: string | null; log: string | null }[]>`
    select j.status, j.progress, j.error, (select l.message from ads.job_logs l where l.job_id = j.id order by l.created_at desc limit 1) as log
    from ads.jobs j where j.type = 'MARCA_CONHECIMENTO' and j.workspace_id = ${workspaceId} and j.payload->>'brandId' = ${brandId}
    order by j.created_at desc limit 1`;
  return { texto: m?.conhecimento ?? "", em: m?.conhecimento_em?.toISOString() ?? null, fontes: m?.conhecimento_fontes ?? [], job: j ?? null };
}

export const resumo = (m: Marca): MarcaResumo => ({ id: m.id, nome: m.nome, cores: m.brand.cores, temLogo: !!m.brand.logoId, logoId: m.brand.logoId });

/** Id de marca vindo do cliente: aceito só se for deste workspace. Vazio = sem marca. */
export async function marcaDoWorkspace(workspaceId: string, id: unknown): Promise<string | null> {
  if (id == null || id === "") return null;
  const uid = z.string().uuid("Marca inválida").parse(id);
  const [m] = await db()`select id from ads.brands where id = ${uid} and workspace_id = ${workspaceId}`;
  if (!m) throw new Error("Marca não encontrada neste workspace");
  return uid;
}
