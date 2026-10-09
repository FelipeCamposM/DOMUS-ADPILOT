import { spawnSync } from "node:child_process";
import { join } from "node:path";

const TAREFA = "DOMUS Worker";
const SCRIPT = join(import.meta.dirname, "../scripts/inicializacao.ps1");

/** A tarefa "DOMUS Worker" existe no Agendador do Windows? (só consulta) */
export async function inicializacaoAtiva(): Promise<boolean | null> {
  if (process.platform !== "win32") return null;
  return spawnSync("schtasks", ["/Query", "/TN", TAREFA], { windowsHide: true, stdio: "ignore" }).status === 0;
}

/** Liga/desliga o início com o Windows. Roda só quando o usuário pede em Configurações → Worker. */
export async function configurarInicializacao(ligar: boolean, log: (m: string) => Promise<void>) {
  if (process.platform !== "win32") throw new Error("Início automático disponível só no Windows");
  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, ...(ligar ? [] : ["-Remover"])],
    { windowsHide: true, encoding: "utf8" });
  const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (saida) await log(saida);
  if (r.status !== 0) throw new Error(saida.split("\n").at(-1) || "O Windows recusou a alteração");
  return { autostart: await inicializacaoAtiva() };
}
