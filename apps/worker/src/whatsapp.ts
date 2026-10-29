import { db, formatarNumero, FRIO, guardarArquivo, lerArquivo, mesmoNumero, numeroSalvo, whatsappAvisos } from "@domus-ads/core";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./env";
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

const jids = new Map<string, string>();
/** JID de um número (o WhatsApp agora endereça por LID: mandar direto para o número dá "no LID found"). */
async function jidDe(numero: string): Promise<string> {
  const c = jids.get(numero);
  if (c) return c;
  const { Users } = await wz<{ Users: { IsInWhatsapp: boolean; JID: string }[] }>("POST", "/user/check", { Phone: [numero] });
  const jid = Users.find((u) => u.IsInWhatsapp)?.JID;
  if (!jid) throw new Error(`O número ${numero} não tem WhatsApp`);
  jids.set(numero, jid);
  return jid;
}

/** Número dos avisos e o JID dele. */
async function destino() {
  const para = await whatsappAvisos();
  if (!URL_WZ || !TOKEN || !para) throw new Error("WhatsApp ou número dos avisos não configurado");
  return { para, jid: await jidDe(para) };
}

const MIMES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "application/pdf": "pdf" };
/** Guarda a mídia de uma mensagem (enviada ou recebida) no armazenamento da plataforma; o banco fica só com a chave. */
async function guardarMidia(dados: Buffer, mime: string, nome?: string | null): Promise<{ storage: string; key: string }> {
  const ext = MIMES[mime.split(";")[0]!] ?? nome?.split(".").pop()?.replace(/[^a-z0-9]/gi, "").slice(0, 5).toLowerCase() ?? "bin";
  const key = `ads/plataforma/whatsapp/${randomUUID()}.${ext || "bin"}`;
  const tmp = join(DATA_DIR, "whatsapp-tmp");
  mkdirSync(tmp, { recursive: true });
  const arq = join(tmp, key.split("/").pop()!);
  writeFileSync(arq, dados);
  try { return { storage: await guardarArquivo(key, arq, mime), key }; } finally { rmSync(arq, { force: true }); }
}

/** Corpo da Wuzapi para cada tipo (áudio que não é ogg/opus vai como arquivo: o WhatsApp só toca opus como áudio). */
function rotaMidia(tipo: string, mime: string, dados: Buffer, legenda: string, nome: string): [string, Record<string, string>] {
  const url = `data:${mime};base64,${dados.toString("base64")}`;
  if (tipo === "imagem") return ["/chat/send/image", { Image: url, Caption: legenda }];
  if (tipo === "video") return ["/chat/send/video", { Video: url, Caption: legenda }];
  if (tipo === "audio" && mime.startsWith("audio/ogg")) return ["/chat/send/audio", { Audio: url }];
  return ["/chat/send/document", { Document: `data:application/octet-stream;base64,${dados.toString("base64")}`, FileName: nome || "arquivo" }];
}

/** Envia para o número dos avisos e grava no histórico (Mensagens). Lança se falhar. */
async function enviar(caminho: string, corpo: Record<string, string>, texto: string, midia?: { tipo: string; dados: Buffer; mime: string }) {
  const para = await whatsappAvisos();
  const m = midia ? await guardarMidia(midia.dados, midia.mime).catch(() => null) : null;
  const registrar = (erro: string | null, waId: string | null) => db()`insert into ads.whatsapp_envios (para, texto, status, erro, direcao, tipo, midia_storage, midia_key, midia_mime, wa_id, autor)
    values (${para ?? "—"}, ${texto}, ${erro ? "FALHOU" : "ENVIADO"}, ${erro}, 'OUT', ${midia?.tipo ?? "texto"}, ${m?.storage ?? null}, ${m?.key ?? null}, ${midia?.mime ?? null}, ${waId}, 'DOMUS (automático)')`.catch(() => {});
  try {
    const d = await destino();
    const r = await wz<{ Id?: string }>("POST", caminho, { Phone: d.jid, ...corpo });
    await registrar(null, r?.Id ?? null);
  } catch (e) {
    await registrar((e as Error).message, null);
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
  enviar(...rotaMidia(tipo === "image" ? "imagem" : "video", mime, arquivo, legenda, ""), legenda, { tipo: tipo === "image" ? "imagem" : "video", dados: arquivo, mime });

/**
 * Envios das conversas saem um de cada vez, com intervalo sorteado e "digitando…" antes (proporcional ao texto):
 * número que dispara em rajada, sempre no mesmo ritmo, é o que a Meta marca como robô.
 */
let vez: Promise<unknown> = Promise.resolve();
let ultimoEnvio = 0;
const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
function naVez<T>(fn: () => Promise<T>): Promise<T> {
  const r = vez.then(async () => {
    const [min, max] = FRIO.intervalo;
    const espera = ultimoEnvio + (min + Math.random() * (max - min)) * 1000 - Date.now();
    if (espera > 0) await dormir(espera);
    try { return await fn(); } finally { ultimoEnvio = Date.now(); }
  });
  vez = r.catch(() => {});
  return r;
}
async function digitando(jid: string, texto: string) {
  await wz("POST", "/chat/presence", { Phone: jid, State: "composing" }).catch(() => {});
  await dormir(Math.min(6000, 1200 + texto.length * 35));
  await wz("POST", "/chat/presence", { Phone: jid, State: "paused" }).catch(() => {});
}

/**
 * Job WHATSAPP_ENVIAR: mensagem escrita na tela Mensagens (status PENDENTE). Manda texto ou mídia para o número da
 * conversa e marca ENVIADO (com o id do WhatsApp) ou FALHOU com o motivo.
 */
export async function enviarDaFila(id: string) {
  const sql = db();
  const [m] = await sql<{ para: string; texto: string; tipo: string; midia_storage: string | null; midia_key: string | null; midia_mime: string | null; midia_nome: string | null }[]>`
    select para, texto, tipo, midia_storage, midia_key, midia_mime, midia_nome from ads.whatsapp_envios where id = ${id} and direcao = 'OUT' and status in ('PENDENTE','FALHOU')`;
  if (!m) return { ok: false, motivo: "mensagem não está na fila" };
  try {
    if (!URL_WZ || !TOKEN) throw new Error("WhatsApp não configurado no worker");
    const jid = await jidDe(m.para);
    const mandar = async () => {
      const [rota, corpo] = m.midia_key && m.midia_storage
        ? rotaMidia(m.tipo, m.midia_mime ?? "application/octet-stream", await lerArquivo({ storage: m.midia_storage, r2_key: m.midia_key }), m.texto, m.midia_nome ?? "")
        : ["/chat/send/text", { Body: m.texto }];
      const enviada = await wz<{ Id?: string }>("POST", rota, { Phone: jid, ...corpo });
      // áudio/documento não têm legenda: o texto vai logo depois, como mensagem separada
      if (m.midia_key && m.texto && !("Caption" in corpo)) await wz("POST", "/chat/send/text", { Phone: jid, Body: m.texto });
      return enviada;
    };
    // aviso para você mesmo (lead novo etc.) sai na hora; conversa com outra pessoa espera a vez e "digita"
    const r = m.para === (await whatsappAvisos()) ? await mandar() : await naVez(async () => { await digitando(jid, m.texto); return mandar(); });
    await sql`update ads.whatsapp_envios set status = 'ENVIADO', erro = null, wa_id = ${r?.Id ?? null} where id = ${id}`;
    return { ok: true };
  } catch (e) {
    await sql`update ads.whatsapp_envios set status = 'FALHOU', erro = ${(e as Error).message.slice(0, 300)} where id = ${id}`;
    throw e;
  }
}

// ───────────── Respostas: webhook da Wuzapi → worker ─────────────

const PORTA_HOOK = Number(process.env.WORKER_HOOK_PORT || 47392);
const CAMINHO_HOOK = `/whatsapp/${createHash("sha256").update(`webhook:${TOKEN}`).digest("hex").slice(0, 32)}`;
const LIMITE_HOOK = 90_000_000; // mídia recebida vem em base64 (vídeo de até ~60 MB)

type Conteudo = { caption?: string; mimetype?: string; fileName?: string; text?: string };
type EventoMsg = {
  type?: string; jsonData?: string; base64?: string; mimeType?: string; fileName?: string;
  event?: { Info?: Record<string, unknown>; Message?: { conversation?: string; extendedTextMessage?: Conteudo; imageMessage?: Conteudo; videoMessage?: Conteudo; audioMessage?: Conteudo; documentMessage?: Conteudo; documentWithCaptionMessage?: { message?: { documentMessage?: Conteudo } }; stickerMessage?: Conteudo } };
};

/** Número de verdade de um JID; LID (@lid) não é telefone e só serve se não houver outro. */
function numeroDaConversa(cands: unknown[]): string | null {
  const jidsOk = cands.filter((x): x is string => typeof x === "string" && !!x);
  const tel = jidsOk.find((x) => x.endsWith("@s.whatsapp.net")) ?? jidsOk[0];
  return numeroDe(tel);
}

const decodificar = (b64: string) => Buffer.from(b64.replace(/^data:[^,]*,/, ""), "base64");

/**
 * Mensagem do webhook → histórico (Mensagens). Guarda tudo de conversa individual (texto e mídia), inclusive o que
 * foi mandado pelo celular; ignora grupos, status e o eco do que a própria plataforma mandou (mesmo id).
 * Devolve o texto quando é o número dos avisos falando (respostas sim/não das aprovações).
 */
async function guardarRecebida(corpo: string, tipo: string): Promise<string | null> {
  let j = JSON.parse(tipo.includes("json") ? corpo : new URLSearchParams(corpo).get("jsonData") ?? "{}") as EventoMsg;
  if (typeof j.jsonData === "string") j = JSON.parse(j.jsonData) as EventoMsg;
  const info = j.event?.Info ?? {};
  const msg = j.event?.Message ?? {};
  if (j.type !== "Message" || info.IsGroup || String(info.Chat ?? "").includes("broadcast")) return null;
  const doc = msg.documentMessage ?? msg.documentWithCaptionMessage?.message?.documentMessage;
  const conteudo = msg.imageMessage ?? msg.videoMessage ?? msg.audioMessage ?? doc ?? msg.stickerMessage;
  const texto = (msg.conversation ?? msg.extendedTextMessage?.text ?? conteudo?.caption ?? "").trim();
  if (!texto && !conteudo) return null; // reação, apagada, confirmação…
  const deMim = info.IsFromMe === true;
  const doJid = numeroDaConversa(deMim ? [info.Chat, info.ChatAlt, info.RecipientAlt] : [info.SenderAlt, info.Sender, info.Chat, info.ChatAlt]);
  if (!doJid) return null;
  const waId = typeof info.ID === "string" ? info.ID : null;
  if (deMim) await new Promise((ok) => setTimeout(ok, 4000)); // o envio pela plataforma grava o id logo depois da resposta

  const sql = db();
  if (waId && (await sql`select 1 from ads.whatsapp_envios where wa_id = ${waId}`).length) return null;
  const numero = await numeroSalvo(sql, doJid); // lead salvo com o 9 e o WhatsApp mandando sem: mesma conversa
  const mime = (j.mimeType ?? conteudo?.mimetype ?? "").split(";")[0] || null;
  const tipoMsg = msg.stickerMessage || msg.imageMessage ? "imagem" : msg.videoMessage ? "video" : msg.audioMessage ? "audio" : doc ? "documento" : "texto";
  const m = j.base64 && mime ? await guardarMidia(decodificar(j.base64), mime, j.fileName ?? doc?.fileName).catch((e: Error) => { console.log(`WhatsApp: mídia não guardada: ${e.message}`); return null; }) : null;
  const nome = typeof info.PushName === "string" && info.PushName.trim().length >= 2 ? info.PushName.trim().slice(0, 80) : formatarNumero(numero);
  // quem mandou e não está salvo vira contato com o nome do WhatsApp (dá para renomear na tela)
  if (!deMim) await sql`insert into ads.whatsapp_contatos (numero, nome, salvo, lido_em) values (${numero}, ${nome}, false, now() - interval '1 second') on conflict (numero) do nothing`;
  await sql`insert into ads.whatsapp_envios (para, texto, status, direcao, tipo, midia_storage, midia_key, midia_mime, midia_nome, wa_id, autor)
    values (${numero}, ${texto}, ${deMim ? "ENVIADO" : "RECEBIDO"}, ${deMim ? "OUT" : "IN"}, ${tipoMsg}, ${m?.storage ?? null}, ${m?.key ?? null}, ${mime}, ${doc?.fileName ?? j.fileName ?? null}, ${waId}, ${deMim ? "pelo celular" : null})
    on conflict do nothing`;

  if (deMim || !texto) return null;
  const d = await destino().catch(() => null);
  if (!d || ![d.para, numeroDe(d.jid)].some((a) => a && mesmoNumero(numero, a))) return null;
  return texto;
}

/** Aponta o webhook da Wuzapi para o worker (a cada subida e depois de conectar). Nunca lança. */
async function registrarWebhook() {
  if (!URL_WZ || !TOKEN) return;
  // sem "events" a Wuzapi zera a assinatura e descarta as mensagens ("Not subscribed")
  await wz("POST", "/webhook", { webhookURL: `http://host.docker.internal:${PORTA_HOOK}${CAMINHO_HOOK}`, events: ["Message"] })
    .catch((e: Error) => console.log(`webhook do WhatsApp não registrado: ${e.message}`));
}

/** Escuta o que chega no WhatsApp: guarda no histórico e passa as mensagens do número dos avisos para `responder`. */
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
      void guardarRecebida(Buffer.concat(partes).toString("utf8"), String(req.headers["content-type"] ?? ""))
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
