import { db } from "@domus-ads/core";
import { campanhas, configProsp, salvarLeadsProsp } from "@domus-ads/core/prospeccao-db";
import { completeLead, type Lead } from "@domus-ads/core/prospeccao";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { DATA_DIR } from "../env";
import { rodar } from "../video/tools";

/**
 * Prospecção no Google Maps: roda o Python do CAMPS-UTILS (apps/worker/python) com Playwright e o Edge do Windows,
 * invisível. Fica no PC porque o Google bloqueia IP de datacenter. Venv próprio (.worker-data/prospeccao-py): só o
 * pacote playwright, sem baixar navegador (usa channel="msedge").
 */
const VENV = join(DATA_DIR, "prospeccao-py");
const PY = join(VENV, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
export const PASTA_PY = resolve(import.meta.dirname, "../../python");
const PASTA = join(DATA_DIR, "prospeccao");

let pronto: Promise<void> | null = null;
export function garantirPlaywright(log: (m: string) => Promise<void>): Promise<void> {
  pronto ??= (async () => {
    if (existsSync(PY) && (await rodar(PY, ["-c", "import playwright"])).code === 0) return;
    await log("preparando a prospecção pela primeira vez (Python + Playwright): 1 a 2 minutos…");
    mkdirSync(DATA_DIR, { recursive: true });
    const base = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
    const v = await rodar(base, ["-m", "venv", VENV], { timeoutMs: 180_000 });
    if (v.code !== 0) throw new Error(`Python não encontrado para a prospecção (${v.err.trim().slice(0, 200)}). Instale o Python 3.10+ ou defina PYTHON_BIN.`);
    const pip = await rodar(PY, ["-m", "pip", "install", "-q", "playwright", "pytest"], { timeoutMs: 900_000 });
    if (pip.code !== 0) throw new Error(`Falha ao instalar o Playwright: ${pip.err.trim().split("\n").at(-1)}`);
  })().catch((e) => { pronto = null; throw e; });
  return pronto;
}

export const pythonProspeccao = () => PY;

/** Mata o Python e o Edge que ele abriu (no Windows, kill() só derruba o processo de cima). */
function matarArvore(pid: number | undefined) {
  if (!pid) return;
  if (process.platform === "win32") spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else try { process.kill(-pid, "SIGKILL"); } catch { /* já saiu */ }
}

interface Resultado { success: boolean; found?: number; audited?: number; blocked?: boolean; leads?: Parameters<typeof completeLead>[0][]; message?: string }
export interface ProspeccaoPayload { campanhaId: string }

export async function runProspeccao(p: ProspeccaoPayload, o: { signal: AbortSignal; log: (m: string) => Promise<void>; progress: (n: number) => Promise<void> }) {
  const sql = db();
  const [c] = await campanhas(sql, p.campanhaId);
  if (!c) throw new Error("Busca não encontrada (foi excluída?)");
  await sql`update ads.prosp_campanhas set status = 'running', progresso = 0, etapa_texto = '', encontrados = 0, a_auditar = 0, erro = null, updated_at = now() where id = ${c.id}`;
  try {
    await garantirPlaywright(o.log);
  } catch (e) {
    await sql`update ads.prosp_campanhas set status = 'failed', erro = ${(e as Error).message}, updated_at = now() where id = ${c.id}`;
    throw e;
  }
  const { pesos } = await configProsp(sql);
  mkdirSync(PASTA, { recursive: true });
  const entrada = join(PASTA, `${c.id}.json`);
  // tudo por arquivo: nada digitado vira argumento de linha de comando
  writeFileSync(entrada, JSON.stringify({
    campaignId: c.id, source: "google_maps", niches: c.niches, location: c.locationLabel, centerLat: c.centerLat, centerLng: c.centerLng,
    radiusKm: c.radiusKm, maxLeads: c.maxLeads, language: "pt-BR", country: "BR", pace: c.pace, auditWebsites: c.auditWebsites,
    opportunityFocus: c.opportunityFocus, scoreWeights: pesos,
  }), "utf8");

  // andamento: o que o Python conta no stderr, gravado no máximo 1x por segundo
  const achados = new Map<string, Lead>();
  const st = { progresso: 0, etapa: "Abrindo o navegador", encontrados: 0, aAuditar: 0, sujo: true };
  const gravar = async () => {
    if (!st.sujo) return;
    st.sujo = false;
    await sql`update ads.prosp_campanhas set progresso = ${st.progresso}, etapa_texto = ${st.etapa.slice(0, 300)}, encontrados = ${st.encontrados}, a_auditar = ${st.aAuditar}, updated_at = now() where id = ${c.id}`;
    await o.progress(st.progresso);
  };
  const relogio = setInterval(() => void gravar().catch(() => {}), 1000);

  const proc = spawn(PY, [join(PASTA_PY, "prospectar.py"), entrada], {
    cwd: PASTA_PY, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32",
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
  });
  const parar = () => matarArvore(proc.pid);
  o.signal.addEventListener("abort", parar);
  let saida = "", erros = "";
  proc.stdout.on("data", (d) => { saida = (saida + d).slice(-20_000_000); });
  createInterface({ input: proc.stderr }).on("line", (linha) => {
    if (linha.startsWith("LEADEVENT:")) {
      try {
        const e = JSON.parse(linha.slice(10)) as { type: string; lead?: Parameters<typeof completeLead>[0] };
        // o contador soma os eventos "lead" (um por empresa lida); os "audited" só chegam no fim
        if (e.type === "lead" && e.lead?.name) { const l = completeLead(e.lead, c.id); achados.set(l.id, l); st.encontrados = achados.size; st.sujo = true; }
      } catch { /* linha cortada: ignora */ }
    } else if (linha.startsWith("STEP: ")) {
      st.etapa = linha.slice(6); st.sujo = true;
      const a = linha.match(/Auditando (\d+)/);
      if (a) st.aAuditar = Number(a[1]);
      void o.log(st.etapa);
    } else if (linha.startsWith("PROGRESS:")) {
      st.progresso = Math.max(0, Math.min(100, Number(linha.slice(9)) || 0)); st.sujo = true;
    } else if (linha.trim()) {
      erros = (erros + linha + "\n").slice(-8000);
    }
  });
  // sem teto de tempo do Python: 500 leads auditados levam ~15 min; 40 min é folga
  const teto = setTimeout(parar, 40 * 60_000);
  const code = await new Promise<number | null>((ok) => { proc.on("close", ok); proc.on("error", () => ok(null)); });
  clearTimeout(teto); clearInterval(relogio);
  o.signal.removeEventListener("abort", parar);
  st.sujo = true; await gravar().catch(() => {});
  rmSync(entrada, { force: true });

  /** parou ou falhou no meio: guarda o que já tinha (sem auditoria nem score) */
  const guardarParcial = async (status: "cancelled" | "failed", erro: string | null) => {
    await salvarLeadsProsp(sql, c.id, [...achados.values()]);
    await sql`update ads.prosp_campanhas set status = ${status}, erro = ${erro}, encontrados = ${achados.size}, updated_at = now() where id = ${c.id}`;
  };
  if (o.signal.aborted) {
    await guardarParcial("cancelled", null);
    await o.log(`busca parada: ${achados.size} empresas guardadas sem auditoria`);
    return { found: achados.size, audited: 0, cancelled: true };
  }
  let r: Resultado | null = null;
  try { r = JSON.parse(saida.trim().split("\n").at(-1) ?? "") as Resultado; } catch { /* sem resposta */ }
  if (!r?.success) {
    const msg = r?.message || (code === null ? "O Python não abriu" : `A busca parou (código ${code}): ${erros.trim().split("\n").at(-1) ?? "sem detalhe"}`);
    await guardarParcial("failed", msg.slice(0, 600));
    throw new Error(msg);
  }
  const leads = (r.leads ?? []).filter((l) => l?.name).map((l) => completeLead(l, c.id));
  await salvarLeadsProsp(sql, c.id, leads);
  await sql`update ads.prosp_campanhas set status = 'completed', progresso = 100, encontrados = ${r.found ?? leads.length}, auditados = ${r.audited ?? 0},
    bloqueado = ${!!r.blocked}, etapa_texto = 'Concluída', updated_at = now() where id = ${c.id}`;
  await o.log(`${leads.length} leads salvos${r.blocked ? " (o Google limitou as buscas no meio)" : ""}`);
  return { found: r.found ?? leads.length, audited: r.audited ?? 0, blocked: !!r.blocked };
}
