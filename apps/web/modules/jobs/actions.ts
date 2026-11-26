"use server";

import { db } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { isPlatformAdmin, requireCtx, requireRole } from "@/lib/ctx";

export async function cancelarJob(jobId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    requireRole(ctx, "editor");
    const r = await db()`
      update ads.jobs set status = 'CANCELLED', finished_at = now()
      where id = ${z.string().uuid().parse(jobId)} and workspace_id = ${ctx.workspace.id} and status in ('PENDING', 'RUNNING')`;
    if (!r.count) throw new Error("Job não encontrado ou já terminou");
    revalidatePath("/jobs");
  });
}

export async function logsDoJob(jobId: string) {
  return run(async () => {
    const ctx = await requireCtx();
    return db()<{ id: number; level: string; message: string; created_at: Date }[]>`
      select l.id::int as id, l.level, l.message, l.created_at from ads.job_logs l join ads.jobs j on j.id = l.job_id
      where l.job_id = ${z.string().uuid().parse(jobId)} and j.workspace_id = ${ctx.workspace.id} order by l.id`;
  });
}

export interface JobAtividade {
  id: string; type: string; status: string; progress: number; error: string | null; auto: boolean;
  created_at: string; started_at: string | null; finished_at: string | null;
  /** segundos desde o início (relógio do banco, sem depender do relógio do navegador) */
  decorrido: number | null;
  /** duração média deste tipo nas últimas execuções concluídas, para estimar quando ainda não há % */
  media: number | null;
  ultimoLog: string | null;
}

/** O que o worker está fazendo agora + o que já fez (modal do worker no topo). */
export async function atividadeWorker() {
  return run(async () => {
    const ctx = await requireCtx();
    const admin = isPlatformAdmin(ctx);
    const linhas = await db()<(Omit<JobAtividade, "created_at" | "started_at" | "finished_at"> & { created_at: Date; started_at: Date | null; finished_at: Date | null })[]>`
      with js as (
        select * from ads.jobs
        where (workspace_id = ${ctx.workspace.id} or (workspace_id is null and ${admin}))
        order by (status in ('RUNNING', 'PENDING')) desc, created_at desc limit 40
      ), medias as (
        select type, avg(extract(epoch from finished_at - started_at))::float8 as media
        from (select type, started_at, finished_at, row_number() over (partition by type order by finished_at desc) n
              from ads.jobs where status = 'COMPLETED' and started_at is not null and type in (select type from js)) x
        where n <= 10 group by type
      )
      select js.id, js.type, js.status, js.progress, js.error, coalesce((js.payload->>'auto')::boolean, false) as auto,
        js.created_at, js.started_at, js.finished_at,
        case when js.started_at is not null then extract(epoch from coalesce(js.finished_at, now()) - js.started_at)::float8 end as decorrido,
        m.media,
        case when js.status in ('RUNNING', 'PENDING') then (select message from ads.job_logs l where l.job_id = js.id order by l.id desc limit 1) end as "ultimoLog"
      from js left join medias m on m.type = js.type
      order by (js.status in ('RUNNING', 'PENDING')) desc, js.created_at desc`;
    const iso = (d: Date | null) => d?.toISOString() ?? null;
    return linhas.map((j) => ({ ...j, created_at: j.created_at.toISOString(), started_at: iso(j.started_at), finished_at: iso(j.finished_at) }));
  });
}
