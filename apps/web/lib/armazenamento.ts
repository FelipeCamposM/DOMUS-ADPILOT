import "server-only";
import { db } from "@domus-ads/core";

export interface UsoArmazenamento { r2Bytes: number; r2Arquivos: number; driveBytes: number; driveArquivos: number }

/** Quanto o AdPilot ocupa no R2 (originais fora do Drive) e quanto está só no Drive. Plataforma inteira: o R2 é um só. */
export async function usoArmazenamento(): Promise<UsoArmazenamento> {
  const [u] = await db()<UsoArmazenamento[]>`
    select coalesce(sum(size_bytes) filter (where not arquivado), 0)::float8 as "r2Bytes", (count(*) filter (where not arquivado))::int as "r2Arquivos",
      coalesce(sum(size_bytes) filter (where arquivado), 0)::float8 as "driveBytes", (count(*) filter (where arquivado))::int as "driveArquivos"
    from ads.creatives where storage = 'r2' and status = 'READY' and r2_key is not null`;
  return u!;
}
