import { db } from "@domus-ads/core";

/**
 * WhatsApp via Wuzapi local (infra/whatsapp). Só o worker fala com ela (localhost):
 * o estado e o QR de conexão vão para ads.worker_status.info, e a tela de Configurações lê de lá.
 */
const URL_WZ = process.env.WUZAPI_URL;
const ADMIN = process.env.WUZAPI_ADMIN_TOKEN ?? "";
const TOKEN = process.env.WUZAPI_TOKEN ?? "";

export type EstadoWhatsapp = { state: "open" | "connecting" | "close" | "off"; numero?: string | null; nome?: string | null; erro?: string };

async function wz<T>(metodo: string, caminho: string, corpo?: unknown, admin = false): Promise<T> {
  const r = await fetch(`${URL_WZ}${caminho}`, {
    method: metodo, headers: { ...(admin ? { Authorization: ADMIN } : { Token: TOKEN }), "content-type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(15_000),
  });
  const j = await r.json().catch(() => null) as { data?: T; error?: string } | null;
  if (!r.ok) throw new Error(`Wuzapi ${r.status}: ${j?.error ?? "erro"}`);
  return j?.data as T;
}

/** jid "5531999999999.0:12@s.whatsapp.net" → "5531999999999" */
const numeroDe = (jid?: string | null) => jid?.split(/[.:@]/)[0] || null;

/** Para o heartbeat: conectado ou não, e qual número. Nunca lança. */
export async function estadoWhatsapp(): Promise<EstadoWhatsapp | null> {
  if (!URL_WZ) return null;
  try {
    const s = await wz<{ connected: boolean; loggedIn: boolean; jid?: string }>("GET", "/session/status");
    return { state: s.loggedIn ? "open" : s.connected ? "connecting" : "close", numero: s.loggedIn ? numeroDe(s.jid) : null };
  } catch (e) {
    const m = (e as Error).message;
    if (m.includes("401")) return { state: "close" }; // usuário ainda não criado: o primeiro "Conectar" cria
    return { state: "off", erro: m.includes("fetch failed") ? "Wuzapi fora do ar (Docker parado?)" : m };
  }
}

const gravarInfo = (info: Record<string, unknown>) => db()`update ads.worker_status set info = info || ${db().json(info as never)} where id = (select id from ads.worker_status order by last_seen desc limit 1)`;
export const gravarQr = (qr: string | null) => gravarInfo({ whatsappQr: qr });

/** Job WHATSAPP: "conectar" mostra QRs novos por até 2 min até ler; "desconectar" desloga o número. */
export async function acaoWhatsapp(acao: string, signal: AbortSignal, log: (m: string) => Promise<void>) {
  if (!URL_WZ || !TOKEN) throw new Error("WUZAPI_URL/WUZAPI_TOKEN não configurados no .env do worker");
  if (acao === "desconectar") {
    await wz("POST", "/session/logout").catch(() => {});
    await gravarQr(null);
    return { ok: true };
  }
  if (acao !== "conectar") throw new Error(`Ação inválida: ${acao}`);
  const usuarios = await wz<{ token: string }[]>("GET", "/admin/users", undefined, true);
  if (!usuarios.some((u) => u.token === TOKEN)) await wz("POST", "/admin/users", { name: "domus", token: TOKEN, events: "Message" }, true);
  await wz("POST", "/session/connect", { Subscribe: ["Message"], Immediate: true });
  try {
    for (let t = 0; t < 40 && !signal.aborted; t++) {
      await new Promise((ok) => setTimeout(ok, 3000));
      const st = await estadoWhatsapp();
      if (st?.state === "open") { await gravarInfo({ whatsapp: st }); await log(`conectado: ${st.numero ?? ""}`); return { ok: true }; }
      const qr = await wz<{ QRCode?: string }>("GET", "/session/qr").catch(() => null);
      if (qr?.QRCode) await gravarQr(qr.QRCode);
    }
    throw new Error("QR não foi lido em 2 minutos. Clique em conectar de novo.");
  } finally {
    await gravarQr(null);
  }
}
