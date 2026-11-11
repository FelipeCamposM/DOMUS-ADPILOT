"use client";

import type { BuscaForm as Form } from "@domus-ads/core/prospeccao";
import { Gauge, Loader2, MapPinned, Radar, Search, ShieldCheck, Target, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, type KeyboardEvent } from "react";
import { MapGuard } from "./MapGuard";
import { Seg, Slider } from "./ui";

const LocationPicker = dynamic(() => import("./Mapas").then((m) => m.LocationPicker), { ssr: false, loading: () => <div className="pp-mapa pp-mapa-carregando" style={{ height: 426 }} /> });

export const BUSCA_PADRAO: Form = {
  name: "", niches: [], location: "Goiânia - GO", centerLat: -16.6869, centerLng: -49.2648,
  radiusKm: 3, maxLeads: 60, pace: "balanced", auditWebsites: true, opportunityFocus: "no_site_first",
};
const SUGGESTIONS = ["imobiliárias", "dentistas", "restaurantes", "academias", "clínicas de estética", "advocacia", "pet shops", "oficinas mecânicas"];
const RADIUS_PRESETS = [1, 2, 3, 5, 10, 20];
const nicheList = (raw: string) => raw.split(",").map((x) => x.trim()).filter(Boolean);

export function BuscaForm({ value, onChange, onSubmit, running, enviando }: { value: Form; onChange: (v: Form) => void; onSubmit: () => void; running: boolean; enviando: boolean }) {
  const set = <K extends keyof Form>(key: K, next: Form[K]) => onChange({ ...value, [key]: next });
  const [draft, setDraft] = useState("");
  const niches = value.niches;
  const valid = niches.length > 0 && Number.isFinite(value.centerLat) && value.maxLeads > 0;
  const travado = running || enviando;

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

  return (
    <section className="pp-busca" aria-label="Configurar busca de leads" data-enter>
      <div className="panel pp-caixa">
        <header className="pp-cab">
          <span className="icon-tile"><Target aria-hidden /></span>
          <div><h2>O que você procura</h2><p>Nicho, área no mapa e quantos leads trazer.</p></div>
        </header>

        <div className="pp-campo">
          <label className="pp-rot pp-rot-linha" htmlFor="pp-nichos"><span>Nicho(s)</span><small>Enter ou vírgula para adicionar</small></label>
          <div className="pp-chips-campo" data-disabled={travado}>
            {niches.map((n) => (
              <span key={n} className="pp-chip">
                {n}
                <button type="button" aria-label={`Remover ${n}`} disabled={travado} onClick={() => removeNiche(n)}><X aria-hidden /></button>
              </span>
            ))}
            <input id="pp-nichos" value={draft} disabled={travado} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey}
              onBlur={() => draft.trim() && addNiche(draft)} placeholder={niches.length ? "" : "ex.: imobiliárias"} maxLength={80} />
          </div>
          <div className="pp-sugestoes" aria-label="Sugestões de nicho">
            {SUGGESTIONS.filter((s) => !niches.includes(s)).slice(0, 6).map((s) => (
              <button key={s} type="button" disabled={travado} onClick={() => addNiche(s)}>+ {s}</button>
            ))}
          </div>
        </div>

        <div className="pp-campo">
          <Slider label="Raio da busca" unit=" km" value={value.radiusKm} min={0.5} max={30} step={0.5} onChange={(v) => set("radiusKm", v)} disabled={travado} />
          <div className="pp-atalhos">
            {RADIUS_PRESETS.map((r) => (
              <button key={r} type="button" disabled={travado} aria-pressed={value.radiusKm === r} onClick={() => set("radiusKm", r)}>{r} km</button>
            ))}
          </div>
        </div>

        <div className="pp-duas">
          <label className="pp-campo">
            <span className="pp-rot">Máximo de leads</span>
            <input className="input-sm tabular" type="number" min={1} max={500} value={value.maxLeads} disabled={travado}
              onChange={(e) => set("maxLeads", Math.max(1, Math.min(500, Number(e.target.value) || 1)))} />
          </label>
          <label className="pp-campo">
            <span className="pp-rot pp-rot-linha"><span>Nome da campanha</span><small>Opcional</small></span>
            <input className="input-sm" value={value.name} maxLength={160} onChange={(e) => set("name", e.target.value)} placeholder={niches[0] ? `${niches[0]} — ${value.location}` : "Prospecção"} disabled={travado} />
          </label>
        </div>

        <Seg label="Prioridade comercial" value={value.opportunityFocus} onChange={(v) => set("opportunityFocus", v)} disabled={travado}
          options={[{ value: "no_site_first", label: "Sem site primeiro" }, { value: "balanced", label: "Equilibrado" }, { value: "all", label: "Todos" }]} />

        <div className="pp-duas" style={{ alignItems: "end" }}>
          <Seg label="Ritmo" size="sm" value={value.pace} onChange={(v) => set("pace", v)} disabled={travado}
            options={[{ value: "slow", label: "Cauteloso", title: "Mais pausas, menor risco de bloqueio" }, { value: "balanced", label: "Normal" }, { value: "fast", label: "Rápido", title: "Mais sujeito a bloqueio do Google" }]} />
          <label className="pp-auditar">
            <input type="checkbox" checked={value.auditWebsites} onChange={(e) => set("auditWebsites", e.target.checked)} disabled={travado} />
            <span><b>Auditar sites</b><small>e-mail, redes, anúncios e problemas</small></span>
          </label>
        </div>

        <button type="button" className="btn btn-primary btn-lg pp-iniciar" onClick={onSubmit} disabled={!valid || travado}>
          {travado ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />} {running ? "Buscando e auditando…" : enviando ? "Mandando para o worker…" : "Iniciar prospecção"}
        </button>
        <ul className="pp-garantias">
          <li><Radar aria-hidden />Lê o Maps em segundo plano</li>
          <li><Gauge aria-hidden />~1 min por 50 leads</li>
          <li><ShieldCheck aria-hidden />Roda no PC do worker</li>
        </ul>
      </div>

      <div className="panel pp-caixa">
        <header className="pp-cab">
          <span className="icon-tile"><MapPinned aria-hidden /></span>
          <div><h2>Onde procurar</h2><p>Busque um lugar ou clique no mapa. O círculo mostra a área coberta.</p></div>
        </header>
        <MapGuard>
          <LocationPicker value={{ lat: value.centerLat, lng: value.centerLng, label: value.location }} radiusKm={value.radiusKm} disabled={travado}
            onChange={(p) => onChange({ ...value, centerLat: p.lat, centerLng: p.lng, location: p.label })} />
        </MapGuard>
      </div>
    </section>
  );
}
