import { audit, db, encrypt } from "@domus-ads/core";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCtx, requireRole } from "@/lib/ctx";
import { perfilTikTok, tokenTikTok } from "@/lib/tiktok";

const cookieSchema = z.object({ state: z.string().length(48), ws: z.string().uuid() });

/** Volta da autorização do TikTok: confere state, troca o code, lê o perfil e salva (ou atualiza a mesma conta) cifrado. */
export async function GET(req: NextRequest) {
  const fim = (q: string) => {
    const r = NextResponse.redirect(new URL(`/connections?${q}`, req.url));
    r.cookies.delete({ name: "tt_oauth", path: "/api/connections/tiktok" });
    return r;
  };
  const ctx = await requireCtx();
  requireRole(ctx, "admin");
  let bruto: unknown = null;
  try { bruto = JSON.parse(req.cookies.get("tt_oauth")?.value ?? "null"); } catch {}
  const salvo = cookieSchema.safeParse(bruto);
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code");
  if (req.nextUrl.searchParams.get("error")) return fim("erro=tiktok-negado");
  if (!salvo.success || !code || state.length !== 48 || !timingSafeEqual(Buffer.from(state), Buffer.from(salvo.data.state))) return fim("erro=tiktok-state");
  const ws = ctx.workspaces.find((w) => w.id === salvo.data.ws);
  if (!ws || !["owner", "admin"].includes(ws.role)) return fim("erro=tiktok-permissao");

  const tok = await tokenTikTok({ code, grant_type: "authorization_code", redirect_uri: new URL("/api/connections/tiktok/callback", req.url).toString() });
  if (!tok.access_token || !tok.refresh_token || !tok.open_id) return fim(`erro=tiktok-token&msg=${encodeURIComponent((tok.error_description || tok.error || "").slice(0, 200))}`);
  if (!tok.scope?.includes("video.upload")) return fim("erro=tiktok-escopo");
  const perfil = await perfilTikTok(tok.access_token);
  const label = perfil.nome ?? "TikTok";

  const sql = db();
  const cred = encrypt({ refreshToken: tok.refresh_token, openId: tok.open_id });
  const [mesma] = await sql<{ id: string }[]>`
    select id from ads.ad_connections where workspace_id = ${ws.id} and provider = 'TIKTOK' and perfil->>'openId' = ${tok.open_id} limit 1`;
  const dados = { ...perfil, openId: tok.open_id };
  const [k] = mesma
    ? await sql<{ id: string }[]>`
        update ads.ad_connections set credentials_enc = ${cred}, perfil = ${sql.json(dados)}, label = ${label}, status = 'ACTIVE', last_error = null
        where id = ${mesma.id} returning id`
    : await sql<{ id: string }[]>`
        insert into ads.ad_connections (workspace_id, provider, label, credentials_enc, created_by, perfil)
        values (${ws.id}, 'TIKTOK', ${label}, ${cred}, ${ctx.user.id}, ${sql.json(dados)}) returning id`;
  await audit(sql, { workspaceId: ws.id, actor: ctx.actor, action: mesma ? "Reconectar TikTok" : "Conectar TikTok", entityType: "connection", entityId: k!.id, entityName: label });
  return fim(`ok=tiktok&nome=${encodeURIComponent(label)}`);
}
