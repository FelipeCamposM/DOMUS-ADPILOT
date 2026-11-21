import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";
import { ESCOPOS_GMAIL } from "@/lib/gmail";

/** Conectar (ou reconectar) um Gmail: state num cookie httpOnly e consentimento do Google com acesso offline. */
export async function GET(req: NextRequest) {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) return NextResponse.redirect(new URL("/connections?erro=gmail-permissao", req.url));
  if (!process.env.GOOGLE_ADS_CLIENT_ID || !process.env.GOOGLE_ADS_CLIENT_SECRET) return NextResponse.redirect(new URL("/connections?erro=gmail-env", req.url));
  const state = randomBytes(24).toString("hex");
  const dica = req.nextUrl.searchParams.get("email");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    redirect_uri: new URL("/api/connections/gmail/callback", req.url).toString(),
    response_type: "code",
    scope: ESCOPOS_GMAIL,
    access_type: "offline",
    prompt: "consent select_account", // sempre devolve refresh_token e deixa escolher outra conta
    state,
    ...(dica && /^[^\s@]+@[^\s@]+$/.test(dica) ? { login_hint: dica } : {}),
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("gm_oauth", state, { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", maxAge: 600, path: "/api/connections/gmail" });
  return res;
}
