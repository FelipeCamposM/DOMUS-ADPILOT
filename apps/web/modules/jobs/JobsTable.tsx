"use client";

import { ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, useTransition } from "react";
import { ago, dateTime } from "@/lib/format";
import { toast } from "../shell/toast";
import { cancelarJob, logsDoJob } from "./actions";

export interface JobLinha {
  id: string; type: string; status: string; progress: number; error: string | null; attempts: number;
  created_at: string; started_at: string | null; finished_at: string | null; payload: Record<string, unknown>;
}

const TIPO: Record<string, string> = { SYNC_META: "Sincronizar Meta", SYNC_GOOGLE: "Sincronizar Google", AI_CHAT: "Resposta da IA", GENERATE_VIDEO: "Gerar vídeo", AI_LOGIN: "Login de conta de IA", AI_DETECT: "Procurar contas de IA", WORKER_STARTUP: "Início com o Windows", AI_USAGE: "Ler uso das contas de IA", WHATSAPP: "Conexão do WhatsApp" };
const STATUS: Record<string, [string, string]> = {
  PENDING: ["Na fila", "badge-info"], RUNNING: ["Rodando", "badge-brand"], COMPLETED: ["Concluído", ""], FAILED: ["Falhou", "badge-error"], CANCELLED: ["Cancelado", ""],
};

export function JobsTable({ jobs, podeEditar }: { jobs: JobLinha[]; podeEditar: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ id: number; level: string; message: string; created_at: Date }[]>([]);
  const [, start] = useTransition();
  const ativo = jobs.some((j) => j.status === "PENDING" || j.status === "RUNNING");

  // Com job na fila/rodando, a página se atualiza sozinha (progresso ao vivo).
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [ativo, router]);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    const carregar = async () => { const r = await logsDoJob(aberto); if (vivo && r.ok) setLogs(r.data); };
    void carregar();
    const t = setInterval(carregar, 2000);
    return () => { vivo = false; clearInterval(t); };
  }, [aberto]);

  if (!jobs.length) return <div className="panel"><div className="empty">Nenhum job ainda. Sincronizações e respostas da IA aparecem aqui.</div></div>;

  return (
    <div className="panel" data-enter>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th aria-label="Detalhes" /><th>Tipo</th><th>Status</th><th style={{ width: 200 }}>Progresso</th><th>Criado</th><th>Duração</th><th>Erro</th><th aria-label="Ações" /></tr></thead>
          <tbody>
            {jobs.map((j) => {
              const [rot, cls] = STATUS[j.status] ?? [j.status, ""];
              const dur = j.started_at ? ((j.finished_at ? new Date(j.finished_at) : new Date()).getTime() - new Date(j.started_at).getTime()) / 1000 : null;
              return (
                <Fragment key={j.id}>
                  <tr onClick={() => { setLogs([]); setAberto(aberto === j.id ? null : j.id); }} style={{ cursor: "pointer" }}>
                    <td><ChevronRight size={14} aria-hidden style={{ transform: aberto === j.id ? "rotate(90deg)" : "none", transition: "transform 200ms" }} /></td>
                    <td>{TIPO[j.type] ?? j.type}{j.payload.auto ? <span className="subtle"> · automático</span> : null}</td>
                    <td><span className={`badge ${cls}`}>{j.status === "RUNNING" && <span className="dot on" aria-hidden />}{rot}</span></td>
                    <td>
                      {j.status === "RUNNING" || j.status === "COMPLETED" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="bar" style={{ flex: 1 }}><i style={{ width: `${j.progress}%` }} /></div>
                          <span className="tabular subtle" style={{ fontSize: 11.5, width: 34 }}>{j.progress}%</span>
                        </div>
                      ) : <span className="subtle">—</span>}
                    </td>
                    <td title={dateTime(j.created_at)} suppressHydrationWarning>{ago(j.created_at)}</td>
                    <td className="tabular">{dur == null ? "—" : dur < 60 ? `${dur.toFixed(1)} s` : `${(dur / 60).toFixed(1)} min`}</td>
                    <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }} className="error-text" title={j.error ?? ""}>{j.error ?? ""}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {podeEditar && (j.status === "PENDING" || j.status === "RUNNING") && (
                        <button className="btn btn-ghost btn-xs" onClick={() => start(async () => { const r = await cancelarJob(j.id); if (r.ok) toast.ok("Job cancelado"); else toast.err(r.error); router.refresh(); })}>
                          <X aria-hidden /> Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                  {aberto === j.id && (
                    <tr>
                      <td colSpan={8} style={{ background: "rgb(var(--c-bg-inset))", whiteSpace: "normal" }}>
                        <div className="mono" style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                          {logs.length === 0 && <span className="subtle">Sem registros ainda.</span>}
                          {logs.map((l) => (
                            <span key={l.id} style={{ color: l.level === "error" ? "rgb(var(--c-error))" : undefined }}>
                              <span className="subtle">{new Date(l.created_at).toLocaleTimeString("pt-BR")}</span>  {l.message}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
