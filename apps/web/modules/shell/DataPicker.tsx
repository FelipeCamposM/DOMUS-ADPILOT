"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
import { gradeDoMes } from "../calendario/grade";
import { Popover } from "./Popover";

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const HORARIOS = ["09:00", "12:00", "15:00", "18:00", "20:00"];
const HORAS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTOS = Array.from({ length: 12 }, (_, m) => String(m * 5).padStart(2, "0"));
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/**
 * Seletor de data (e hora, com `hora`) no lugar do input nativo. Trabalha com o mesmo texto do input:
 * "AAAA-MM-DD" ou "AAAA-MM-DDTHH:MM", sem fuso; quem chama decide o fuso.
 */
export function DataPicker({ value, onChange, hora, min, id, ariaLabel, disabled, align }: {
  value: string; onChange: (v: string) => void; hora?: boolean; min?: string; id?: string; ariaLabel?: string; disabled?: boolean; align?: "left" | "right";
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const gatilho = useRef<HTMLButtonElement>(null);
  const dia = value.slice(0, 10);
  const hm = value.slice(11, 16) || "12:00";
  const [mes, setMes] = useState(dia.slice(0, 7) || hoje().slice(0, 7));
  const set = (d: string, h = hm) => onChange(hora ? `${d}T${h}` : d);
  const navegar = (delta: number) => {
    const [y, m] = mes.split("-").map(Number) as [number, number];
    setMes(new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7));
  };
  const rotulo = dia
    ? new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: dia.slice(0, 4) === hoje().slice(0, 4) ? undefined : "numeric", timeZone: "UTC" }) + (hora ? ` · ${hm}` : "")
    : "Escolher data";
  const h0 = hoje();

  return (
    <div className="dp">
      <button type="button" id={id} className="dp-gatilho" aria-label={ariaLabel} aria-expanded={aberto} disabled={disabled}
        ref={gatilho} onClick={() => {
          if (dia) setMes(dia.slice(0, 7));
          // fixo na tela: dentro de modal com rolagem o painel ficaria cortado; abre para cima se não couber embaixo
          const r = gatilho.current!.getBoundingClientRect();
          const alto = hora ? 450 : 340;
          const left = Math.max(8, Math.min(align === "right" ? r.right - 296 : r.left, innerWidth - 304));
          setPos({ position: "fixed", left, right: "auto", top: r.bottom + 8 + alto > innerHeight ? Math.max(8, r.top - 8 - alto) : r.bottom + 8 });
          setAberto((a) => !a);
        }}>
        <CalendarDays aria-hidden /> <span>{rotulo}</span>
      </button>
      <Popover open={aberto} onClose={() => setAberto(false)} className="dp-pop" align={align} style={pos}>
        <div className="dp-topo">
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => navegar(-1)} aria-label="Mês anterior"><ChevronLeft aria-hidden /></button>
          <b>{new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })}</b>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => navegar(1)} aria-label="Próximo mês"><ChevronRight aria-hidden /></button>
        </div>
        <div className="dp-grade">
          {SEMANA.map((s, i) => <span key={i} className="dp-sem">{s}</span>)}
          {gradeDoMes(mes).map((d) => (
            <button key={d} type="button" className="dp-dia" data-fora={!d.startsWith(mes)} data-hoje={d === h0} data-sel={d === dia}
              disabled={!!min && d < min} onClick={() => { set(d); if (!hora) setAberto(false); }}>
              {Number(d.slice(8))}
            </button>
          ))}
        </div>
        {hora && (
          <div className="dp-hora">
            <Clock aria-hidden />
            <select className="select" value={hm.slice(0, 2)} onChange={(e) => set(dia || h0, `${e.target.value}:${hm.slice(3)}`)} aria-label="Hora">
              {HORAS.map((h) => <option key={h}>{h}</option>)}
            </select>
            <b>:</b>
            <select className="select" value={MINUTOS.includes(hm.slice(3)) ? hm.slice(3) : "00"} onChange={(e) => set(dia || h0, `${hm.slice(0, 2)}:${e.target.value}`)} aria-label="Minutos">
              {MINUTOS.map((m) => <option key={m}>{m}</option>)}
            </select>
            <div className="dp-atalhos">
              {HORARIOS.map((h) => <button key={h} type="button" className="chip" data-active={h === hm} onClick={() => set(dia || h0, h)}>{h}</button>)}
            </div>
          </div>
        )}
        {hora && <button type="button" className="btn btn-primary btn-sm dp-ok" onClick={() => setAberto(false)}>Pronto</button>}
      </Popover>
    </div>
  );
}
