"use client";

import { Ban, CheckCircle2, CircleDashed, Clock, Cpu, Hourglass, Timer, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ago, dateTime } from "@/lib/format";
import { atividadeWorker, cancelarJob, type JobAtividade } from "../jobs/actions";
import { TIPO } from "../jobs/JobsTable";
import { Dialog } from "./Dialog";
import { toast } from "./toast";

const ATIVO = new Set(["RUNNING", "PENDING"]);

/** "8 s", "3 min 05 s", "1 h 12 min" */
export function duracao(s: number): string {
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`;
}

/** Quanto falta: pelo % (ritmo até agora) ou, sem %, pela média das últimas execuções do mesmo tipo. */
export function estimativa(progress: number, decorrido: number, media: number | null): { falta: number | null; base: "ritmo" | "media" | null } {
  if (progress >= 3 && progress < 100) return { falta: (decorrido * (100 - progress)) / progress, base: "ritmo" };
  if (media != null && media > 0) return { falta: Math.max(media - decorrido, 0), base: "media" };
  return { falta: null, base: null };
}

export function WorkerStatus({ online, lastSeen, podeEditar }: { online: boolean; lastSeen: string | null; podeEditar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [jobs, setJobs] = useState<JobAtividade[] | null>(null);
  const [buscadoEm, setBuscadoEm] = useState(0);
  const [agora, setAgora] = useState(0);
  const [, start] = useTransition();
  const ativos = jobs?.filter((j) => ATIVO.has(j.status)) ?? [];
  const rodando = ativos.filter((j) => j.status === "RUNNING");
  const temAtivo = ativos.length > 0;

  // atividade: rápido com job rodando ou modal aberto, devagar parado; aba escondida não consulta
  const carregar = useRef(async () => {
    if (document.hidden) return;
    const r = await atividadeWorker();
    if (r.ok) { setJobs(r.data); setBuscadoEm(Date.now()); }
  });
  useEffect(() => {
    void carregar.current();
    const t = setInterval(() => void carregar.current(), aberto ? 2000 : temAtivo ? 4000 : 20_000);
    return () => clearInterval(t);
  }, [aberto, temAtivo]);

  // relógio de 1 s para decorrido/falta andarem entre uma consulta e outra
  useEffect(() => {
    if (!aberto && !rodando.length) return;
    setAgora(Date.now());
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [aberto, rodando.length]);

  const extra = buscadoEm && agora > buscadoEm ? (agora - buscadoEm) / 1000 : 0;
  const decorrido = (j: JobAtividade) => (j.decorrido ?? 0) + (j.status === "RUNNING" ? extra : 0);
  const principal = rodando[0];

  const titulo = !online ? (lastSeen ? `Offline · último sinal ${ago(lastSeen)}` : "O worker nunca se conectou")
    : principal ? `${TIPO[principal.type] ?? principal.type} · ${principal.progress}%` : "Online e esperando trabalho";

  return (
    <>
      <button className="chip tb-worker" data-estado={!online ? "off" : principal ? "rodando" : "on"} onClick={() => setAberto(true)} title={titulo} suppressHydrationWarning>
        {principal ? <Anel pct={principal.progress} /> : <span className={`dot ${online ? "on" : "err"}`} aria-hidden />}
        <span className="tb-rot">
          {!online ? "Worker offline" : principal ? <>{TIPO[principal.type] ?? principal.type} <b className="tabular">{principal.progress}%</b></> : "Worker online"}
        </span>
        {ativos.length > 1 && <span className="wk-conta tabular">{ativos.length}</span>}
      </button>

      <Dialog open={aberto} onClose={() => setAberto(false)} title="Worker">
        <div className="wk-topo" data-on={online}>
          <span className="wk-icone"><Cpu aria-hidden /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="wk-estado"><span className={`dot ${online ? "on" : "err"}`} aria-hidden />{online ? (principal ? "Trabalhando" : "Online, esperando trabalho") : "Offline"}</div>
            <div className="subtle" style={{ fontSize: 12 }} suppressHydrationWarning>
              {lastSeen ? `Último sinal ${ago(lastSeen)}` : "Nunca se conectou"}{!online && temAtivo ? " · os jobs esperam na fila até ele voltar" : ""}
            </div>
          </div>
        </div>

        <section className="wk-sec">
          <div className="wk-sec-tit">Agora</div>
          {jobs == null && <div className="skeleton" style={{ height: 96, borderRadius: 14 }} />}
          {jobs != null && !rodando.length && <div className="wk-vazio"><CircleDashed aria-hidden /> Nada rodando no momento.</div>}
          {rodando.map((j) => {
            const d = decorrido(j);
            const { falta, base } = estimativa(j.progress, d, j.media);
            return (
              <div key={j.id} className="wk-atual">
                <div className="wk-atual-cab">
                  <div style={{ minWidth: 0 }}>
                    <div className="wk-atual-tit">{TIPO[j.type] ?? j.type}{j.auto && <span className="subtle"> · automático</span>}</div>
                    {j.ultimoLog && <div className="wk-log" title={j.ultimoLog}>{j.ultimoLog}</div>}
                  </div>
                  <div className="wk-pct tabular">{j.progress}<small>%</small></div>
                </div>
                <div className="bar wk-bar"><i style={{ width: `${Math.max(j.progress, 2)}%` }} /></div>
                <div className="wk-metricas">
                  <span><Timer aria-hidden /><small>Já foi</small><b className="tabular">{duracao(d)}</b></span>
                  <span><Hourglass aria-hidden /><small>Falta{base === "media" ? " (média)" : ""}</small><b className="tabular">{falta == null ? "calculando…" : falta < 1 && base === "media" ? "passando da média" : `~${duracao(falta)}`}</b></span>
                  <span><Clock aria-hidden /><small>Termina</small><b className="tabular" suppressHydrationWarning>{falta == null ? "—" : new Date(Date.now() + falta * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</b></span>
                </div>
                {podeEditar && (
                  <button className="btn btn-ghost btn-xs wk-cancelar" onClick={() => start(async () => { const r = await cancelarJob(j.id); if (r.ok) toast.ok("Job cancelado"); else toast.err(r.error); await carregar.current(); })}>
                    <X aria-hidden /> Cancelar
                  </button>
                )}
              </div>
            );
          })}
          {ativos.some((j) => j.status === "PENDING") && (
            <div className="wk-fila">
              <span className="subtle">Na fila:</span>
              {ativos.filter((j) => j.status === "PENDING").map((j) => <span key={j.id} className="badge badge-info">{TIPO[j.type] ?? j.type}</span>)}
            </div>
          )}
        </section>

        <section className="wk-sec">
          <div className="wk-sec-tit">Histórico <Link href="/jobs" className="wk-link" onClick={() => setAberto(false)}>Ver todos</Link></div>
          {jobs != null && !jobs.some((j) => !ATIVO.has(j.status)) && <div className="wk-vazio"><CircleDashed aria-hidden /> Nenhum job concluído ainda.</div>}
          <ul className="wk-hist">
            {jobs?.filter((j) => !ATIVO.has(j.status)).map((j) => (
              <li key={j.id} data-status={j.status}>
                {j.status === "COMPLETED" ? <CheckCircle2 aria-hidden /> : j.status === "FAILED" ? <XCircle aria-hidden /> : <Ban aria-hidden />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="wk-hist-tit">{TIPO[j.type] ?? j.type}{j.auto && <span className="subtle"> · automático</span>}</div>
                  {j.error && <div className="wk-hist-erro" title={j.error}>{j.error}</div>}
                </div>
                <div className="wk-hist-dir">
                  <span title={dateTime(j.finished_at ?? j.created_at)} suppressHydrationWarning>{ago(j.finished_at ?? j.created_at)}</span>
                  {j.decorrido != null && <span className="tabular subtle">{duracao(j.decorrido)}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </Dialog>
    </>
  );
}

/** Anel de progresso do chip */
function Anel({ pct }: { pct: number }) {
  const c = 2 * Math.PI * 7;
  return (
    <svg className="wk-anel" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="7" />
      <circle cx="9" cy="9" r="7" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(Math.max(pct, 4), 100) / 100)} />
    </svg>
  );
}
