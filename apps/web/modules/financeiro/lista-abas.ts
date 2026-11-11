/** Abas do Financeiro. Fora do "use client": a página (servidor) também valida ?aba= com esta lista. */
export const ABAS = [["geral", "Visão geral"], ["gastos", "Gastos"], ["rendas", "Rendas"], ["cartoes", "Cartões e contas"], ["assinaturas", "Assinaturas"], ["parcelados", "Parcelados"], ["analises", "Análises"]] as const;
export type Aba = (typeof ABAS)[number][0];
