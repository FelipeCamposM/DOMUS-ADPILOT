import { abrirConversa, ContaExpirada, contasEmail, listarConversas, type Mensagem, type Resumo } from "@/lib/gmail";
import { Emails } from "@/modules/emails/Emails";

export const metadata = { title: "CRM · E-mails" };

const ERROS: Record<string, string> = {
  permissao: "Só o administrador da plataforma conecta e-mails.",
  env: "Faltam GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET no servidor.",
  state: "A conexão demorou ou veio de outra aba. Tente de novo.",
  token: "O Google não devolveu a autorização. Tente de novo.",
  escopo: "Na tela do Google, deixe marcado o acesso ao Gmail.",
  perfil: "Não consegui ler o e-mail da conta Google.",
};

export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ conta?: string; t?: string; q?: string; erro?: string; ok?: string }> }) {
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
      conta={conta?.id ?? null} q={q} conversas={conversas} thread={sp.t ?? null} aberta={aberta} falha={falha}
      aviso={sp.erro ? ERROS[sp.erro] ?? "Não deu para conectar." : null} conectada={sp.ok ?? null} />
  );
}
