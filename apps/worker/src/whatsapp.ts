import { db, whatsappAvisos } from "@domus-ads/core";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { emailAdmins } from "./email";

/**
 * WhatsApp via Wuzapi local (infra/whatsapp). Só o worker fala com ela (localhost):
 * o estado e o QR de conexão vão para ads.worker_status.info, e a tela de Configurações lê de lá.
 * As respostas chegam pelo webhook da Wuzapi numa porta só do PC (127.0.0.1), num caminho secreto.
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

let cacheJid: { para: string; jid: string } | null = null;
/** Número dos avisos e o JID dele (o WhatsApp agora endereça por LID: mandar direto para o número dá "no LID found"). */
async function destino() {
  const para = await whatsappAvisos();
  if (!URL_WZ || !TOKEN || !para) throw new Error("WhatsApp ou número dos avisos não configurado");
  if (cacheJid?.para === para) return cacheJid;
  const { Users } = await wz<{ Users: { IsInWhatsapp: boolean; JID: string }[] }>("POST", "/user/check", { Phone: [para] });
  const jid = Users.find((u) => u.IsInWhatsapp)?.JID;
  if (!jid) throw new Error(`O número ${para} não tem WhatsApp`);
  return (cacheJid = { para, jid });
}

/** Envia para o número dos avisos e grava no histórico (Mensagens). Lança se falhar. */
async function enviar(caminho: string, corpo: Record<string, string>, texto: string) {
  const para = await whatsappAvisos();
  const registrar = (erro: string | null) => db()`insert into ads.whatsapp_envios (para, texto, status, erro)
    values (${para ?? "—"}, ${texto}, ${erro ? "FALHOU" : "ENVIADO"}, ${erro})`.catch(() => {});
  try {
    const d = await destino();
    await wz("POST", caminho, { Phone: d.jid, ...corpo });
    await registrar(null);
  } catch (e) {
    await registrar((e as Error).message);
    throw e;
  }
}

/** Manda um aviso para o número de Configurações → WhatsApp. Nunca lança: aviso não pode derrubar publicação. */
export async function avisar(texto: string, falhar = false) {
  try {
    await enviar("/chat/send/text", { Body: texto }, texto);
  } catch (e) {
    if (falhar) throw e;
    console.log(`aviso no WhatsApp não enviado: ${(e as Error).message}`);
  }
}

/** Imagem (PNG/JPEG) ou vídeo MP4 para o número dos avisos. Lança se falhar. */
export const enviarMidia = (tipo: "image" | "video", arquivo: Buffer, mime: string, legenda = "") =>
  enviar(`/chat/send/${tipo}`, { [tipo === "image" ? "Image" : "Video"]: `data:${mime};base64,${arquivo.toString("base64")}`, Caption: legenda },
    `[${tipo === "image" ? "imagem" : "vídeo"}]${legenda ? ` ${legenda}` : ""}`);

// ───────────── Respostas: webhook da Wuzapi → worker ─────────────

const PORTA_HOOK = Number(process.env.WORKER_HOOK_PORT || 47392);
const CAMINHO_HOOK = `/whatsapp/${createHash("sha256").update(`webhook:${TOKEN}`).digest("hex").slice(0, 32)}`;
const LIMITE_HOOK = 20_000_000; // mídia recebida vem em base64: só o texto interessa
/** Mesmo número com ou sem o 9 do celular brasileiro (o WhatsApp guarda alguns sem). */
const mesmoNumero = (a: string, b: string) => a === b || (a.startsWith("55") && b.startsWith("55") && a.slice(0, 4) === b.slice(0, 4) && a.slice(-8) === b.slice(-8));

type EventoMsg = { type?: string; jsonData?: string; event?: { Info?: Record<string, unknown>; Message?: { conversation?: string; extendedTextMessage?: { text?: string } } } };

/** Texto que o número dos avisos mandou; o resto (grupos, outros contatos, mídia, o próprio envio) vira null. */
async function textoDoDono(corpo: string, tipo: string): Promise<string | null> {
  let j = JSON.parse(tipo.includes("json") ? corpo : new URLSearchParams(corpo).get("jsonData") ?? "{}") as EventoMsg;
  if (typeof j.jsonData === "string") j = JSON.parse(j.jsonData) as EventoMsg;
  const info = j.event?.Info ?? {};
  if (j.type !== "Message" || info.IsFromMe || info.IsGroup) return null;
  const texto = (j.event?.Message?.conversation ?? j.event?.Message?.extendedTextMessage?.text ?? "").trim();
  if (!texto) return null;
  const d = await destino();
  const de = [info.Sender, info.SenderAlt, info.Chat, info.ChatAlt].map((x) => numeroDe(typeof x === "string" ? x : null)).filter((x): x is string => !!x);
  if (!de.some((n) => [d.para, numeroDe(d.jid)].some((a) => a && mesmoNumero(n, a)))) {
    console.log(`WhatsApp: mensagem de ${de.join(" / ") || "?"} ignorada (não é o número dos avisos)`);
    return null;
  }
  return texto;
}

/** Aponta o webhook da Wuzapi para o worker (a cada subida e depois de conectar). Nunca lança. */
async function registrarWebhook() {
  if (!URL_WZ || !TOKEN) return;
  // sem "events" a Wuzapi zera a assinatura e descarta as mensagens ("Not subscribed")
  await wz("POST", "/webhook", { webhookURL: `http://host.docker.internal:${PORTA_HOOK}${CAMINHO_HOOK}`, events: ["Message"] })
    .catch((e: Error) => console.log(`webhook do WhatsApp não registrado: ${e.message}`));
}

/** Escuta o que chega no WhatsApp e passa as mensagens do número dos avisos para `responder`. */
export function ouvirWhatsapp(responder: (texto: string) => Promise<void>) {
  if (!URL_WZ || !TOKEN) return;
  createServer((req, res) => {
    if (req.method !== "POST" || req.url !== CAMINHO_HOOK) { res.statusCode = 404; res.end(); req.resume(); return; }
    const partes: Buffer[] = [];
    let tam = 0;
    req.on("data", (c: Buffer) => { tam += c.length; if (tam <= LIMITE_HOOK) partes.push(c); });
    req.on("end", () => {
      res.end("ok");
      if (tam > LIMITE_HOOK) return;
      void textoDoDono(Buffer.concat(partes).toString("utf8"), String(req.headers["content-type"] ?? ""))
        .then((t) => (t ? responder(t) : undefined))
        .catch((e: Error) => console.log(`WhatsApp: resposta não tratada: ${e.message}`));
    });
  }).on("error", (e) => console.log(`webhook do WhatsApp sem a porta ${PORTA_HOOK}: ${e.message}`)).listen(PORTA_HOOK, "127.0.0.1");
  void registrarWebhook();
}

/**
 * Chamado a cada heartbeat: se o número estava conectado e caiu (2 leituras seguidas, para não avisar por soluço),
 * manda e-mail aos admins com o link para reconectar. Desconectar pela tela não avisa.
 */
let estavaConectado: boolean | null = null;
let quedas = 0;
let desconexaoManual = false;
export async function vigiarQueda(st: EstadoWhatsapp | null) {
  if (!st) return;
  if (st.state === "open") { estavaConectado = true; quedas = 0; desconexaoManual = false; return; }
  if (estavaConectado === null) {
    // worker acabou de subir: o último estado gravado diz se estava conectado antes
    const [w] = await db()<{ s: string | null }[]>`select info->'whatsapp'->>'state' as s from ads.worker_status order by last_seen desc limit 1`;
    estavaConectado = w?.s === "open";
  }
  if (!estavaConectado || ++quedas < 2) return;
  estavaConectado = false;
  if (desconexaoManual) return;
  const url = `${process.env.APP_PUBLIC_URL || process.env.APP_URL}/settings#whatsapp`;
  const motivo = st.state === "off" ? `a Wuzapi está fora do ar (${st.erro ?? "Docker parado?"})` : "o número foi desconectado do WhatsApp";
  await emailAdmins("WhatsApp do DOMUS desconectou", `<p>O WhatsApp dos avisos do DOMUS AdPilot caiu: ${motivo}.</p>
    <p>Os avisos de publicação não chegam até reconectar.</p>
    <p><a href="${url}">Reconectar agora</a> (clique no WhatsApp no topo da plataforma e leia o QR code).</p>`);
  console.log(`WhatsApp caiu (${st.state}): e-mail enviado aos admins`);
}

const gravarInfo =(info: Record<string, unknown>) => db()`update ads.worker_status set info = info || ${db().json(info as never)} where id = (select id from ads.worker_status order by last_seen desc limit 1)`;
export const gravarQr = (qr: string | null) => gravarInfo({ whatsappQr: qr });

/** Job WHATSAPP: "conectar" mostra QRs novos por até 2 min até ler; "desconectar" desloga o número. */
export async function acaoWhatsapp(acao: string, signal: AbortSignal, log: (m: string) => Promise<void>) {
  if (!URL_WZ || !TOKEN) throw new Error("WUZAPI_URL/WUZAPI_TOKEN não configurados no .env do worker");
  if (acao === "desconectar") {
    desconexaoManual = true;
    await wz("POST", "/session/logout").catch(() => {});
    await gravarQr(null);
    return { ok: true };
  }
  if (acao === "teste") {
    await avisar("✅ Teste do DOMUS AdPilot: os avisos de publicação vão chegar neste número.", true);
    return { ok: true };
  }
  if (acao !== "conectar") throw new Error(`Ação inválida: ${acao}`);
  // 409 = socket já aberto (pedido anterior): segue e só busca o QR
  const conectar = () => wz("POST", "/session/connect", { Subscribe: ["Message"], Immediate: true }).catch((e: Error) => { if (!e.message.includes("409")) throw e; });
  await gravarInfo({ whatsappErro: null });
  try {
    const usuarios = await wz<{ token: string }[]>("GET", "/admin/users", undefined, true);
    if (!usuarios.some((u) => u.token === TOKEN)) await wz("POST", "/admin/users", { name: "domus", token: TOKEN, events: "Message" }, true);
    await conectar();
    for (let t = 0; t < 40 && !signal.aborted; t++) {
      await new Promise((ok) => setTimeout(ok, 3000));
      const st = await estadoWhatsapp();
      if (st?.state === "open") { await gravarInfo({ whatsapp: st }); await registrarWebhook(); await log(`conectado: ${st.numero ?? ""}`); return { ok: true }; }
      // a Wuzapi fecha o canal quando os QRs expiram: abre de novo
      if (st?.state === "close") { await conectar(); continue; }
      const qr = await wz<{ QRCode?: string }>("GET", "/session/qr").catch(() => null);
      if (qr?.QRCode) await gravarQr(qr.QRCode);
    }
    throw new Error("QR não foi lido em 2 minutos. Clique em conectar de novo.");
  } catch (e) {
    if (!signal.aborted) await gravarInfo({ whatsappErro: (e as Error).message });
    throw e;
  } finally {
    await gravarQr(null);
  }
}
