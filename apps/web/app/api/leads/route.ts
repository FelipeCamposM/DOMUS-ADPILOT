import { CONSENTIMENTO, db, dominioPermitido, enqueueJob, formatarNumero, leadSchema, linkWhatsapp, numeroSalvo, preencherModelo, whatsappAvisos } from "@domus-ads/core";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Formulário dos sites → lead na caixa de Mensagens (público: sem sessão). A chave do site só identifica de onde veio;
 * a trava é o domínio de origem, o campo isca para robôs e o limite por IP. Devolve o link que abre o WhatsApp do
 * lead já com a mensagem escrita, para ele começar a conversa (conversa iniciada pelo lead quase não dá ban).
 */
const POR_IP = 5;         // envios por IP em 10 min
const POR_SITE = 100;     // leads por site em 1 h
const REPETIDO_MIN = 10;  // mesmo número no mesmo site: não avisa de novo

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
    const chave = typeof b.site === "string" ? b.site.slice(0, 64) : "";
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
    const numero = await numeroSalvo(sql, l.numero);
    const s = site;
    // só o que veio preenchido (o merge no banco mantém o resto do envio anterior)
    const dados = { ...(l.mensagem && { mensagem: l.mensagem }), ...(l.pagina && { pagina: l.pagina }), ...(Object.keys(l.utm).length && { utm: l.utm }) };

    const repetido = await sql.begin(async (tx) => {
      const [r] = await tx<{ n: number }[]>`select count(*)::int as n from ads.lead_entradas where site_id = ${s.id} and numero = ${numero} and created_at > now() - make_interval(mins => ${REPETIDO_MIN})`;
      await tx`insert into ads.lead_entradas (site_id, numero, ip_hash) values (${s.id}, ${numero}, ${ipHash})`;
      await tx`update ads.lead_sites set ultimo_lead = now() where id = ${s.id}`;
      // contato vira lead (o nome que o usuário já salvou na mão fica); fechou/perdeu e voltou = lead novo de novo
      await tx`insert into ads.whatsapp_contatos (numero, nome, salvo, lido_em, etapa, lead_site, lead_em, lead_dados, consentimento_em, consentimento_texto)
        values (${numero}, ${l.nome}, true, now() - interval '1 second', 'NOVO', ${s.id}, now(), ${tx.json(dados)}, now(), ${`${CONSENTIMENTO} (formulário do site ${s.nome})`})
        on conflict (numero) do update set
          nome = case when ads.whatsapp_contatos.salvo then ads.whatsapp_contatos.nome else excluded.nome end, salvo = true,
          etapa = case when ads.whatsapp_contatos.etapa is null or ads.whatsapp_contatos.etapa in ('GANHO', 'PERDIDO') then 'NOVO' else ads.whatsapp_contatos.etapa end,
          lead_site = excluded.lead_site, lead_em = now(), lead_dados = coalesce(ads.whatsapp_contatos.lead_dados, '{}'::jsonb) || excluded.lead_dados, -- reenvio sem mensagem não apaga a anterior
          consentimento_em = now(), consentimento_texto = excluded.consentimento_texto, updated_at = now()`;
      if (r!.n) return true;
      // registro na conversa (nota interna: nunca vai para o WhatsApp)
      const linhas = [`Lead do site ${s.nome}`, l.mensagem && `“${l.mensagem}”`, l.pagina && `Página: ${l.pagina}`,
        Object.keys(l.utm).length && `Anúncio: ${Object.entries(l.utm).map(([k, x]) => `${k}=${x}`).join(" · ")}`];
      await tx`insert into ads.whatsapp_envios (para, texto, status, direcao, autor) values (${numero}, ${linhas.filter(Boolean).join("\n")}, 'NOTA', 'NOTA', 'formulário do site')`;
      return false;
    });

    // aviso no seu WhatsApp (número dos avisos), pela fila do worker
    const avisos = await whatsappAvisos();
    if (!repetido && avisos) {
      const texto = [`🔔 *Lead novo* do site ${s.nome}`, `${l.nome} · ${formatarNumero(numero)}`, l.mensagem && `“${l.mensagem.slice(0, 300)}”`,
        `Responder: ${new URL(req.url).origin}/mensagens?c=${numero}`].filter(Boolean).join("\n");
      const [m] = await sql<{ id: string }[]>`insert into ads.whatsapp_envios (para, texto, status, direcao, autor) values (${avisos}, ${texto}, 'PENDENTE', 'OUT', 'DOMUS (automático)') returning id`;
      await enqueueJob(sql, { workspaceId: null, type: "WHATSAPP_ENVIAR", payload: { id: m!.id }, maxAttempts: 1 });
    }

    // número da plataforma (o conectado no worker) para o lead começar a conversa
    const [w] = await sql<{ numero: string | null }[]>`select info->'whatsapp'->>'numero' as numero from ads.worker_status where info->'whatsapp'->>'numero' is not null order by last_seen desc limit 1`;
    const texto = preencherModelo(s.mensagem_inicial, { nome: l.nome, numero, site: s.nome });
    return responder(repetido ? 200 : 201, { whatsapp: w?.numero ? linkWhatsapp(w.numero, texto) : null });
  } catch (e) {
    console.error("[leads]", (e as Error).message);
    return responder(500, { erro: "Não deu para enviar agora. Tente de novo em instantes." });
  }
}
