import { CONCURRENCY, SYNC_INTERVAL_MIN, WORKER_ID } from "./env"; // primeiro: carrega o .env
import { claimJob, completeJob, db, enqueueJob, failJob, jobDeSync, jobLog, migrate, recoverJobs, syncConnection, syncInstagram, type Job, type JobType } from "@domus-ads/core";
import { createServer } from "node:net";
import { hostname } from "node:os";
import { runChatTurn } from "./ai/chat";
import { detectar, publicarDetectadas, runLogin } from "./ai/login";
import { runImagem, type ImagemPayload } from "./video/imagem";
import { runVideo, type VideoPayload } from "./video/pipeline";
import { runCampanhaIA, type CampanhaPayload } from "./ai/campanha";
import { inicializacaoAtiva, configurarInicializacao } from "./startup";
import { arquivarExcesso, restaurar } from "./video/arquivo";
import { gerarLegenda, type LegendaPayload } from "./instagram/legenda";
import { publicarInstagram } from "./instagram/publicar";

/**
 * DOMUS Worker: roda no PC local, sem nenhuma porta aberta. Ele mesmo busca trabalho na fila (ads.jobs) com
 * FOR UPDATE SKIP LOCKED e grava progresso/resultado no banco; a web só lê. A web nunca manda comando de shell:
 * cada tipo de job tem um handler fixo aqui (allowlist).
 */
const TIPOS: readonly JobType[] = ["SYNC_META", "SYNC_GOOGLE", "AI_CHAT", "AI_LOGIN", "AI_DETECT", "WORKER_STARTUP", "GENERATE_VIDEO", "GENERATE_IMAGE", "AI_CAMPAIGN", "RESTORE_MEDIA", "SYNC_INSTAGRAM", "PUBLISH_INSTAGRAM", "AI_INSTAGRAM_CAPTION"];
const sql = db();
const ativos = new Map<string, AbortController>();
let parando = false;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const agora = () => new Date().toLocaleTimeString("pt-BR");

async function executar(job: Job) {
  const ctl = new AbortController();
  ativos.set(job.id, ctl);
  const log = async (m: string) => { console.log(`[${agora()}] ${job.type} ${job.id.slice(0, 8)}: ${m}`); await jobLog(sql, job.id, m); };
  // cancelamento pela web: o job vira CANCELLED e o processo do CLI é encerrado
  const vigia = setInterval(async () => {
    const [j] = await sql<{ status: string }[]>`select status from ads.jobs where id = ${job.id}`;
    if (j?.status === "CANCELLED") ctl.abort();
  }, 2000);
  try {
    let result: unknown;
    if (job.type === "SYNC_META" || job.type === "SYNC_GOOGLE") {
      result = await syncConnection(String(job.payload.connectionId), log, async (p) => { await sql`update ads.jobs set progress = ${p} where id = ${job.id}`; });
    } else if (job.type === "AI_CHAT") {
      result = await runChatTurn(String(job.payload.conversationId), ctl.signal, log);
    } else if (job.type === "AI_LOGIN") {
      result = await runLogin(String(job.payload.loginId), ctl.signal, log);
    } else if (job.type === "AI_DETECT") {
      const d = await detectar();
      await publicarDetectadas(d);
      result = { encontradas: d.length };
    } else if (job.type === "GENERATE_VIDEO") {
      result = await runVideo(job.payload as unknown as VideoPayload, { signal: ctl.signal, log, progress: async (p) => { await sql`update ads.jobs set progress = ${p} where id = ${job.id}`; } });
    } else if (job.type === "GENERATE_IMAGE") {
      result = await runImagem(job.payload as unknown as ImagemPayload, { signal: ctl.signal, log, progress: async (p) => { await sql`update ads.jobs set progress = ${p} where id = ${job.id}`; } });
    } else if (job.type === "AI_CAMPAIGN") {
      result = await runCampanhaIA(job.payload as unknown as CampanhaPayload, { signal: ctl.signal, log });
    } else if (job.type === "SYNC_INSTAGRAM") {
      result = await syncInstagram(String(job.payload.connectionId), log);
    } else if (job.type === "PUBLISH_INSTAGRAM") {
      result = await publicarInstagram(String(job.payload.postId), { signal: ctl.signal, log });
    } else if (job.type === "AI_INSTAGRAM_CAPTION") {
      result = await gerarLegenda(job.payload as unknown as LegendaPayload, { signal: ctl.signal, log });
    } else if (job.type === "RESTORE_MEDIA") {
      result = await restaurar(String(job.payload.creativeId));
    } else if (job.type === "WORKER_STARTUP") {
      // só quando o usuário pede na tela (Configurações → Worker)
      result = await configurarInicializacao(job.payload.enable === true, log);
      await heartbeat();
    } else {
      throw new Error(`Tipo de job não permitido: ${job.type}`);
    }
    if (!ctl.signal.aborted) await completeJob(sql, job.id, result);
    await log("concluído");
  } catch (e) {
    const msg = (e as Error).message;
    await log(`erro: ${msg}`).catch(() => {});
    if (!ctl.signal.aborted) await failJob(sql, job, msg, job.type === "SYNC_META" || job.type === "SYNC_GOOGLE"); // só sync repete sozinho
  } finally {
    clearInterval(vigia);
    ativos.delete(job.id);
  }
}

async function loop() {
  while (!parando) {
    try {
      if (ativos.size < CONCURRENCY) {
        const job = await claimJob(sql, WORKER_ID, TIPOS);
        if (job) { void executar(job); continue; }
      }
    } catch (e) {
      console.error(`[${agora()}] fila indisponível:`, (e as Error).message);
      await dormir(5000);
    }
    await dormir(1200);
  }
}

/** Sinal de vida para a web (topo: "Worker online") + contas de IA cadastradas. */
async function heartbeat() {
  const [c] = await sql<{ n: number }[]>`select count(*)::int as n from ads.ai_accounts where status = 'ACTIVE'`;
  const info = { host: hostname(), pid: process.pid, node: process.version, concurrency: CONCURRENCY, running: ativos.size, aiAccounts: c?.n ?? 0, syncIntervalMin: SYNC_INTERVAL_MIN, autostart: await inicializacaoAtiva() };
  await sql`insert into ads.worker_status (id, last_seen, info) values (${WORKER_ID}, now(), ${sql.json(info)})
            on conflict (id) do update set last_seen = now(), info = ads.worker_status.info || excluded.info`;
}

/** Instagram agendado: na hora marcada, vira job de publicação (um por publicação). */
async function publicarAgendados() {
  const devidos = await sql<{ id: string; workspace_id: string }[]>`
    select p.id, p.workspace_id from ads.instagram_posts p
    where p.status = 'AGENDADO' and p.agendado_para <= now()
      and not exists (select 1 from ads.jobs j where j.type = 'PUBLISH_INSTAGRAM' and j.status in ('PENDING','RUNNING') and j.payload->>'postId' = p.id::text)`;
  for (const p of devidos) await enqueueJob(sql, { workspaceId: p.workspace_id, type: "PUBLISH_INSTAGRAM", payload: { postId: p.id }, maxAttempts: 1 });
}

/** Sincronização automática: conexões sem sync há mais de SYNC_INTERVAL_MIN e sem job pendente. */
async function agendarSyncs() {
  const devidas = await sql<{ id: string; workspace_id: string; provider: string }[]>`
    select k.id, k.workspace_id, k.provider from ads.ad_connections k
    where k.status = 'ACTIVE' and (k.last_synced_at is null or k.last_synced_at < now() - make_interval(mins => ${SYNC_INTERVAL_MIN}))
      and not exists (select 1 from ads.jobs j where j.payload->>'connectionId' = k.id::text
        and (j.status in ('PENDING','RUNNING') or (j.status = 'FAILED' and j.finished_at > now() - interval '30 minutes')))`;
  for (const k of devidas) {
    await enqueueJob(sql, { workspaceId: k.workspace_id, type: jobDeSync(k.provider), payload: { connectionId: k.id, auto: true } });
  }
}

const repetir = (fn: () => Promise<unknown>, ms: number) => {
  const rodar = () => fn().catch((e) => console.error(`[${agora()}] ${fn.name}:`, (e as Error).message));
  void rodar();
  return setInterval(rodar, ms);
};

async function parar() {
  if (parando) return;
  parando = true;
  console.log("encerrando: devolvendo jobs em andamento para a fila…");
  for (const ctl of ativos.values()) ctl.abort();
  await sql`update ads.jobs set status = 'PENDING', locked_by = null where status = 'RUNNING' and locked_by = ${WORKER_ID} and type <> 'AI_CHAT'`.catch(() => {});
  await sql`update ads.jobs set status = 'FAILED', error = 'Worker reiniciado durante a resposta', finished_at = now() where status = 'RUNNING' and locked_by = ${WORKER_ID} and type = 'AI_CHAT'`.catch(() => {});
  await sql`update ads.ai_conversations set status = 'IDLE' where status = 'RUNNING'`.catch(() => {});
  process.exit(0);
}
process.on("SIGINT", parar);
process.on("SIGTERM", parar);

// Um worker por PC: a porta local serve de trava (pnpm dev + tarefa do Windows não sobem dois).
await new Promise<void>((ok) => {
  const trava = createServer();
  trava.once("error", () => { console.log("Outro DOMUS Worker já está rodando neste PC. Nada a fazer."); process.exit(0); });
  trava.listen(Number(process.env.WORKER_LOCK_PORT || 47391), "127.0.0.1", () => { trava.unref(); ok(); });
});

await migrate(process.env.DIRECT_URL, (m) => console.log(m)); // banco sempre em dia, sem comando manual
await sql`update ads.ai_logins set status = 'FAILED', error = 'Worker reiniciado durante o login', updated_at = now()
           where status in ('STARTING','AWAITING_USER','CODE_SUBMITTED')`;
await sql`update ads.jobs set status = 'FAILED', error = 'Worker reiniciado', finished_at = now()
           where status = 'RUNNING' and type in ('AI_LOGIN','WORKER_STARTUP','GENERATE_VIDEO','GENERATE_IMAGE','PUBLISH_INSTAGRAM','AI_INSTAGRAM_CAPTION')`;
// queda no meio de uma publicação: não dá para saber se o Instagram chegou a publicar; avisa em vez de repetir
await sql`update ads.instagram_posts set status = 'FALHOU', erro = 'O worker reiniciou durante a publicação. Confira no perfil se ela saiu antes de tentar de novo.', updated_at = now()
           where status = 'PUBLICANDO'`;
await sql`update ads.instagram_posts set sugestao = null where sugestao->>'gerando' = 'true'`;
await sql`update ads.video_projects set status = 'FAILED', error = 'Worker reiniciado durante a geração. Gere de novo.', updated_at = now()
           where status in ('SCRIPTING','VOICE','COMPOSING','RENDERING','MIXING','UPLOADING')`;
const recuperados = await recoverJobs(sql, WORKER_ID);
// queda no meio de uma resposta: o texto parcial vira erro e o job (já devolvido à fila acima) responde de novo
await sql`update ads.ai_messages set status = 'ERROR', meta = meta || '{"error":"Worker reiniciado durante a resposta"}' where status = 'STREAMING'`;
await sql`update ads.ai_conversations set status = 'IDLE' where status = 'RUNNING' and not exists (
  select 1 from ads.jobs j where j.type = 'AI_CHAT' and j.status = 'PENDING' and j.payload->>'conversationId' = ads.ai_conversations.id::text)`;
console.log(`DOMUS Worker "${WORKER_ID}" no ar · ${CONCURRENCY} jobs simultâneos · ${recuperados.length} job(s) recuperado(s)`);
repetir(heartbeat, 30_000);
repetir(agendarSyncs, 5 * 60_000);
repetir(publicarAgendados, 30_000);
repetir(async function arquivarNoDrive() { await arquivarExcesso((m) => console.log(`[${agora()}] arquivo: ${m}`)); }, 30 * 60_000);
repetir(async function detectarContas() { await publicarDetectadas(await detectar()); }, 10 * 60_000);
await loop();
