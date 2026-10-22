import type { Json, Sql } from "./db";

export const JOB_TYPES = ["SYNC_META", "SYNC_GOOGLE", "AI_CHAT", "AI_LOGIN", "AI_DETECT", "WORKER_STARTUP", "GENERATE_VIDEO", "GENERATE_IMAGE", "AI_CAMPAIGN", "RESTORE_MEDIA", "SYNC_INSTAGRAM", "PUBLISH_INSTAGRAM", "AI_INSTAGRAM_CAPTION", "AI_USAGE", "WHATSAPP", "AI_CALENDARIO", "GENERATE_AUDIO", "AI_SISTEMA"] as const;
export type JobType = (typeof JOB_TYPES)[number];

/** Job de sincronização de cada tipo de conexão. */
export const jobDeSync = (provider: string): JobType => (provider === "META" ? "SYNC_META" : provider === "INSTAGRAM" ? "SYNC_INSTAGRAM" : "SYNC_GOOGLE");

export interface Job {
  id: string; workspace_id: string | null; type: JobType; payload: Record<string, unknown>; attempts: number; max_attempts: number;
}

export async function enqueueJob(sql: Sql, j: { workspaceId: string | null; type: JobType; payload: Record<string, unknown>; createdBy?: string | null; maxAttempts?: number }) {
  const [r] = await sql<{ id: string }[]>`
    insert into ads.jobs (workspace_id, type, payload, created_by, max_attempts)
    values (${j.workspaceId}, ${j.type}, ${sql.json(j.payload as Json)}, ${j.createdBy ?? null}, ${j.maxAttempts ?? 3}) returning id`;
  return r!.id;
}

/** Respostas de chat: têm uma vaga só delas no worker para nunca esperar atrás de vídeo, áudio ou sincronização. */
export const JOBS_RAPIDOS: readonly JobType[] = ["AI_CHAT", "AI_SISTEMA"];

/** Que tipos o worker pode pegar agora: até `vagas` de qualquer tipo e mais uma só para respostas rápidas. */
export function tiposLivres(ocupadas: number, vagas: number, todos: readonly JobType[]): readonly JobType[] | null {
  if (ocupadas < vagas) return todos;
  return ocupadas < vagas + 1 ? todos.filter((t) => JOBS_RAPIDOS.includes(t)) : null;
}

/** Pega o próximo job pendente com trava (SKIP LOCKED): vários workers nunca pegam o mesmo job. */
export async function claimJob(sql: Sql, workerId: string, types: readonly JobType[]): Promise<Job | null> {
  const [j] = await sql<Job[]>`
    update ads.jobs set status = 'RUNNING', started_at = now(), attempts = attempts + 1, locked_by = ${workerId}, progress = 0
    where id = (
      select id from ads.jobs where status = 'PENDING' and run_after <= now() and type = any(${types as unknown as string[]})
      order by created_at for update skip locked limit 1)
    returning id, workspace_id, type, payload, attempts, max_attempts`;
  return j ?? null;
}

export async function completeJob(sql: Sql, id: string, result: unknown) {
  await sql`update ads.jobs set status = 'COMPLETED', progress = 100, result = ${sql.json((result ?? null) as Json)}, finished_at = now(), error = null where id = ${id}`;
}

/** Falha: volta para a fila com backoff até max_attempts; depois fica FAILED. */
export async function failJob(sql: Sql, job: Job, error: string, retryable = true) {
  const retry = retryable && job.attempts < job.max_attempts;
  await sql`
    update ads.jobs set status = ${retry ? "PENDING" : "FAILED"}, error = ${error.slice(0, 2000)}, locked_by = null,
      run_after = now() + make_interval(secs => ${retry ? 30 * 2 ** job.attempts : 0}), finished_at = ${retry ? null : new Date()}
    where id = ${job.id}`;
}

export async function jobLog(sql: Sql, jobId: string, message: string, level: "info" | "warn" | "error" = "info") {
  await sql`insert into ads.job_logs (job_id, level, message) values (${jobId}, ${level}, ${message.slice(0, 4000)})`;
}

/** Recuperação após queda: jobs RUNNING deste worker (ou abandonados há 30 min) voltam para a fila. */
export async function recoverJobs(sql: Sql, workerId: string) {
  return sql`
    update ads.jobs set status = 'PENDING', locked_by = null
    where status = 'RUNNING' and (locked_by = ${workerId} or started_at < now() - interval '30 minutes') returning id`;
}
