import { db } from "@domus-ads/core";

/**
 * WhatsApp via Evolution API local (infra/whatsapp). Só o worker fala com ela (localhost):
 * o estado e o QR de conexão vão para ads.worker_status.info, e a tela de Configurações lê de lá.
 */
const URL_EVO = process.env.EVOLUTION_URL;
const CHAVE = process.env.EVOLUTION_API_KEY ?? "";
const INSTANCIA = process.env.EVOLUTION_INSTANCE || "domus";

export type EstadoWhatsapp = { state: "open" | "connecting" | "close" | "off"; numero?: string | null; nome?: string | null; erro?: string };

async function evo<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(`${URL_EVO}${caminho}`, {
    method: metodo, headers: { apikey: CHAVE, "content-type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw Object.assign(new Error(`Evolution ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: r.status });
  return r.json() as Promise<T>;
}

/** Para o heartbeat: conectado ou não, e qual número. Nunca lança. */
export async function estadoWhatsapp(): Promise<EstadoWhatsapp | null> {
  if (!URL_EVO) return null;
  try {
    const [i] = await evo<{ connectionStatus: string; ownerJid: string | null; profileName: string | null }[]>("GET", `/instance/fetchInstances?instanceName=${INSTANCIA}`);
    if (!i) return { state: "close" };
    return { state: i.connectionStatus as EstadoWhatsapp["state"], numero: i.ownerJid?.split("@")[0] ?? null, nome: i.profileName };
  } catch (e) {
    return { state: "off", erro: (e as Error).message.includes("fetch failed") ? "Evolution API fora do ar (Docker parado?)" : (e as Error).message };
  }
}

const gravarInfo = (info: Record<string, unknown>) => db()`update ads.worker_status set info = info || ${db().json(info as never)} where id = (select id from ads.worker_status order by last_seen desc limit 1)`;
export const gravarQr = (qr: string | null) => gravarInfo({ whatsappQr: qr });

/** Job WHATSAPP: "conectar" mostra QRs novos por até 2 min até ler; "desconectar" desloga o número. */
export async function acaoWhatsapp(acao: string, signal: AbortSignal, log: (m: string) => Promise<void>) {
  if (!URL_EVO) throw new Error("EVOLUTION_URL não configurada no .env do worker");
  if (acao === "desconectar") {
    await evo("DELETE", `/instance/logout/${INSTANCIA}`).catch(() => {});
    await gravarQr(null);
    return { ok: true };
  }
  if (acao !== "conectar") throw new Error(`Ação inválida: ${acao}`);
  const existe = await evo<unknown[]>("GET", `/instance/fetchInstances?instanceName=${INSTANCIA}`).then((l) => l.length > 0, () => false);
  if (!existe) await evo("POST", "/instance/create", { instanceName: INSTANCIA, integration: "WHATSAPP-BAILEYS", qrcode: true });
  try {
    for (let t = 0; t < 40 && !signal.aborted; t++) {
      const st = await estadoWhatsapp();
      if (st?.state === "open") { await gravarInfo({ whatsapp: st }); await log(`conectado: ${st.nome ?? ""}`); return { ok: true }; }
      // o QR muda a cada ~20 s; a cada 15 s pega o atual
      if (t % 5 === 0) {
        const r = await evo<{ base64?: string }>("GET", `/instance/connect/${INSTANCIA}`);
        if (r.base64) await gravarQr(r.base64);
      }
      await new Promise((ok) => setTimeout(ok, 3000));
    }
    throw new Error("QR não foi lido em 2 minutos. Clique em conectar de novo.");
  } finally {
    await gravarQr(null);
  }
}
