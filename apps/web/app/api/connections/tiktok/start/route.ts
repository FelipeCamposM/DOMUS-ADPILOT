import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireCtx, requireRole } from "@/lib/ctx";
import { ESCOPOS_TIKTOK, tiktokConfigurado } from "@/lib/tiktok";

/** Início do Login Kit do TikTok: state + workspace num cookie httpOnly e manda para a autorização. */
export async function GET(req: NextRequest) {
  const ctx = await requireCtx();
  requireRole(ctx, "admin");
  if (!tiktokConfigurado()) return NextResponse.redirect(new URL("/connections?erro=tiktok-env", req.url));
  const state = randomBytes(24).toString("hex");
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.search = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    scope: ESCOPOS_TIKTOK,
    response_type: "code",
    redirect_uri: new URL("/api/connections/tiktok/callback", req.url).toString(),
    state,
    disable_auto_auth: "1", // sempre mostra a tela de permissões (troca de conta, revisão do TikTok)
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("tt_oauth", JSON.stringify({ state, ws: ctx.workspace.id }), { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", maxAge: 600, path: "/api/connections/tiktok" });
  return res;
}
