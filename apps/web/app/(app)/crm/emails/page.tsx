import { abrirConversa, ContaExpirada, contasEmail, listarConversas, type Mensagem, type Resumo } from "@/lib/gmail";
import { Emails } from "@/modules/emails/Emails";

export const metadata = { title: "CRM · E-mails" };


export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ conta?: string; t?: string; q?: string }> }) {
  // admin da plataforma já checado no layout do CRM
  const sp = await searchParams;
  const contas = await contasEmail();
  const conta = contas.find((c) => c.id === sp.conta) ?? contas.find((c) => c.status === "ACTIVE") ?? contas[0] ?? null;
  const q = (sp.q ?? "").slice(0, 200);
  let conversas: Resumo[] = [], aberta: Mensagem[] | null = null, falha: string | null = null;
  if (conta && conta.status === "ACTIVE") {
    try {
      [conversas, aberta] = await Promise.all([
        listarConversas(conta.id, q),
        sp.t && /^[0-9a-f]{6,32}$/i.test(sp.t) ? abrirConversa(conta.id, sp.t) : null,
      ]);
    } catch (e) {
      falha = e instanceof ContaExpirada ? null : (e as Error).message;
      if (e instanceof ContaExpirada) conta.status = "EXPIRADA";
    }
  }
  return (
    <Emails
      contas={contas.map((c) => ({ id: c.id, email: c.email, nome: c.nome, foto: c.foto, status: c.status }))}
      conta={conta?.id ?? null} q={q} conversas={conversas} thread={sp.t ?? null} aberta={aberta} falha={falha} />
  );
}
