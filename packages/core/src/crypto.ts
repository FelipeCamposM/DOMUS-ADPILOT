import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Credenciais dos providers cifradas com AES-256-GCM. Chave: TOKEN_ENCRYPTION_KEY (64 hex), só no servidor/worker. */
function key(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) throw new Error("TOKEN_ENCRYPTION_KEY ausente ou inválida (64 caracteres hex)");
  return Buffer.from(hex, "hex");
}

export function encrypt(data: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(data), "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}

export function decrypt<T>(text: string): T {
  const [v, iv, tag, body] = text.split(":");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("Credencial em formato desconhecido");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8")) as T;
}
