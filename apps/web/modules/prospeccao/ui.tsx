"use client";

import { useId, type ReactNode } from "react";

/** Peças pequenas da prospecção: controle segmentado e slider com valor (o resto vem do DS: btn, panel, input-sm…). */

export function Seg<T extends string>({ label, value, onChange, options, size, disabled }: {
  label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; title?: string }[]; size?: "sm"; disabled?: boolean;
}) {
  return (
    <div className="pp-campo">
      <span className="pp-rot">{label}</span>
      <div className="pp-seg" role="radiogroup" aria-label={label} data-size={size}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} title={o.title} disabled={disabled} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function Slider({ label, value, min, max, step = 1, unit = "", onChange, disabled }: {
  label: ReactNode; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; disabled?: boolean;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="pp-campo">
      <label htmlFor={id} className="pp-rot pp-rot-linha"><span>{label}</span><b className="tabular">{String(value).replace(".", ",")}{unit}</b></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--pct" as string]: `${pct}%`, width: "100%" }} />
    </div>
  );
}

export function Kpi({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string | number; tone?: "error" | "warning" | "success" | "brand" }) {
  return (
    <div className="pp-kpi" data-tone={tone ?? "brand"}>
      <span className="pp-kpi-rot">{icon}<span className="pp-trunc">{label}</span></span>
      <b className="tabular">{value}</b>
    </div>
  );
}
