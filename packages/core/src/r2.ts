import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 (API S3). Bucket compartilhado com o Domus: tudo desta plataforma fica sob `ads/`.
 * Banco guarda só a chave (nunca URL absoluta). Navegador recebe URL pré-assinada de curta duração.
 */
let cliente: { aws: AwsClient; base: string } | null = null;

function r2() {
  const { R2_ACCOUNT_ID: conta, R2_ACCESS_KEY_ID: chave, R2_SECRET_ACCESS_KEY: segredo, R2_BUCKET_NAME: bucket } = process.env;
  if (!conta || !chave || !segredo || !bucket) throw new Error("R2 sem configuração (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)");
  cliente ??= { aws: new AwsClient({ accessKeyId: chave, secretAccessKey: segredo, service: "s3", region: "auto" }), base: `https://${conta}.r2.cloudflarestorage.com/${bucket}` };
  return cliente;
}

const url = (key: string) => `${r2().base}/${key.split("/").map(encodeURIComponent).join("/")}`;

/** Estrutura da spec: ads/workspaces/{workspaceId}/{images|videos|audio|voices|music|sfx|thumbnails|renders}/... */
export type R2Pasta = "images" | "videos" | "audio" | "voices" | "music" | "sfx" | "thumbnails" | "renders";
export const r2Key = (workspaceId: string, pasta: R2Pasta, nome: string) => `ads/workspaces/${workspaceId}/${pasta}/${nome}`;

export async function r2Put(key: string, body: BodyInit, contentType: string, size?: number): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": contentType };
  if (size != null) headers["Content-Length"] = String(size);
  const r = await r2().aws.fetch(url(key), { method: "PUT", body, headers, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);
  if (!r.ok) throw new Error(`R2 PUT ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export async function r2Delete(key: string): Promise<void> {
  const r = await r2().aws.fetch(url(key), { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`R2 DELETE ${r.status}`);
}

export async function r2Head(key: string): Promise<{ size: number; type: string | null } | null> {
  const r = await r2().aws.fetch(url(key), { method: "HEAD" });
  return r.ok ? { size: Number(r.headers.get("content-length") ?? 0), type: r.headers.get("content-type") } : null;
}

/** URL assinada (GET para ver/baixar, PUT para upload direto do navegador). Padrão: 1 hora. */
export async function r2Presign(key: string, method: "GET" | "PUT" = "GET", segundos = 3600, download?: string): Promise<string> {
  const u = new URL(url(key));
  u.searchParams.set("X-Amz-Expires", String(segundos));
  if (download) u.searchParams.set("response-content-disposition", `attachment; filename="${download.replace(/[^\w.\- ]/g, "_")}"`);
  const assinado = await r2().aws.sign(new Request(u, { method }), { aws: { signQuery: true } });
  return assinado.url;
}
