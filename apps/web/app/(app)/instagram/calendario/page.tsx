import { redirect } from "next/navigation";
import { itensCalendario, planosCalendario } from "@/lib/calendario";
import { can, requireCtx } from "@/lib/ctx";
import { contasInstagram } from "@/lib/instagram";
import { marcasDoWorkspace } from "@/lib/marcas";
import { Calendario } from "@/modules/calendario/Calendario";
import { gradeDoMes } from "@/modules/calendario/grade";

export const metadata = { title: "Calendário de conteúdo" };

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ conta?: string; mes?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const contas = await contasInstagram(ctx.workspace.id);
  if (!contas.length) redirect("/instagram");
  const conta = contas.find((c) => c.id === sp.conta) ?? contas[0]!;
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes ?? "") ? sp.mes! : new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const grade = gradeDoMes(mes);
  const [itens, planos, marcas] = await Promise.all([
    itensCalendario(ctx.workspace.id, conta.id, new Date(`${grade[0]}T00:00:00-03:00`), new Date(`${grade[41]}T23:59:59-03:00`)),
    planosCalendario(ctx.workspace.id, conta.id),
    marcasDoWorkspace(ctx.workspace.id),
  ]);
  return (
    <div className="page">
      <Calendario conta={{ id: conta.id, username: conta.username }} contas={contas.map((c) => ({ id: c.id, username: c.username }))}
        marcas={marcas.map((m) => ({ id: m.id, nome: m.nome }))} mes={mes} itens={itens} planos={planos} podeEditar={can(ctx, "editor")} />
    </div>
  );
}
