/** Abas do Financeiro. Fora do "use client": a página (servidor) também valida ?aba= com esta lista. */
export const ABAS = [["geral", "Visão geral"], ["gastos", "Gastos"], ["rendas", "Rendas"], ["cartoes", "Cartões e contas"], ["assinaturas", "Assinaturas"], ["parcelados", "Parcelados"], ["analises", "Análises"]] as const;
export type Aba = (typeof ABAS)[number][0];

/** Abas da visão geral (tudo junto). */
export const ABAS_GERAL = [["saldos", "Saldos"], ["cartoes", "Cartões"], ["saidas", "Saídas"], ["entradas", "Entradas"], ["analises", "Análises"]] as const;
export type AbaGeral = (typeof ABAS_GERAL)[number][0];
