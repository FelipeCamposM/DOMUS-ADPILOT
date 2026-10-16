"use server";

import { audit, db } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireCtx, requireRole } from "@/lib/ctx";

export interface ItemArquivo {
  id: string; name: string; type: "IMAGE" | "VIDEO"; width: number | null; height: number | null; duration_ms: number | null;
  size: number; thumb: boolean; arquivado: boolean; previa: boolean; enviado: boolean; pasta_id: string | null; created_at: string;
}
export interface Pasta { id: string; nome: string; n: number }

const uuid = z.string().uuid("Identificador inválido");
const nomePasta = z.string().trim().min(1, "Dê um nome à pasta").max(60, "Nome com no máximo 60 caracteres");
const filtroSchema = z.object({
  q: z.string().max(100).default(""),
  pasta: z.union([z.literal("todas"), z.literal("sem"), uuid]).default("todas"),
  tipo: z.enum(["IMAGE", "VIDEO", "todos"]).default("todos"),
  origem: z.enum(["enviados", "gerados", "todos"]).default("todos"),
});

/** Imagens e vídeos do workspace (enviados e gerados) com as pastas. Alimenta a página Arquivos e o modal da biblioteca. */
export async function listarArquivos(filtro: z.input<typeof filtroSchema>) {
  return run(async () => {
    const ctx = await requireCtx();
    const f = filtroSchema.parse(filtro);
    const sql = db();
    const ws = ctx.workspace.id;
    const t = f.q.trim() ? `%${f.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const tipos = f.tipo === "todos" ? ["IMAGE", "VIDEO"] : [f.tipo];
    const [itens, pastas] = await Promise.all([
      sql<(Omit<ItemArquivo, "created_at"> & { created_at: Date })[]>`
        select id, name, type, width, height, duration_ms, coalesce(size_bytes, 0)::float8 as size, thumbnail_key is not null as thumb,
          arquivado, preview_key is not null as previa, 'asset' = any(tags) as enviado, pasta_id, created_at
        from ads.creatives
        where workspace_id = ${ws} and status = 'READY' and r2_key is not null and type = any(${tipos}) and not (tags && array['referencia','story'])
          and (${f.origem} = 'todos' or ('asset' = any(tags)) = (${f.origem} = 'enviados'))
          and (${f.pasta} = 'todas' or (${f.pasta} = 'sem' and pasta_id is null) or pasta_id::text = ${f.pasta})
          and (${t}::text is null or name ilike ${t})
        order by created_at desc limit 400`,
      sql<Pasta[]>`
        select p.id, p.nome, count(c.id)::int as n from ads.pastas p left join ads.creatives c on c.pasta_id = p.id and c.status = 'READY'
        where p.workspace_id = ${ws} group by p.id order by p.nome`,
    ]);
    return { itens: itens.map((i) => ({ ...i, created_at: i.created_at.toISOString() })), pastas };
  });
}

export async function criarPasta(nome: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const n = nomePasta.parse(nome);
    const [p] = await db()<{ id: string }[]>`insert into ads.pastas (workspace_id, nome) values (${ctx.workspace.id}, ${n}) on conflict (workspace_id, nome) do nothing returning id`;
    if (!p) throw new Error(`Já existe uma pasta “${n}”`);
    await audit(db(), { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Criar pasta", entityType: "pasta", entityId: p.id, entityName: n });
    revalidatePath("/arquivos");
    return p.id;
  });
}

export async function renomearPasta(id: string, nome: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const n = nomePasta.parse(nome);
    const r = await db()`update ads.pastas set nome = ${n} where id = ${uuid.parse(id)} and workspace_id = ${ctx.workspace.id}`
      .catch((e: { code?: string }) => { if (e.code === "23505") throw new Error(`Já existe uma pasta “${n}”`); throw e; });
    if (!r.count) throw new Error("Pasta não encontrada");
    revalidatePath("/arquivos");
  });
}

/** Apaga só a pasta: os arquivos dela continuam na biblioteca, sem pasta. */
export async function apagarPasta(id: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const [p] = await db()<{ nome: string }[]>`delete from ads.pastas where id = ${uuid.parse(id)} and workspace_id = ${ctx.workspace.id} returning nome`;
    if (!p) throw new Error("Pasta não encontrada");
    await audit(db(), { workspaceId: ctx.workspace.id, actor: ctx.actor, action: "Apagar pasta", entityType: "pasta", entityId: id, entityName: p.nome });
    revalidatePath("/arquivos");
  });
}

/** Move arquivos para uma pasta (null = sem pasta). */
export async function moverArquivos(ids: string[], pastaId: string | null) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const lista = z.array(uuid).min(1, "Escolha ao menos um arquivo").max(400).parse(ids);
    const destino = pastaId == null ? null : uuid.parse(pastaId);
    const sql = db();
    if (destino) {
      const [p] = await sql`select 1 from ads.pastas where id = ${destino} and workspace_id = ${ctx.workspace.id}`;
      if (!p) throw new Error("Pasta não encontrada");
    }
    const r = await sql`update ads.creatives set pasta_id = ${destino} where id = any(${lista}::uuid[]) and workspace_id = ${ctx.workspace.id}`;
    revalidatePath("/arquivos");
    return r.count;
  });
}
