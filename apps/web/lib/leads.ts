import "server-only";
import { enqueueJob, formatarNumero, linkWhatsapp, numeroSalvo, preencherModelo, whatsappAvisos, type db } from "@domus-ads/core";

export type SiteDoLead = { id: string; nome: string; mensagem_inicial: string };
export interface NovoLead {
  nome: string; numero: string; mensagem?: string | null; pagina?: string | null; utm?: Record<string, string>;
  email?: string | null; origem?: string | null; consentimento: string;
}

const REPETIDO_MIN = 10; // mesmo número no mesmo site: não avisa de novo

/**
 * Lead entra no CRM: contato na etapa Novo (o nome salvo à mão fica), nota interna na conversa e aviso no seu WhatsApp.
 * Usado pelo formulário dos sites (/api/leads) e pelos sistemas conectados (/api/externo/v1/leads).
 * Devolve o link do WhatsApp da plataforma para o lead começar a conversa (null se o worker não tem número).
 */
export async function registrarLead(sql: ReturnType<typeof db>, s: SiteDoLead, l: NovoLead, o: { ipHash: string | null; base: string }) {
  const numero = await numeroSalvo(sql, l.numero);
  const utm = l.utm ?? {};
  // só o que veio preenchido (o merge no banco mantém o resto do envio anterior)
  const dados = { ...(l.mensagem && { mensagem: l.mensagem }), ...(l.pagina && { pagina: l.pagina }), ...(Object.keys(utm).length && { utm }),
    ...(l.email && { email: l.email }), ...(l.origem && { origem: l.origem }) };

  const repetido = await sql.begin(async (tx) => {
    const [r] = await tx<{ n: number }[]>`select count(*)::int as n from ads.lead_entradas where site_id = ${s.id} and numero = ${numero} and created_at > now() - make_interval(mins => ${REPETIDO_MIN})`;
    await tx`insert into ads.lead_entradas (site_id, numero, ip_hash) values (${s.id}, ${numero}, ${o.ipHash})`;
    await tx`update ads.lead_sites set ultimo_lead = now() where id = ${s.id}`;
    // fechou/perdeu e voltou = lead novo de novo
    await tx`insert into ads.whatsapp_contatos (numero, nome, salvo, lido_em, etapa, lead_site, lead_em, lead_dados, consentimento_em, consentimento_texto)
      values (${numero}, ${l.nome}, true, now() - interval '1 second', 'NOVO', ${s.id}, now(), ${tx.json(dados)}, now(), ${l.consentimento})
      on conflict (numero) do update set
        nome = case when ads.whatsapp_contatos.salvo then ads.whatsapp_contatos.nome else excluded.nome end, salvo = true,
        etapa = case when ads.whatsapp_contatos.etapa is null or ads.whatsapp_contatos.etapa in ('GANHO', 'PERDIDO') then 'NOVO' else ads.whatsapp_contatos.etapa end,
        lead_site = excluded.lead_site, lead_em = now(), lead_dados = coalesce(ads.whatsapp_contatos.lead_dados, '{}'::jsonb) || excluded.lead_dados,
        consentimento_em = now(), consentimento_texto = excluded.consentimento_texto, updated_at = now()`;
    if (r!.n) return true;
    // registro na conversa (nota interna: nunca vai para o WhatsApp)
    const linhas = [`Lead ${l.origem ? `· ${l.origem} · ` : "do site "}${s.nome}`, l.mensagem && `“${l.mensagem}”`, l.email && `E-mail: ${l.email}`, l.pagina && `Página: ${l.pagina}`,
      Object.keys(utm).length && `Anúncio: ${Object.entries(utm).map(([k, x]) => `${k}=${x}`).join(" · ")}`];
    await tx`insert into ads.whatsapp_envios (para, texto, status, direcao, autor) values (${numero}, ${linhas.filter(Boolean).join("\n")}, 'NOTA', 'NOTA', ${l.origem ? s.nome : "formulário do site"})`;
    return false;
  });

  // aviso no seu WhatsApp (número dos avisos), pela fila do worker
  const avisos = await whatsappAvisos();
  if (!repetido && avisos) {
    const texto = [`🔔 *Lead novo* · ${l.origem ?? `site ${s.nome}`}${l.origem ? ` (${s.nome})` : ""}`, `${l.nome} · ${formatarNumero(numero)}`, l.mensagem && `“${l.mensagem.slice(0, 300)}”`,
      `Responder: ${o.base}/crm?c=${numero}`].filter(Boolean).join("\n");
    const [m] = await sql<{ id: string }[]>`insert into ads.whatsapp_envios (para, texto, status, direcao, autor) values (${avisos}, ${texto}, 'PENDENTE', 'OUT', 'DOMUS (automático)') returning id`;
    await enqueueJob(sql, { workspaceId: null, type: "WHATSAPP_ENVIAR", payload: { id: m!.id }, maxAttempts: 1 });
  }

  // número da plataforma (o conectado no worker) para o lead começar a conversa
  const [w] = await sql<{ numero: string | null }[]>`select info->'whatsapp'->>'numero' as numero from ads.worker_status where info->'whatsapp'->>'numero' is not null order by last_seen desc limit 1`;
  const texto = preencherModelo(s.mensagem_inicial, { nome: l.nome, numero, site: s.nome });
  return { repetido, numero, whatsapp: w?.numero ? linkWhatsapp(w.numero, texto) : null };
}
