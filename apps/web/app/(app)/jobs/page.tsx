import { db } from "@domus-ads/core";
import { can, requireCtx } from "@/lib/ctx";
import { workerOnline } from "@/lib/queries";
import { JobsTable, type JobLinha } from "@/modules/jobs/JobsTable";

export const metadata = { title: "Jobs" };

export default async function JobsPage() {
  const ctx = await requireCtx();
  const jobs = await db()<(Omit<JobLinha, "created_at" | "started_at" | "finished_at"> & { created_at: Date; started_at: Date | null; finished_at: Date | null })[]>`
    select id, type, status, progress, error, attempts, payload, created_at, started_at, finished_at
    from ads.jobs where workspace_id = ${ctx.workspace.id} order by created_at desc limit 100`;
  const w = await workerOnline();
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow" data-enter>Fila do worker local</div>
          <h1 className="page-title" data-enter>Jobs</h1>
        </div>
        <span className="chip" data-enter><span className={`dot ${w.online ? "on" : "err"}`} aria-hidden />Worker {w.online ? "online" : "offline: jobs esperam na fila até ele voltar"}</span>
      </div>
      <JobsTable jobs={jobs.map((j) => ({ ...j, created_at: j.created_at.toISOString(), started_at: iso(j.started_at), finished_at: iso(j.finished_at) }))} podeEditar={can(ctx, "editor")} />
    </div>
  );
}
