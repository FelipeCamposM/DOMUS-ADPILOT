import { audit, db, encrypt, enqueueJob, GoogleAdsProvider } from "@domus-ads/core";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCtx, requireRole } from "@/lib/ctx";

const cookieSchema = z.object({ state: z.string().length(48), ws: z.string().uuid(), label: z.string().max(80) });

/** Volta do consentimento: confere state, troca o code por refresh token, valida listando contas e salva cifrado. */
export async function GET(req: NextRequest) {
  const fim = (q: string) => {
    const r = NextResponse.redirect(new URL(`/connections?${q}`, req.url));
    r.cookies.delete({ name: "g_oauth", path: "/api/connections/google" });
    return r;
  };
  const ctx = await requireCtx();
  requireRole(ctx, "admin");
  let bruto: unknown = null;
  try { bruto = JSON.parse(req.cookies.get("g_oauth")?.value ?? "null"); } catch {}
  const salvo = cookieSchema.safeParse(bruto);
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code");
  if (!salvo.success || !code || state.length !== 48 || !timingSafeEqual(Buffer.from(state), Buffer.from(salvo.data.state))) return fim("erro=google-state");
  // o workspace vem do cookie que nós gravamos, e ainda precisa ser um em que o usuário é admin
  const ws = ctx.workspaces.find((w) => w.id === salvo.data.ws);
  if (!ws || !["owner", "admin"].includes(ws.role)) return fim("erro=google-permissao");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, grant_type: "authorization_code",
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      redirect_uri: new URL("/api/connections/google/callback", req.url).toString(),
    }),
  });
  const tok = (await r.json()) as { refresh_token?: string };
  if (!r.ok || !tok.refresh_token) return fim("erro=google-token");

  let contas = 0;
  try {
    contas = (await new GoogleAdsProvider({ refreshToken: tok.refresh_token }).listAccounts()).length;
  } catch (e) {
    return fim(`erro=google-api&msg=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
  }
  const sql = db();
  const [k] = await sql<{ id: string }[]>`
    insert into ads.ad_connections (workspace_id, provider, label, credentials_enc, created_by)
    values (${ws.id}, 'GOOGLE', ${salvo.data.label}, ${encrypt({ refreshToken: tok.refresh_token })}, ${ctx.user.id}) returning id`;
  await audit(sql, { workspaceId: ws.id, actor: ctx.actor, action: "Conectar Google Ads", entityType: "connection", entityId: k!.id, entityName: salvo.data.label, after: { contas } });
  await enqueueJob(sql, { workspaceId: ws.id, type: "SYNC_GOOGLE", payload: { connectionId: k!.id }, createdBy: ctx.user.id });
  return fim(`ok=google&contas=${contas}`);
}
