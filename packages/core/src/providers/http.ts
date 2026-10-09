import { ProviderError } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch + JSON com retry em rate limit/5xx (backoff exponencial, respeita Retry-After).
 * `isRateLimited` deixa cada provider reconhecer o seu formato de limite (a Meta responde 400 com código 17/80004).
 */
export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  opts: { name: string; isRateLimited?: (status: number, body: unknown) => boolean; isAuthError?: (status: number, body: unknown) => boolean; retries?: number },
): Promise<T> {
  const retries = opts.retries ?? 4;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    const text = await res.text();
    let body: unknown = text;
    try { body = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
    if (res.ok) return body as T;
    const limited = res.status === 429 || res.status >= 500 || opts.isRateLimited?.(res.status, body);
    if (limited && attempt < retries) {
      const after = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : Math.min(30_000, 1000 * 2 ** attempt));
      continue;
    }
    const auth = res.status === 401 || !!opts.isAuthError?.(res.status, body);
    throw new ProviderError(`${opts.name}: ${extractMessage(body) ?? `HTTP ${res.status}`}`, auth, body);
  }
}

function extractMessage(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const e = (body as { error?: { message?: string; error_user_msg?: string } | string }).error;
    if (typeof e === "string") return e;
    if (e) return e.error_user_msg ?? e.message;
  }
  if (Array.isArray(body)) return extractMessage(body[0]);
  return typeof body === "string" && body ? body.slice(0, 300) : undefined;
}
