import { redirect } from "next/navigation";

/** Endereço antigo do calendário: agora é a aba Conteúdos. */
export default async function CalendarioAntigo({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  redirect(`/conteudos?${new URLSearchParams(await searchParams)}`);
}
