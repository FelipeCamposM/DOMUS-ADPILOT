import { db } from "@domus-ads/core";
import { conexoes, contas, transacoes } from "@domus-ads/core/financeiro-db";
import { geral, somarMeses } from "@domus-ads/core/financeiro";
import { Geral } from "@/modules/financeiro/Geral";
import { ABAS_GERAL, type AbaGeral } from "@/modules/financeiro/lista-abas";

export const metadata = { title: "Financeiro · Tudo junto" };

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); // AAAA-MM-DD

/** Todas as contas PF + PJ juntas: saldos, dívida dos cartões, saídas, entradas e análises (admin da plataforma já checado no layout). */
export default async function GeralPage({ searchParams }: { searchParams: Promise<{ mes?: string; aba?: string }> }) {
  const sp = await searchParams;
  const hoje = hojeSP();
  const mesHoje = `${hoje.slice(0, 7)}-01`;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") && sp.mes! >= "2000-01" && `${sp.mes}-01` <= mesHoje ? `${sp.mes}-01` : mesHoje;
  const desde = somarMeses(mes, -11);
  const sql = db();
  const [pf, pj, cts, cons] = await Promise.all([transacoes(sql, "PF", desde), transacoes(sql, "PJ", desde), contas(sql), conexoes(sql)]);
  const visiveis = cts.filter((c) => !c.oculta);
  const g = geral(visiveis.map((c) => ({ ...c, nome: c.apelido || c.banco || c.nome })), [...pf, ...pj], mes, hoje);
  const aba = ABAS_GERAL.some(([v]) => v === sp.aba) ? (sp.aba as AbaGeral) : "saldos";
  return (
    <Geral key={mes} abaInicial={aba} d={{
      mes, mesHoje, hoje, g,
      contas: visiveis.map((c) => ({ id: c.id, tipo: c.tipo, pessoa: c.pessoa, nome: c.apelido || c.banco || c.nome, detalhe: `${c.nome}${c.numero ? ` · ${c.numero}` : ""}`,
        banco: c.banco ?? "", cor: c.banco_cor, logo: c.banco_logo, saldo: c.saldo, limite: c.limite, usado: c.limite_usado,
        fecha: c.dia_fechamento, vence: c.dia_vencimento, final: c.numero?.slice(-4) ?? null, bandeira: c.bandeira })),
      ultimaSync: cons.map((c) => c.ultima_sync).filter(Boolean).sort().at(-1) ?? null,
    }} />
  );
}
