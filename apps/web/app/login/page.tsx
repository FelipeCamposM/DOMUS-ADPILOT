import { db, plataformaVazia } from "@domus-ads/core";
import type { Metadata } from "next";
import { LoginForm } from "@/modules/shell/LoginForm";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  let vazia = false;
  try { vazia = await plataformaVazia(db()); } catch { /* banco sem schema ainda: o worker aplica ao iniciar */ }
  return (
    <LoginForm
      primeiroAcesso={vazia}
      aviso={erro === "sem-workspace" ? "Sua conta ainda não participa de nenhum workspace. Peça acesso a um administrador." : null}
    />
  );
}
