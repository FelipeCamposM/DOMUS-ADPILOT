import { Images, Zap } from "lucide-react";
import type { UsoArmazenamento } from "@/lib/armazenamento";
import { DriveIcone } from "./DriveIcone";

const GB = 1024 ** 3;
const tam = (b: number) => (b >= GB ? `${(b / GB).toFixed(2).replace(".", ",")} GB` : `${Math.round(b / 1048576)} MB`);
export type Onde = "todos" | "r2" | "drive";

/** Onde os arquivos estão: R2 (abre na hora, com limite) e Google Drive (original no PC do worker). Clicar filtra a lista. */
export function LocaisArmazenamento({ uso, limiteGb, onde, setOnde }: { uso: UsoArmazenamento; limiteGb: number; onde: Onde; setOnde: (o: Onde) => void }) {
  const pct = Math.min(1, uso.r2Bytes / (limiteGb * GB));
  return (
    <div className="locais" role="tablist" aria-label="Onde estão os arquivos">
      <button type="button" role="tab" className="local local-todos" aria-selected={onde === "todos"} onClick={() => setOnde("todos")}>
        <span className="local-cab"><span className="local-ico"><Images size={16} aria-hidden /></span><b>Todos</b></span>
        <strong className="tabular">{uso.r2Arquivos + uso.driveArquivos}</strong>
        <small>arquivos nos dois lugares</small>
      </button>
      <button type="button" role="tab" className="local local-r2" aria-selected={onde === "r2"} onClick={() => setOnde("r2")}>
        <span className="local-cab"><span className="local-ico"><Zap size={16} aria-hidden /></span><b>Cloudflare R2</b><em>abre na hora</em></span>
        <strong className="tabular">{tam(uso.r2Bytes)} <span>de {String(limiteGb).replace(".", ",")} GB</span></strong>
        <div className={`bar ${pct > 0.9 ? "err" : pct > 0.7 ? "warn" : ""}`}><i style={{ width: `${Math.max(1, pct * 100)}%` }} /></div>
        <small>{uso.r2Arquivos} arquivo(s) em uso, servidos direto</small>
      </button>
      <button type="button" role="tab" className="local local-drive" aria-selected={onde === "drive"} onClick={() => setOnde("drive")}>
        <span className="local-cab"><span className="local-ico"><DriveIcone size={17} /></span><b>Google Drive</b><em>arquivados</em></span>
        <strong className="tabular">{tam(uso.driveBytes)}</strong>
        <small>{uso.driveArquivos} arquivo(s) só no Drive do PC. Aqui aparece a prévia leve; o original volta ao abrir.</small>
      </button>
    </div>
  );
}

/** Versão compacta (Configurações): barra de uso do R2 contra o limite e o que já está só no Drive. */
export function UsoR2({ uso, limiteGb }: { uso: UsoArmazenamento; limiteGb: number }) {
  const pct = Math.min(1, uso.r2Bytes / (limiteGb * GB));
  return (
    <div className="uso-r2">
      <div className="uso-r2-linha">
        <span className="cluster" style={{ gap: 6 }}><Zap size={15} aria-hidden style={{ color: "rgb(var(--c-glow))" }} /><b>R2</b></span>
        <span className="tabular">{tam(uso.r2Bytes)} de {String(limiteGb).replace(".", ",")} GB</span>
        <span className="subtle small">{uso.r2Arquivos} arquivo(s) prontos para abrir na hora</span>
        <span style={{ flex: 1 }} />
        <span className="cluster" style={{ gap: 6 }}><DriveIcone size={15} /><b>Drive</b></span>
        <span className="tabular">{tam(uso.driveBytes)}</span>
        <span className="subtle small">{uso.driveArquivos} só no Drive (o site mostra a prévia leve)</span>
      </div>
      <div className={`bar ${pct > 0.9 ? "err" : pct > 0.7 ? "warn" : ""}`}><i style={{ width: `${Math.max(1, pct * 100)}%` }} /></div>
    </div>
  );
}
