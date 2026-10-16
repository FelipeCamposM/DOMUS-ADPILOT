/** Datas "AAAA-MM-DD" (sem fuso): a grade usa o dia de Brasília, igual ao worker. */
export const somaDias = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Grade do mês: 6 semanas começando na segunda. */
export function gradeDoMes(mes: string): string[] {
  const ini = `${mes}-01`;
  const dow = (new Date(`${ini}T12:00:00Z`).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => somaDias(ini, i - dow));
}
