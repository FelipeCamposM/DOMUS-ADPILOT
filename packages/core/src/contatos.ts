import type { Sql } from "./db";

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
