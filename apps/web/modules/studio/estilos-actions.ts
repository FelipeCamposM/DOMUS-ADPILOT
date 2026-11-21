"use server";

import { audit, db, enqueueJob } from "@domus-ads/core";
import { estiloPronto, estiloSchema } from "@domus-ads/core/estilos";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { isPlatformAdmin, requireCtx, requireRole } from "@/lib/ctx";

const uuid = z.string().uuid("Estilo inválido");

/** Cria ou edita um estilo do workspace; as referências vão para o Drive pelo worker. */
export async function salvarEstilo(input: unknown, id?: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const e = estiloSchema.parse(input);
    const sql = db();
    if (e.referencias.length) {
      const ok = await sql`select id from ads.creatives where id = any(${e.referencias}::uuid[]) and workspace_id = ${ctx.workspace.id} and status = 'READY'`;
      if (ok.length !== new Set(e.referencias).size) throw new Error("Alguma referência não existe mais neste workspace");
    }
    const [r] = id
      ? await sql<{ id: string }[]>`
          update ads.estilos set nome = ${e.nome}, familia = ${e.familia}, resumo = ${e.resumo}, prompt = ${e.prompt}, tags = ${e.tags},
            referencias = ${e.referencias}::uuid[], updated_at = now()
          where id = ${uuid.parse(id)} and workspace_id = ${ctx.workspace.id} returning id`
      : await sql<{ id: string }[]>`
          insert into ads.estilos (workspace_id, nome, familia, resumo, prompt, tags, referencias, created_by)
          values (${ctx.workspace.id}, ${e.nome}, ${e.familia}, ${e.resumo}, ${e.prompt}, ${e.tags}, ${e.referencias}::uuid[], ${ctx.user.id}) returning id`;
    if (!r) throw new Error("Estilo não encontrado");
    if (e.referencias.length) await enqueueJob(sql, { workspaceId: ctx.workspace.id, type: "ESTILOS", payload: { acao: "drive", id: r.id }, createdBy: ctx.user.id });
    await audit(sql, { workspaceId: ctx.workspace.id, actor: ctx.actor, action: id ? "Editar estilo" : "Criar estilo", entityType: "estilo", entityId: r.id, entityName: e.nome });
    revalidatePath("/studio/estilos");
    return r.id;
  });
}

export async function apagarMeuEstilo(id: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    await db()`delete from ads.estilos where id = ${uuid.parse(id)} and workspace_id = ${ctx.workspace.id}`;
    revalidatePath("/studio/estilos");
  });
}

/** Renderiza (no worker) as amostras dos estilos prontos pedidos. Os prontos são da plataforma: só o admin dela. */
export async function gerarPrevias(chaves: unknown) {
  return run(async () => {
    const ctx = await requireCtx();
    if (!isPlatformAdmin(ctx)) throw new Error("Só o administrador da plataforma gera as prévias dos estilos prontos");
    const lista = z.array(z.string().max(60)).max(60).parse(chaves).map(estiloPronto).filter((e) => !!e);
    const sql = db();
    let n = 0;
    for (const e of lista) {
      const [l] = await sql<{ previa_status: string | null }[]>`
        insert into ads.estilos (chave, nome, familia, resumo, prompt, previa_status)
        values (${e.chave}, ${e.nome}, ${e.familia}, ${e.resumo}, '', 'GERANDO')
        on conflict (chave) do update set previa_status = 'GERANDO', previa_erro = null, updated_at = now()
          where ads.estilos.previa_status is distinct from 'GERANDO'
        returning previa_status`;
      if (!l) continue; // já está na fila
      await enqueueJob(sql, { workspaceId: ctx.workspace.id, type: "ESTILOS", payload: { acao: "previa", chave: e.chave }, createdBy: ctx.user.id, maxAttempts: 1 });
      n++;
    }
    revalidatePath("/studio/estilos");
    return n;
  });
}
