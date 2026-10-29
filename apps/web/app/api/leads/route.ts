import { CONSENTIMENTO, db, dominioPermitido, leadSchema } from "@domus-ads/core";
import { registrarLead } from "@/lib/leads";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Formulário dos sites → lead na caixa de Mensagens (público: sem sessão). A chave do site só identifica de onde veio;
 * a trava é o domínio de origem, o campo isca para robôs e o limite por IP. Devolve o link que abre o WhatsApp do
 * lead já com a mensagem escrita, para ele começar a conversa (conversa iniciada pelo lead quase não dá ban).
 */
const POR_IP = 5;         // envios por IP em 10 min
const POR_SITE = 100;     // leads por site em 1 h

type Site = { id: string; nome: string; dominios: string[]; mensagem_inicial: string };

function cors(origem: string | null, site?: Site | null) {
  const ok = origem && (!site || dominioPermitido(origem, site.dominios));
  return { "Access-Control-Allow-Origin": ok ? origem : "null", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", Vary: "Origin", "Cache-Control": "no-store" };
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: { ...cors(req.headers.get("origin")), "Access-Control-Max-Age": "86400" } });
}

async function corpo(req: Request): Promise<Record<string, unknown>> {
  if (req.headers.get("content-type")?.includes("json")) return ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const f = await req.formData().catch(() => null);
  return f ? Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string")) : {};
}

export async function POST(req: Request) {
  const origem = req.headers.get("origin");
  const json = !!req.headers.get("content-type")?.includes("json");
  let site: Site | null = null;
  const responder = (status: number, dados: { erro?: string; whatsapp?: string | null }) => {
    // formulário sem JavaScript: vai direto para o WhatsApp (ou volta para a página com o erro)
    if (!json && status < 300 && dados.whatsapp) return NextResponse.redirect(dados.whatsapp, 303);
    if (!json) return new Response(dados.erro ?? "Recebemos seu contato. Em breve falamos com você pelo WhatsApp.", { status, headers: { ...cors(origem, site), "content-type": "text/plain; charset=utf-8" } });
    return NextResponse.json({ ok: status < 300, ...dados }, { status, headers: cors(origem, site) });
  };

  try {
    const b = await corpo(req);
    const sql = db();
    const chave = typeof b.site === "string" && b.site.startsWith("lead_") ? b.site.slice(0, 64) : "";
    [site] = chave ? await sql<Site[]>`select id, nome, dominios, mensagem_inicial from ads.lead_sites where chave = ${chave} and ativo` : [];
    if (!site) return responder(404, { erro: "Formulário desativado ou chave errada." });
    if (!dominioPermitido(origem, site.dominios)) return responder(403, { erro: "Este site não pode enviar para este formulário." });
    if (typeof b._hp === "string" && b._hp) return responder(200, { whatsapp: null }); // robô preencheu a isca: finge que deu certo

    const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim();
    const ipHash = ip ? createHash("sha256").update(`lead:${ip}`).digest("hex").slice(0, 32) : null;
    const [lim] = await sql<{ ip: number; site: number }[]>`
      select (select count(*)::int from ads.lead_entradas where ip_hash = ${ipHash} and created_at > now() - interval '10 minutes') as ip,
             (select count(*)::int from ads.lead_entradas where site_id = ${site.id} and created_at > now() - interval '1 hour') as site`;
    if ((ipHash && lim!.ip >= POR_IP) || lim!.site >= POR_SITE) return responder(429, { erro: "Muitos envios seguidos. Espere alguns minutos e tente de novo." });

    const v = leadSchema.safeParse(b);
    if (!v.success) return responder(400, { erro: v.error.issues[0]?.message ?? "Confira os dados do formulário." });
    const l = v.data;
    const r = await registrarLead(sql, site, { ...l, consentimento: `${CONSENTIMENTO} (formulário do site ${site.nome})` },
      { ipHash, base: new URL(req.url).origin });
    return responder(r.repetido ? 200 : 201, { whatsapp: r.whatsapp });
  } catch (e) {
    console.error("[leads]", (e as Error).message);
    return responder(500, { erro: "Não deu para enviar agora. Tente de novo em instantes." });
  }
}
