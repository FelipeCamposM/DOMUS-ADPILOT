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
/** Pasta de materiais de uma marca: id "mat:<marca>" ou "mat:sem" (sem marca). */
export interface PastaMaterial { id: string; nome: string; n: number }

/** "mat" = todos os materiais; "mat:sem" = sem marca; "mat:<uuid>" = da marca. */
const materialSchema = z.string().regex(/^mat(:(sem|[0-9a-f-]{36}))?$/, "Pasta inválida");
const marcaDe = (p: string) => (p === "mat" ? "todas" : p.slice(4));

const uuid = z.string().uuid("Identificador inválido");
const nomePasta = z.string().trim().min(1, "Dê um nome à pasta").max(60, "Nome com no máximo 60 caracteres");
const filtroSchema = z.object({
  q: z.string().max(100).default(""),
  pasta: z.union([z.literal("todas"), z.literal("sem"), uuid, materialSchema]).default("todas"),
  tipo: z.enum(["IMAGE", "VIDEO", "todos"]).default("todos"),
  origem: z.enum(["enviados", "gerados", "todos"]).default("todos"),
  /** onde está o original: r2 (abre na hora) ou drive (arquivado no PC) */
  onde: z.enum(["r2", "drive", "todos"]).default("todos"),
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
    // materiais ficam à parte: só aparecem nas pastas de material, nunca misturados com os posts
    const mat = f.pasta.startsWith("mat");
    const marca = mat ? marcaDe(f.pasta) : "todas";
    const [itens, pastas, materiais] = await Promise.all([
      sql<(Omit<ItemArquivo, "created_at"> & { created_at: Date })[]>`
        select id, name, type, width, height, duration_ms, coalesce(size_bytes, 0)::float8 as size, thumbnail_key is not null as thumb,
          arquivado, preview_key is not null as previa, 'asset' = any(tags) as enviado, pasta_id, created_at
        from ads.creatives
        where workspace_id = ${ws} and status = 'READY' and r2_key is not null and type = any(${tipos}) and not (tags && array['referencia','story'])
          and (${f.origem} = 'todos' or ('asset' = any(tags)) = (${f.origem} = 'enviados'))
          and material = ${mat}
          and (${mat} or ${f.pasta} = 'todas' or (${f.pasta} = 'sem' and pasta_id is null) or pasta_id::text = ${f.pasta})
          and (${marca} = 'todas' or (${marca} = 'sem' and brand_id is null) or brand_id::text = ${marca})
          and (${t}::text is null or name ilike ${t})
          and (${f.onde} = 'todos' or arquivado = (${f.onde} = 'drive'))
        order by created_at desc limit 400`,
      sql<Pasta[]>`
        select p.id, p.nome, count(c.id)::int as n from ads.pastas p left join ads.creatives c on c.pasta_id = p.id and c.status = 'READY' and not c.material
        where p.workspace_id = ${ws} group by p.id order by p.nome`,
      // uma pasta por marca do workspace (mesmo vazia) + "Sem marca" se tiver algo
      sql<PastaMaterial[]>`
        select 'mat:' || b.id as id, b.nome, count(c.id)::int as n from ads.brands b
          left join ads.creatives c on c.brand_id = b.id and c.material and c.status = 'READY' and c.type = any(${tipos})
        where b.workspace_id = ${ws} group by b.id
        union all
        select 'mat:sem', 'Sem marca', count(*)::int from ads.creatives
        where workspace_id = ${ws} and material and brand_id is null and status = 'READY' and type = any(${tipos}) having count(*) > 0
        order by 2`,
    ]);
    return { itens: itens.map((i) => ({ ...i, created_at: i.created_at.toISOString() })), pastas, materiais };
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

/** Move arquivos para uma pasta (null = sem pasta) ou para os materiais de uma marca ("mat:<marca>" / "mat:sem"). */
export async function moverArquivos(ids: string[], pastaId: string | null) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const lista = z.array(uuid).min(1, "Escolha ao menos um arquivo").max(400).parse(ids);
    const sql = db();
    if (pastaId?.startsWith("mat")) {
      const marca = marcaDe(materialSchema.parse(pastaId));
      const brand = marca === "sem" || marca === "todas" ? null : marca;
      if (brand) {
        const [b] = await sql`select 1 from ads.brands where id = ${brand} and workspace_id = ${ctx.workspace.id}`;
        if (!b) throw new Error("Marca não encontrada");
      }
      const r = await sql`update ads.creatives set material = true, brand_id = ${brand}, pasta_id = null where id = any(${lista}::uuid[]) and workspace_id = ${ctx.workspace.id}`;
      revalidatePath("/arquivos");
      revalidatePath("/creatives");
      return r.count;
    }
    const destino = pastaId == null ? null : uuid.parse(pastaId);
    if (destino) {
      const [p] = await sql`select 1 from ads.pastas where id = ${destino} and workspace_id = ${ctx.workspace.id}`;
      if (!p) throw new Error("Pasta não encontrada");
    }
    // tirar de Materiais devolve aos arquivos comuns
    const r = await sql`update ads.creatives set pasta_id = ${destino}, material = false, brand_id = null where id = any(${lista}::uuid[]) and workspace_id = ${ctx.workspace.id}`;
    revalidatePath("/arquivos");
    revalidatePath("/creatives");
    return r.count;
  });
}

/** Renomeia um arquivo da biblioteca. */
export async function renomearArquivo(id: string, nome: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const n = z.string().trim().min(1, "Dê um nome ao arquivo").max(120, "Nome com no máximo 120 caracteres").parse(nome);
    const r = await db()`update ads.creatives set name = ${n} where id = ${uuid.parse(id)} and workspace_id = ${ctx.workspace.id}`;
    if (!r.count) throw new Error("Arquivo não encontrado");
    revalidatePath("/arquivos");
  });
}
