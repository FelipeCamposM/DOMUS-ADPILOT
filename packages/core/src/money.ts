/**
 * Dinheiro como string decimal ("130.00"), nunca float. Meta usa unidades mínimas da moeda (centavos);
 * Google usa micros (1 real = 1.000.000).
 */
function fromUnits(valor: string | number | bigint, casas: number): string {
  const n = BigInt(valor);
  const neg = n < 0n;
  const s = (neg ? -n : n).toString().padStart(casas + 1, "0");
  return `${neg ? "-" : ""}${s.slice(0, -casas)}.${s.slice(-casas).slice(0, 2).padEnd(2, "0")}`;
}

/** Normaliza entrada do usuário/IA ("130", "130,5", "130.50") para "130.50". Lança se inválida. */
export function toDecimal(valor: string): string {
  const v = valor.trim().replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(v)) throw new Error(`Valor inválido: ${valor}`);
  const [i, f = ""] = v.split(".");
  return `${BigInt(i!).toString()}.${f.padEnd(2, "0")}`;
}

const toUnits = (decimal: string, casas: number) => BigInt(toDecimal(decimal).replace(".", "")) * 10n ** BigInt(casas - 2);

export const fromMinor = (v: string | number) => fromUnits(v, 2);
export const toMinor = (v: string) => toUnits(v, 2);
export const fromMicros = (v: string | number) => fromUnits(v, 6);
export const toMicros = (v: string) => toUnits(v, 6);
