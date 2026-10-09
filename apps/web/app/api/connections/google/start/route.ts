import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireCtx, requireRole } from "@/lib/ctx";

/** Início do OAuth do Google Ads: guarda state + workspace num cookie httpOnly e manda para o consentimento. */
export async function GET(req: NextRequest) {
  const ctx = await requireCtx();
  requireRole(ctx, "admin");
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_ADS_CLIENT_SECRET || !process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    return NextResponse.redirect(new URL("/connections?erro=google-env", req.url));
  }
  const label = (req.nextUrl.searchParams.get("label") ?? "Google Ads").slice(0, 80);
  const state = randomBytes(24).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: new URL("/api/connections/google/callback", req.url).toString(),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    prompt: "consent", // garante refresh_token mesmo se já autorizado antes
    state,
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("g_oauth", JSON.stringify({ state, ws: ctx.workspace.id, label }), { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", maxAge: 600, path: "/api/connections/google" });
  return res;
}
