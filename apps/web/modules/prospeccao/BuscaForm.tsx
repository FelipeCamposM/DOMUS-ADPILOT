"use client";

import type { BuscaForm as Form } from "@domus-ads/core/prospeccao";
import { ArrowRight, Globe2, Loader2, MapPin, Navigation, SlidersHorizontal, Target, X, Zap } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, type KeyboardEvent } from "react";
import { MapGuard } from "./MapGuard";
import { Seg, Slider } from "./ui";

const LocationPicker = dynamic(() => import("./Mapas").then((m) => m.LocationPicker), { ssr: false, loading: () => <div className="pp-mapa pp-mapa-carregando" style={{ height: "100%" }} /> });

export const BUSCA_PADRAO: Form = {
  name: "", niches: [], location: "Goiânia - GO", centerLat: -16.6869, centerLng: -49.2648,
  radiusKm: 3, maxLeads: 60, pace: "balanced", auditWebsites: true, opportunityFocus: "no_site_first",
};
const SUGGESTIONS = ["imobiliárias", "dentistas", "restaurantes", "academias", "clínicas de estética", "advocacia", "pet shops", "oficinas mecânicas"];
const RADIUS_PRESETS = [1, 2, 3, 5, 10, 20];
const FOCO: Record<Form["opportunityFocus"], string> = { no_site_first: "Sem site primeiro", balanced: "Equilibrado", all: "Todos" };
const RITMO: Record<Form["pace"], string> = { slow: "cauteloso", balanced: "ritmo normal", fast: "rápido" };
const nicheList = (raw: string) => raw.split(",").map((x) => x.trim()).filter(Boolean);

export function BuscaForm({ value, onChange, onSubmit, running, enviando, nav }: { value: Form; onChange: (v: Form) => void; onSubmit: () => void; running: boolean; enviando: boolean; nav?: React.ReactNode }) {
  const set = <K extends keyof Form>(key: K, next: Form[K]) => onChange({ ...value, [key]: next });
  const [draft, setDraft] = useState("");
  const [qualif, setQualif] = useState(false);
  const niches = value.niches;
  const valid = niches.length > 0 && Number.isFinite(value.centerLat) && value.maxLeads > 0;
  const travado = running || enviando;
  const minutos = Math.max(1, Math.round((value.maxLeads / 50) * (value.auditWebsites ? 1.5 : 1)));
  const prontos = [niches.length > 0, !!value.location, value.radiusKm > 0].filter(Boolean).length;

  const addNiche = (raw: string) => {
    const novos = nicheList(raw).filter((n) => !niches.some((x) => x.toLowerCase() === n.toLowerCase()));
    if (novos.length) set("niches", [...niches, ...novos].slice(0, 20));
    setDraft("");
  };
  const removeNiche = (n: string) => set("niches", niches.filter((x) => x !== n));
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && draft.trim()) { e.preventDefault(); addNiche(draft); }
    if (e.key === "Backspace" && !draft && niches.length) removeNiche(niches[niches.length - 1]!);
  };
  const resumoQualif = [FOCO[value.opportunityFocus], `${value.maxLeads} leads`, value.auditWebsites ? "audita sites" : "sem auditoria", RITMO[value.pace]].join(" · ");

  return (
    <section className="pp-console" aria-label="Configurar busca de leads" data-enter>
      <aside className="pp-console-lado">
        <header className="pp-console-cab">
          <span className="pp-console-trilha"><img src="/domus-logo.png" alt="" width={22} height={22} /> / Domus / Prospecção</span>
          <h2>Radar de leads<i>.</i></h2>
          {nav}
        </header>

        <div className="pp-console-corpo">
          <section className="pp-passo" data-ok={niches.length > 0 || undefined}>
            <h3 className="pp-passo-tit"><em>01</em>Defina o alvo</h3>
            <div className="pp-passo-caixa">
              <div className="pp-campo">
                <label className="pp-rot pp-rot-linha" htmlFor="pp-nichos"><span>Segmento</span><small>Enter ou vírgula para adicionar</small></label>
                <div className="pp-chips-campo pp-com-ico" data-disabled={travado}>
                  <Target className="pp-campo-ico" aria-hidden />
                  {niches.map((n) => (
                    <span key={n} className="pp-chip">
                      {n}
                      <button type="button" aria-label={`Remover ${n}`} disabled={travado} onClick={() => removeNiche(n)}><X aria-hidden /></button>
                    </span>
                  ))}
                  <input id="pp-nichos" value={draft} disabled={travado} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey}
                    onBlur={() => draft.trim() && addNiche(draft)} placeholder={niches.length ? "" : "Clínicas, restaurantes, academias…"} maxLength={80} />
                </div>
                <div className="pp-sugestoes" aria-label="Sugestões de nicho">
                  {SUGGESTIONS.filter((s) => !niches.includes(s)).slice(0, 6).map((s) => (
                    <button key={s} type="button" disabled={travado} onClick={() => addNiche(s)}>+ {s}</button>
                  ))}
                </div>
              </div>
              <hr />
              <label className="pp-campo">
                <span className="pp-rot pp-rot-linha"><span>Nome da campanha</span><small>Opcional</small></span>
                <input className="input-sm" value={value.name} maxLength={160} onChange={(e) => set("name", e.target.value)} placeholder={niches[0] ? `${niches[0]} — ${value.location}` : "Prospecção"} disabled={travado} />
              </label>
            </div>
          </section>

          <section className="pp-passo">
            <button type="button" className="pp-passo-linha" aria-expanded={qualif} onClick={() => setQualif((v) => !v)}>
              <em>02</em>
              <span className="pp-passo-ico"><SlidersHorizontal aria-hidden /></span>
              <span className="pp-passo-txt"><b>Qualificação</b><small className="pp-trunc">{resumoQualif}</small></span>
              <ArrowRight className="pp-passo-seta" aria-hidden />
            </button>
            {qualif && (
              <div className="pp-passo-caixa pp-passo-abre">
                <Seg label="Prioridade comercial" value={value.opportunityFocus} onChange={(v) => set("opportunityFocus", v)} disabled={travado}
                  options={[{ value: "no_site_first", label: "Sem site primeiro" }, { value: "balanced", label: "Equilibrado" }, { value: "all", label: "Todos" }]} />
                <Seg label="Ritmo" size="sm" value={value.pace} onChange={(v) => set("pace", v)} disabled={travado}
                  options={[{ value: "slow", label: "Cauteloso", title: "Mais pausas, menor risco de bloqueio" }, { value: "balanced", label: "Normal" }, { value: "fast", label: "Rápido", title: "Mais sujeito a bloqueio do Google" }]} />
                <Slider label="Máximo de leads" value={value.maxLeads} min={10} max={500} step={10} onChange={(v) => set("maxLeads", v)} disabled={travado} />
                <label className="pp-auditar">
                  <input type="checkbox" checked={value.auditWebsites} onChange={(e) => set("auditWebsites", e.target.checked)} disabled={travado} />
                  <span><b>Auditar sites</b><small>e-mail, redes, anúncios e problemas</small></span>
                </label>
              </div>
            )}
          </section>

          <section className="pp-passo">
            <h3 className="pp-passo-tit"><em>03</em><Globe2 className="pp-passo-tit-ico" aria-hidden />Território<small>1 área</small></h3>
            <div className="pp-passo-solta">
              <Slider label="Raio da área" unit=" km" value={value.radiusKm} min={0.5} max={30} step={0.5} onChange={(v) => set("radiusKm", v)} disabled={travado} />
              <div className="pp-atalhos">
                {RADIUS_PRESETS.map((r) => (
                  <button key={r} type="button" disabled={travado} aria-pressed={value.radiusKm === r} onClick={() => set("radiusKm", r)}>{r} km</button>
                ))}
              </div>
              <div className="pp-area">
                <MapPin aria-hidden /><b>P1</b>
                <span className="pp-trunc">{value.location || "Escolha no mapa"}</span>
                <code className="tabular">{value.centerLat.toFixed(4)}, {value.centerLng.toFixed(4)}</code>
                <b className="tabular">{String(value.radiusKm).replace(".", ",")} km</b>
              </div>
            </div>
          </section>
        </div>

        <footer className="pp-console-pe">
          <div className="pp-console-info">
            <span className="pp-console-raio"><Zap aria-hidden /></span>
            <span><b>~{minutos} min de busca</b><small>Lê o Maps no PC do worker, em segundo plano</small></span>
          </div>
          <button type="button" className="pp-cta" onClick={onSubmit} disabled={!valid || travado}>
            <span className="pp-cta-ico">{travado ? <Loader2 className="animate-spin" aria-hidden /> : <Navigation aria-hidden />}</span>
            <span className="pp-cta-txt">{running ? "Buscando e auditando…" : enviando ? "Mandando para o worker…" : "Mapear oportunidades"}</span>
            <span className="pp-cta-seta"><ArrowRight aria-hidden /></span>
          </button>
        </footer>
      </aside>

      <div className="pp-console-mapa">
        <MapGuard>
          <LocationPicker value={{ lat: value.centerLat, lng: value.centerLng, label: value.location }} radiusKm={value.radiusKm} disabled={travado}
            onChange={(p) => onChange({ ...value, centerLat: p.lat, centerLng: p.lng, location: p.label })}
            extra={
              <div className="pp-hud pp-hud-anel">
                <span className="pp-pronto" style={{ "--p": prontos / 3 } as React.CSSProperties}><i /></span>
                <span><b className="tabular">{Math.round((prontos / 3) * 100)}%</b><small>Busca pronta</small><em>{niches.length ? `até ${value.maxLeads} leads` : "Falta o segmento"}</em></span>
              </div>
            } />
        </MapGuard>
      </div>
    </section>
  );
}
