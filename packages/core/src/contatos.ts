import { db, type Sql } from "./db";
import { FRIO, temLink } from "./mensagens";

/**
 * Número como já está salvo nos contatos. O WhatsApp guarda alguns celulares brasileiros sem o 9
 * (553199998888 × 5531999998888): sem isso, o lead do formulário e a resposta dele viravam duas conversas.
 */
export async function numeroSalvo(sql: Sql, numero: string): Promise<string> {
  if (!numero.startsWith("55")) return numero;
  const [c] = await sql<{ numero: string }[]>`
    select numero from ads.whatsapp_contatos where left(numero, 4) = ${numero.slice(0, 4)} and right(numero, 8) = ${numero.slice(-8)}
    order by (numero = ${numero}) desc, length(numero) desc limit 1`;
  return c?.numero ?? numero;
}

/**
 * Contra ban: enquanto a pessoa nunca respondeu, a conversa é "fria". Nela: sem link, no máximo FRIO.porConversa
 * mensagens e um teto de conversas novas por hora e por dia (sem disparo em massa).
 */
export async function travasPrimeiroContato(sql: Sql, para: string, texto: string) {
  const [c] = await sql<{ ins: number; outs: number }[]>`
    select count(*) filter (where direcao = 'IN')::int as ins, count(*) filter (where direcao = 'OUT' and status <> 'FALHOU')::int as outs
    from ads.whatsapp_envios where para = ${para}`;
  if (c!.ins > 0) return;
  if (temLink(texto)) throw new Error("Sem link na primeira mensagem: é o que mais vira denúncia de spam. Mande o link depois que a pessoa responder.");
  if (c!.outs >= FRIO.porConversa) throw new Error(`Espere a pessoa responder: já foram ${c!.outs} mensagens sem resposta nesta conversa.`);
  if (c!.outs > 0) return; // conversa já começada não conta como nova
  const [n] = await sql<{ hora: number; dia: number }[]>`
    select count(distinct para) filter (where primeira > now() - interval '1 hour')::int as hora, count(distinct para)::int as dia
    from (select para, min(created_at) as primeira from ads.whatsapp_envios o where direcao = 'OUT' and autor <> 'DOMUS (automático)'
      and not exists (select 1 from ads.whatsapp_envios i where i.para = o.para and i.direcao = 'IN')
      group by para having min(created_at) > now() - interval '24 hours') x`;
  if (n!.hora >= FRIO.porHora) throw new Error(`Limite de ${FRIO.porHora} conversas novas por hora (protege o número de ban). Tente mais tarde ou espere respostas.`);
  if (n!.dia >= FRIO.porDia) throw new Error(`Limite de ${FRIO.porDia} conversas novas por dia (protege o número de ban). Amanhã libera.`);
}

export async function workerOnline() {
  const [w] = await db()<{ ok: boolean }[]>`select last_seen > now() - interval '90 seconds' as ok from ads.worker_status order by last_seen desc limit 1`;
  if (!w?.ok) throw new Error("O worker está offline: a mensagem só sai com o PC do worker ligado.");
}
