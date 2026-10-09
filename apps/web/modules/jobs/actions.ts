"use server";

import { db } from "@domus-ads/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireCtx, requireRole } from "@/lib/ctx";

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
