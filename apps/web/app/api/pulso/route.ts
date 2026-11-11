import { db } from "@domus-ads/core";
import { NextResponse, type NextRequest } from "next/server";
import { isPlatformAdmin, requireCtx } from "@/lib/ctx";

/**
 * "Mudou alguma coisa?" barato: uma consulta pequena devolve uma impressão digital do que a tela mostra.
 * O navegador só recarrega a página (render completo, caro em CPU) quando a impressão muda.
 * Antes as telas faziam router.refresh() a cada poucos segundos, o que gastava quase toda a CPU da Vercel.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireCtx();
  const ws = ctx.workspace.id;
  const sql = db();
  const e = req.nextUrl.searchParams.get("e");
  let r: readonly unknown[];
  if (e === "mensagens") {
    r = await sql`select count(*) as n, max(created_at) as m, count(*) filter (where status = 'PENDENTE') as p, count(*) filter (where status = 'FALHOU') as f,
      (select count(*) from ads.whatsapp_contatos where lido_em is not null) as l, (select max(lido_em) from ads.whatsapp_contatos) as ml,
      (select count(*) from ads.whatsapp_ocultas) as o from ads.whatsapp_envios`;
  } else if (e === "shell") {
    const admin = isPlatformAdmin(ctx);
    r = await sql`select
      (select count(*) || max(created_at)::text from ads.ai_actions where workspace_id = ${ws} and status = 'PENDING_APPROVAL') as a,
      (select max(finished_at) from ads.jobs where workspace_id = ${ws} and status = 'FAILED' and finished_at > now() - interval '24 hours') as f,
      ${admin ? sql`(select max(lead_em) from ads.whatsapp_contatos where etapa is not null)` : sql`null`} as l,
      (select lidas_em from ads.notificacoes_lidas where user_id = ${ctx.user.id}) as li,
      (select (last_seen > now() - interval '90 seconds')::text || coalesce(info->>'whatsapp', '') || md5(coalesce(info->>'whatsappQr', '')) from ads.worker_status order by last_seen desc limit 1) as w`;
  } else if (e === "calendario") {
    r = await sql`select (select max(updated_at) from ads.calendario_itens where workspace_id = ${ws}) as i, (select max(updated_at) from ads.calendarios where workspace_id = ${ws}) as c`;
  } else if (e === "studio") {
    r = await sql`select max(updated_at) as m, count(*) as n from ads.video_projects where workspace_id = ${ws}`;
  } else if (e === "prospeccao") {
    if (!isPlatformAdmin(ctx)) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
    // não usa updated_at da campanha: o worker mexe nele a cada segundo durante a busca (o aviso tem consulta própria)
    r = await sql`select (select string_agg(id::text || status, ',' order by created_at) from ads.prosp_campanhas) as c,
      (select count(*)::text || max(updated_at)::text from ads.prosp_leads) as l,
      (select string_agg(id::text || status || coalesce(progress, 0), ',') from ads.jobs where type = 'AI_LEADS' and (status in ('PENDING', 'RUNNING') or finished_at > now() - interval '1 minute')) as j`;
  } else if (e === "financeiro") {
    if (!isPlatformAdmin(ctx)) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
    r = await sql`select (select max(ultima_sync)::text || coalesce(string_agg(coalesce(erro, ''), ''), '') from ads.fin_conexoes) as s,
      (select string_agg(id::text || status, ',') from ads.fin_analises where created_at > now() - interval '1 day') as a,
      (select count(*) from ads.jobs where type = 'FIN_SYNC' and status in ('PENDING', 'RUNNING')) as j`;
  } else {
    return NextResponse.json({ error: "Escopo inválido" }, { status: 400 });
  }
  return NextResponse.json({ v: JSON.stringify(r[0]) }, { headers: { "Cache-Control": "no-store" } });
}
