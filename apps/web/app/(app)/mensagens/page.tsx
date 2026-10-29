import { redirect } from "next/navigation";

/** Endereço antigo (avisos de lead já enviados apontam para cá): a caixa agora mora no CRM. */
export default async function MensagensAntigo({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  redirect(c ? `/crm?c=${encodeURIComponent(c)}` : "/crm");
}
