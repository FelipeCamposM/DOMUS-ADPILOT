import { db, encrypt } from "@domus-ads/core";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";

/** Volta do consentimento: confere state, troca o code e salva (ou atualiza, se for a mesma conta) cifrado. */
export async function GET(req: NextRequest) {
  const fim = (q: string) => {
    const r = NextResponse.redirect(new URL(`/crm/emails?${q}`, req.url));
    r.cookies.delete({ name: "gm_oauth", path: "/api/connections/gmail" });
    return r;
  };
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) return fim("erro=permissao");
  const salvo = req.cookies.get("gm_oauth")?.value ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code");
  if (!code || state.length !== 48 || salvo.length !== 48 || !timingSafeEqual(Buffer.from(state), Buffer.from(salvo))) return fim("erro=state");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, grant_type: "authorization_code",
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      redirect_uri: new URL("/api/connections/gmail/callback", req.url).toString(),
    }),
  });
  const tok = (await r.json()) as { refresh_token?: string; access_token?: string; scope?: string };
  if (!r.ok || !tok.refresh_token) return fim("erro=token");
  if (!tok.scope?.includes("gmail.modify")) return fim("erro=escopo"); // a pessoa desmarcou o acesso ao Gmail na tela do Google
  const u = (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } })
    .then((x) => (x.ok ? x.json() : {}), () => ({}))) as { name?: string; email?: string; picture?: string };
  if (!u.email) return fim("erro=perfil");

  await db()`
    insert into ads.email_contas (email, nome, foto, credentials_enc, created_by)
    values (${u.email.toLowerCase()}, ${u.name ?? null}, ${u.picture?.startsWith("https://") ? u.picture : null}, ${encrypt({ refreshToken: tok.refresh_token })}, ${ctx.user.id})
    on conflict (email) do update set nome = excluded.nome, foto = excluded.foto, credentials_enc = excluded.credentials_enc,
      status = 'ACTIVE', erro = null, conectado_em = now(), verificado_em = now()`;
  return fim(`ok=${encodeURIComponent(u.email)}`);
}
