import { Cloud, Zap } from "lucide-react";
import type { UsoArmazenamento } from "@/lib/armazenamento";

const GB = 1024 ** 3;
const tam = (b: number) => (b >= GB ? `${(b / GB).toFixed(2).replace(".", ",")} GB` : `${Math.round(b / 1048576)} MB`);

/** Barra de uso do R2 contra o limite e o que já está só no Drive. */
export function UsoR2({ uso, limiteGb }: { uso: UsoArmazenamento; limiteGb: number }) {
  const pct = Math.min(1, uso.r2Bytes / (limiteGb * GB));
  return (
    <div className="uso-r2">
      <div className="uso-r2-linha">
        <span className="cluster" style={{ gap: 6 }}><Zap size={15} aria-hidden style={{ color: "rgb(var(--c-glow))" }} /><b>R2</b></span>
        <span className="tabular">{tam(uso.r2Bytes)} de {String(limiteGb).replace(".", ",")} GB</span>
        <span className="subtle small">{uso.r2Arquivos} arquivo(s) prontos para abrir na hora</span>
        <span style={{ flex: 1 }} />
        <span className="cluster" style={{ gap: 6 }}><Cloud size={15} aria-hidden style={{ color: "rgb(var(--c-info))" }} /><b>Drive</b></span>
        <span className="tabular">{tam(uso.driveBytes)}</span>
        <span className="subtle small">{uso.driveArquivos} só no Drive (o site mostra a prévia leve)</span>
      </div>
      <div className={`bar ${pct > 0.9 ? "err" : pct > 0.7 ? "warn" : ""}`}><i style={{ width: `${Math.max(1, pct * 100)}%` }} /></div>
    </div>
  );
}
