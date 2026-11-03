import { db, pontuar, tipoSite, whatsappDe } from "@domus-ads/core";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./env";

/**
 * Prospecção: o Google Maps Scraper Kit (github.com/Mahanaicoach/google-maps-scraper-kit, MIT) roda como processo
 * à parte (Python + Chrome headless) só enquanto há busca, em 127.0.0.1 com chave aleatória. O worker fala com ele
 * pela API local (POST /api/v1/jobs, acompanha, baixa o JSON) e grava as empresas em ads.prospectos.
 * Fica numa vaga própria do worker: não ocupa as vagas de imagem, vídeo, chat e WhatsApp.
 */
const REPO = "https://github.com/Mahanaicoach/google-maps-scraper-kit.git";
const COMMIT = "15dd80b584dfeab550271ba383b540af8f44d1d2"; // versão revisada (2.2.0); atualizar = trocar aqui depois de olhar o diff
const KIT = join(DATA_DIR, "gmaps-kit");
const PORTA = Number(process.env.PROSPECCAO_PORTA || 47393);
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const BASE = `http://127.0.0.1:${PORTA}`;
const CHAVE = randomBytes(24).toString("hex");
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Log = (m: string) => Promise<void>;

function instalarKit(log: Log) {
  if (existsSync(join(KIT, "engine", "serve.py"))) {
    const atual = spawnSync("git", ["-C", KIT, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).stdout?.trim();
    if (atual === COMMIT) return;
  }
  void log("baixando o Google Maps Scraper Kit (só na primeira vez)…");
  if (!existsSync(KIT)) {
    const c = spawnSync("git", ["clone", "--quiet", REPO, KIT], { encoding: "utf8", windowsHide: true });
    if (c.status !== 0) throw new Error(`Não consegui baixar o kit: ${c.stderr?.slice(0, 200) || "git falhou"}`);
  } else spawnSync("git", ["-C", KIT, "fetch", "--quiet", "origin"], { windowsHide: true });
  const co = spawnSync("git", ["-C", KIT, "checkout", "--quiet", COMMIT], { encoding: "utf8", windowsHide: true });
  if (co.status !== 0) throw new Error(`Não consegui usar a versão do kit: ${co.stderr?.slice(0, 200)}`);
}

let motor: ChildProcess | null = null;

async function api<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(BASE + caminho, {
    method: metodo, headers: { "X-API-Key": CHAVE, ...(corpo ? { "Content-Type": "application/json" } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`motor de busca respondeu ${r.status}: ${txt.slice(0, 200)}`);
  return (txt ? JSON.parse(txt) : null) as T;
}

async function ligarMotor(log: Log) {
  instalarKit(log);
  if (motor && motor.exitCode === null) return;
  const py = spawnSync(PYTHON, ["--version"], { encoding: "utf8", windowsHide: true });
  if (py.status !== 0) throw new Error(`Python não encontrado no PC do worker (precisa do 3.10+). Instale ou defina PYTHON no .env.`);
  motor = spawn(PYTHON, [join(KIT, "engine", "serve.py"), "--port", String(PORTA), "--data", join(DATA_DIR, "prospeccao")], {
    cwd: KIT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, SCRAPER_API_KEY: CHAVE, SCRAPER_HEADLESS: "1", PYTHONUTF8: "1" },
  });
  let saida = "";
  motor.stdout?.on("data", (d: Buffer) => { saida = (saida + d.toString()).slice(-2000); });
  motor.stderr?.on("data", (d: Buffer) => { saida = (saida + d.toString()).slice(-2000); });
  for (let i = 0; i < 40; i++) {
    if (motor.exitCode !== null) throw new Error(`O motor de busca não abriu: ${saida.trim().split("\n").slice(-3).join(" ")}`);
    const ok = await fetch(`${BASE}/api/v1/jobs`, { headers: { "X-API-Key": CHAVE }, signal: AbortSignal.timeout(2000) })
      .then((r) => r.ok && (r.headers.get("x-engine") ?? "").startsWith("gmskit-engine")).catch(() => false);
    if (ok) return void log("motor de busca ligado");
    await dormir(500);
  }
  desligarMotor();
  throw new Error("O motor de busca não respondeu em 20 s");
}

export function desligarMotor() {
  if (motor && motor.exitCode === null) {
    if (process.platform === "win32" && motor.pid) spawnSync("taskkill", ["/PID", String(motor.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); // leva o Chrome junto
    else motor.kill();
  }
  motor = null;
}

type Cidade = { label: string; lat: string | number; lon: string | number; country: string };
type JobMotor = { Status: string; Error?: string; Progress?: { percent?: number; places?: number; stage?: string } };
type Linha = Record<string, unknown>;

const txt = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null; };

/** Job PROSPECTAR: uma busca de CRM → Prospecção. */
export async function runProspeccao(id: string, signal: AbortSignal, log: Log, progresso: (p: number) => Promise<void>) {
  const sql = db();
  const [b] = await sql<{ nicho: string; cidade: string; bairros: string[]; profundidade: number }[]>`
    update ads.prospeccoes set status = 'RODANDO', erro = null, updated_at = now() where id = ${id} and status in ('FILA','RODANDO','ERRO')
    returning nicho, cidade, bairros, profundidade`;
  if (!b) return { ok: false, motivo: "busca não está na fila" };
  let jobMotor: string | null = null;
  try {
    await ligarMotor(log);
    // centro do mapa pela cidade (lista do próprio kit, GeoNames); sem achar, o Google acha pelo texto da busca
    const nomeCidade = b.cidade.split(/[,-]/)[0]!.trim();
    const achadas = await api<Cidade[] | null>("GET", `/api/v1/cities?q=${encodeURIComponent(nomeCidade)}`).catch(() => null);
    const c = (achadas ?? []).find((x) => x.country?.toUpperCase() === "BR");
    const palavras = [`${b.nicho} em ${b.cidade}`, ...b.bairros.map((x) => `${b.nicho} ${x}, ${b.cidade}`)];
    const tempo = Math.min(3 * 3600, palavras.length * (90 + b.profundidade * 60) + 600);
    const r = await api<{ id: string }>("POST", "/api/v1/jobs", {
      name: `DOMUS ${id}`, keywords: palavras, lang: "pt", country: "br", depth: b.profundidade, max_time: tempo, zoom: 14,
      email: true, verify_emails: true, socials: true,
      ...(c ? { lat: String(c.lat), lon: String(c.lon) } : {}),
    });
    jobMotor = r.id;
    await log(`buscando ${palavras.length} termo(s) em ${c?.label ?? b.cidade} (até ~${palavras.length * b.profundidade * 20} empresas)`);

    let j: JobMotor;
    for (;;) {
      if (signal.aborted) throw new Error("cancelada");
      j = await api<JobMotor>("GET", `/api/v1/jobs/${jobMotor}`);
      const pct = Math.min(99, Math.round(j.Progress?.percent ?? 0));
      await sql`update ads.prospeccoes set progresso = ${pct}, encontrados = ${j.Progress?.places ?? 0}, updated_at = now() where id = ${id}`;
      await progresso(pct);
      if (j.Status === "ok" || j.Status === "failed") break;
      await dormir(5000);
    }
    const linhas = (await api<Linha[] | null>("GET", `/api/v1/jobs/${jobMotor}/download?format=json`)) ?? [];
    const { total, novos } = await gravar(id, linhas);
    if (j.Status === "failed" && !total) throw new Error(j.Error || "a busca falhou no Google Maps");
    await sql`update ads.prospeccoes set status = 'PRONTO', progresso = 100, encontrados = ${total}, novos = ${novos}, erro = ${j.Error || null}, updated_at = now() where id = ${id}`;
    await log(`${total} empresa(s), ${novos} nova(s)${j.Error ? ` · aviso: ${j.Error}` : ""}`);
    return { total, novos };
  } catch (e) {
    const cancelada = signal.aborted;
    await sql`update ads.prospeccoes set status = ${cancelada ? "CANCELADO" : "ERRO"}, erro = ${cancelada ? null : (e as Error).message.slice(0, 300)}, updated_at = now() where id = ${id}`;
    throw e;
  } finally {
    if (jobMotor) await api("DELETE", `/api/v1/jobs/${jobMotor}`).catch(() => {});
    desligarMotor(); // Chrome e Python saem da memória até a próxima busca
  }
}

/** Empresas → ads.prospectos. Dado de terceiros: só texto, nunca seguido nem executado. A mesma empresa atualiza, não duplica. */
async function gravar(buscaId: string, linhas: Linha[]) {
  const sql = db();
  let total = 0, novos = 0;
  for (const l of linhas) {
    const nome = txt(l.title).slice(0, 200);
    const chave = txt(l.place_id) || txt(l.cid) || txt(l.link);
    if (!nome || !chave) continue;
    const site = txt(l.website).slice(0, 500) || null;
    const tipo = tipoSite(site);
    const telefone = txt(l.phone).slice(0, 40) || null;
    const whatsapp = whatsappDe(telefone);
    const emails = txt(l.emails).split(/[,;\s]+/).filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e)).slice(0, 5);
    const redes = Object.fromEntries(["instagram", "facebook", "linkedin", "tiktok", "youtube", "x"].map((k) => [k, txt(l[k]).slice(0, 300)]).filter(([, v]) => v));
    const nota = num(l.review_rating), avaliacoes = num(l.review_count);
    const aberto = !/fechad|closed/i.test(txt(l.status));
    const pontos = pontuar({ tipo, nota, avaliacoes, whatsapp, emails: emails.length, aberto });
    const lat = num(l.latitude), lon = num(l.longitude);
    const [r] = await sql<{ novo: boolean }[]>`
      insert into ads.prospectos (chave, prospeccao_id, nome, categoria, endereco, telefone, whatsapp, site, tipo_site, emails, redes, nota, avaliacoes, link, latitude, longitude, pontos)
      values (${chave.slice(0, 300)}, ${buscaId}, ${nome}, ${txt(l.category).slice(0, 120) || null}, ${txt(l.address).slice(0, 300) || null}, ${telefone}, ${whatsapp},
        ${site}, ${tipo}, ${emails}, ${sql.json(redes)}, ${nota != null && nota <= 5 ? nota : null}, ${avaliacoes != null ? Math.round(avaliacoes) : null},
        ${txt(l.link).slice(0, 1000) || null}, ${lat != null && Math.abs(lat) <= 90 ? lat : null}, ${lon != null && Math.abs(lon) <= 180 ? lon : null}, ${pontos})
      on conflict (chave) do update set nome = excluded.nome, categoria = excluded.categoria, endereco = excluded.endereco, telefone = excluded.telefone,
        whatsapp = excluded.whatsapp, site = excluded.site, tipo_site = excluded.tipo_site, emails = excluded.emails, redes = excluded.redes,
        nota = excluded.nota, avaliacoes = excluded.avaliacoes, link = excluded.link, pontos = excluded.pontos, updated_at = now()
      returning (xmax = 0) as novo`;
    total++;
    if (r?.novo) novos++;
  }
  return { total, novos };
}
