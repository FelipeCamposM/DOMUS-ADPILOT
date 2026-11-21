import { db, decrypt } from "@domus-ads/core";

/**
 * Gmail pela API (escopo gmail.modify), com o refresh token de ads.email_contas. Nada é copiado para o banco: a tela
 * lê na hora. Token recusado (invalid_grant: revogado ou os 7 dias do app em modo de teste) marca a conta EXPIRADA.
 */
export interface ContaEmail { id: string; email: string; nome: string | null; foto: string | null; status: string; erro: string | null; conectado_em: Date }
export interface Resumo { id: string; de: string; assunto: string; trecho: string; quando: string; naoLida: boolean; n: number }
export interface Mensagem { id: string; de: string; para: string; quando: string; assunto: string; html: string | null; texto: string; messageId: string | null }

export const ESCOPOS_GMAIL = "https://www.googleapis.com/auth/gmail.modify openid email profile";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class ContaExpirada extends Error {}

export function contasEmail() {
  return db()<ContaEmail[]>`select id, email, nome, foto, status, erro, conectado_em from ads.email_contas order by created_at`;
}

// access token por conta, reaproveitado enquanto vale (instância do servidor)
const tokens = new Map<string, { token: string; ate: number }>();

async function token(id: string): Promise<string> {
  const t = tokens.get(id);
  if (t && t.ate > Date.now() + 60_000) return t.token;
  const sql = db();
  const [c] = await sql<{ credentials_enc: string }[]>`select credentials_enc from ads.email_contas where id = ${id}`;
  if (!c) throw new Error("Conta de e-mail não encontrada");
  const { refreshToken } = decrypt<{ refreshToken: string }>(c.credentials_enc);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: process.env.GOOGLE_ADS_CLIENT_ID!, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET! }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) {
    if (j.error === "invalid_grant") {
      await sql`update ads.email_contas set status = 'EXPIRADA', erro = ${j.error_description ?? "Autorização expirada"}, verificado_em = now() where id = ${id}`;
      throw new ContaExpirada("A autorização desta conta expirou. Clique em Reconectar.");
    }
    throw new Error(`Google recusou o acesso (${j.error ?? r.status})`);
  }
  await sql`update ads.email_contas set status = 'ACTIVE', erro = null, verificado_em = now() where id = ${id} and (status <> 'ACTIVE' or verificado_em < now() - interval '10 minutes')`;
  tokens.set(id, { token: j.access_token, ate: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

async function api<T>(id: string, caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${caminho}`, { ...init, headers: { Authorization: `Bearer ${await token(id)}`, "Content-Type": "application/json", ...init?.headers }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!r.ok) throw new Error(`Gmail ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return (await r.json()) as T;
}

/** Confere (no máximo 1 vez por hora) se as contas ainda autorizam: alimenta o aviso de "expirou" no sino. */
export async function verificarContasEmail() {
  const sql = db();
  const velhas = await sql<{ id: string }[]>`select id from ads.email_contas where status = 'ACTIVE' and verificado_em < now() - interval '1 hour'`;
  await Promise.all(velhas.map((c) => { tokens.delete(c.id); return token(c.id).catch(() => null); }));
}

type Header = { name: string; value: string };
type Parte = { mimeType?: string; body?: { data?: string }; parts?: Parte[]; headers?: Header[] };
type MsgApi = { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: Parte };

const cab = (h: Header[] | undefined, nome: string) => h?.find((x) => x.name.toLowerCase() === nome.toLowerCase())?.value ?? "";
const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const nomeDe = (de: string) => de.replace(/\s*<[^>]+>\s*$/, "").replace(/^"|"$/g, "") || de;
const desfazer = (s: string) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function corpo(p: Parte | undefined, tipo: string): string | null {
  if (!p) return null;
  if (p.mimeType === tipo && p.body?.data) return b64(p.body.data);
  for (const q of p.parts ?? []) { const r = corpo(q, tipo); if (r) return r; }
  return null;
}

/** Conversas da caixa de entrada (ou da busca, na sintaxe do Gmail). */
export async function listarConversas(id: string, busca = ""): Promise<Resumo[]> {
  const q = new URLSearchParams({ maxResults: "30", q: busca || "in:inbox" });
  const { threads = [] } = await api<{ threads?: { id: string }[] }>(id, `/threads?${q}`);
  const meta = "format=metadata&metadataHeaders=From&metadataHeaders=Subject";
  const fios = await Promise.all(threads.map((t) => api<{ id: string; messages: MsgApi[] }>(id, `/threads/${t.id}?${meta}`).catch(() => null)));
  return fios.filter((f): f is { id: string; messages: MsgApi[] } => !!f?.messages?.length).map((f) => {
    const ultima = f.messages.at(-1)!;
    const primeira = f.messages[0]!;
    return {
      id: f.id,
      de: nomeDe(cab(ultima.payload?.headers, "From")),
      assunto: cab(primeira.payload?.headers, "Subject") || "(sem assunto)",
      trecho: desfazer(ultima.snippet ?? ""),
      quando: new Date(Number(ultima.internalDate ?? 0)).toISOString(),
      naoLida: f.messages.some((m) => m.labelIds?.includes("UNREAD")),
      n: f.messages.length,
    };
  });
}

/** Conversa inteira, já marcada como lida. */
export async function abrirConversa(id: string, threadId: string): Promise<Mensagem[]> {
  const f = await api<{ messages: MsgApi[] }>(id, `/threads/${encodeURIComponent(threadId)}?format=full`);
  if (f.messages.some((m) => m.labelIds?.includes("UNREAD")))
    await api(id, `/threads/${encodeURIComponent(threadId)}/modify`, { method: "POST", body: JSON.stringify({ removeLabelIds: ["UNREAD"] }) }).catch(() => null);
  return f.messages.map((m) => {
    const h = m.payload?.headers;
    return {
      id: m.id, de: cab(h, "From"), para: cab(h, "To"), assunto: cab(h, "Subject"), messageId: cab(h, "Message-ID") || null,
      quando: new Date(Number(m.internalDate ?? 0)).toISOString(),
      html: corpo(m.payload, "text/html"), texto: corpo(m.payload, "text/plain") ?? desfazer(m.snippet ?? ""),
    };
  });
}

const mime = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);

/** Responde na mesma conversa (o Gmail agrupa pelo threadId + In-Reply-To). */
export async function responder(id: string, threadId: string, texto: string) {
  const msgs = await abrirConversa(id, threadId);
  const [eu] = await db()<{ email: string }[]>`select email from ads.email_contas where id = ${id}`;
  const alvo = [...msgs].reverse().find((m) => !m.de.includes(eu!.email)) ?? msgs.at(-1)!;
  const para = alvo.de.includes(eu!.email) ? alvo.para : alvo.de;
  const assunto = /^re:/i.test(alvo.assunto) ? alvo.assunto : `Re: ${alvo.assunto}`;
  const refs = msgs.map((m) => m.messageId).filter(Boolean).join(" ");
  const raw = [
    `To: ${para}`, `Subject: ${mime(assunto)}`,
    ...(alvo.messageId ? [`In-Reply-To: ${alvo.messageId}`, `References: ${refs}`] : []),
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
    Buffer.from(texto, "utf8").toString("base64"),
  ].join("\r\n");
  await api(id, "/messages/send", { method: "POST", body: JSON.stringify({ threadId, raw: Buffer.from(raw).toString("base64url") }) });
}
