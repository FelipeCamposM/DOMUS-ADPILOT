"use client";

import "leaflet/dist/leaflet.css";
import type { Lead } from "@domus-ads/core/prospeccao";
import L from "leaflet";
import { Crosshair, Loader2, MapPin, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { STATUS } from "./comum";
import { MapGuard, MapPlaceholder } from "./MapGuard";

/**
 * Mapas da prospecção (só no navegador: carregados com next/dynamic, ssr:false).
 * Fundo: cinza escuro da Esri, sem chave. Não volte para o CARTO (pede chave desde 2026-11) nem para
 * tile.openstreetmap.org (bloqueia apps com HTTP 418). Os ladrilhos vão até o zoom 16; acima, o Leaflet amplia.
 */
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
const ATTRIBUTION = "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap";

function MapTiles() {
  const comum = { maxZoom: 19, maxNativeZoom: 16 };
  return (
    <>
      <TileLayer {...comum} url={`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`} attribution={ATTRIBUTION} />
      <TileLayer {...comum} url={`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`} />
    </>
  );
}

// ───────────── Nominatim (OpenStreetMap): busca de lugar e nome do ponto ─────────────

export interface Place { label: string; detail: string; lat: number; lng: number }
interface NominatimAddress {
  suburb?: string; neighbourhood?: string; quarter?: string; city_district?: string;
  city?: string; town?: string; village?: string; municipality?: string;
  state?: string; "ISO3166-2-lvl4"?: string; road?: string;
}
interface NominatimItem { lat: string; lon: string; display_name: string; name?: string; address?: NominatimAddress }
const NOMINATIM = "https://nominatim.openstreetmap.org";

/** "Setor Marista, Goiânia - GO" a partir do endereço do Nominatim. */
function placeLabel(a: NominatimAddress | undefined, fallback = ""): string {
  if (!a) return fallback;
  const bairro = a.suburb || a.neighbourhood || a.quarter || a.city_district;
  const cidade = a.city || a.town || a.village || a.municipality;
  const uf = a["ISO3166-2-lvl4"]?.split("-")[1] || a.state;
  const parts = [bairro, cidade].filter(Boolean).join(", ");
  return parts ? `${parts}${uf ? ` - ${uf}` : ""}` : fallback;
}
const toPlace = (item: NominatimItem): Place => ({ label: placeLabel(item.address, item.name || item.display_name.split(",")[0]), detail: item.display_name, lat: Number(item.lat), lng: Number(item.lon) });

/** Busca no Brasil, em pt-BR. O texto digitado vai para o OpenStreetMap. */
async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&countrycodes=br&limit=6&accept-language=pt-BR&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as NominatimItem[]).map(toPlace);
}
async function reversePlace(lat: number, lng: number, signal?: AbortSignal): Promise<string> {
  const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=16&accept-language=pt-BR&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const item = (await res.json()) as NominatimItem;
  return placeLabel(item.address, item.display_name?.split(",").slice(0, 2).join(",") ?? "");
}

// ───────────── Seletor de local ─────────────

export interface PickedLocation { lat: number; lng: number; label: string }

const PIN = L.divIcon({ className: "pp-pin", html: '<span class="pp-pin-dot"></span><span class="pp-pin-pulse"></span>', iconSize: [28, 28], iconAnchor: [14, 14] });

/** Enquadra o círculo do raio sempre que o centro ou o raio mudam. */
function FitRadius({ lat, lng, radiusKm }: { lat: number; lng: number; radiusKm: number }) {
  const map = useMap();
  useEffect(() => { map.flyToBounds(L.latLng(lat, lng).toBounds(radiusKm * 2000), { padding: [28, 28], duration: 0.6 }); }, [lat, lng, radiusKm, map]);
  return null;
}
function ClickToMove({ onPick, disabled }: { onPick: (lat: number, lng: number) => void; disabled?: boolean }) {
  useMapEvents({ click: (e) => { if (!disabled) onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

export function LocationPicker({ value, radiusKm, disabled, onChange }: { value: PickedLocation; radiusKm: number; disabled?: boolean; onChange: (v: PickedLocation) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [failed, setFailed] = useState(false);
  const reverseAbort = useRef<AbortController | null>(null);
  const ultima = useRef(0);

  // Nominatim: no máximo 1 requisição/s e nada de autocompletar a cada letra (regra de uso): busca no Enter ou na lupa
  async function buscar() {
    const q = query.trim();
    if (q.length < 3 || searching) return;
    const espera = 1000 - (Date.now() - ultima.current);
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultima.current = Date.now();
    setSearching(true);
    try { const r = await searchPlaces(q); setResults(r); setFailed(false); setOpen(true); }
    catch { setFailed(true); setOpen(true); }
    finally { setSearching(false); }
  }

  function pick(lat: number, lng: number) {
    onChange({ lat, lng, label: value.label });
    reverseAbort.current?.abort();
    const ctrl = new AbortController();
    reverseAbort.current = ctrl;
    setNaming(true);
    reversePlace(lat, lng, ctrl.signal)
      .then((label) => onChange({ lat, lng, label: label || `${lat.toFixed(4)}, ${lng.toFixed(4)}` }))
      .catch((e) => { if ((e as Error)?.name !== "AbortError") onChange({ lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }); })
      .finally(() => { if (reverseAbort.current === ctrl) setNaming(false); });
  }
  function choose(place: Place) {
    onChange({ lat: place.lat, lng: place.lng, label: place.label });
    setQuery(""); setResults([]); setOpen(false);
  }

  return (
    <div className="pp-picker">
      <div className="pp-lugar">
        <Search className="pp-lugar-ic" aria-hidden />
        <input type="search" className="input-sm" aria-label="Buscar endereço, bairro ou cidade" placeholder="Buscar endereço, bairro ou cidade… (Enter)" value={query} disabled={disabled}
          onChange={(e) => { setQuery(e.target.value); if (!e.target.value) { setResults([]); setOpen(false); } }}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); if (open && results[0] && !searching) choose(results[0]); else void buscar(); }
            if (e.key === "Escape") setOpen(false);
          }} />
        {searching ? <Loader2 className="pp-lugar-fim animate-spin" aria-hidden />
          : query && <button type="button" className="pp-lugar-fim pp-lugar-x" aria-label="Limpar busca" onClick={() => { setQuery(""); setResults([]); setOpen(false); }}><X aria-hidden /></button>}
        {open && (results.length > 0 || failed || (!searching && query.trim().length >= 3)) && (
          <ul role="listbox" aria-label="Lugares encontrados" className="pp-lugares">
            {failed && <li className="pp-lugares-erro">Não foi possível buscar agora. Clique no mapa para escolher o ponto.</li>}
            {!failed && !results.length && <li className="pp-lugares-erro" style={{ color: "rgb(var(--c-text-tertiary))" }}>Nada encontrado. Tente o bairro com a cidade.</li>}
            {results.map((place) => (
              <li key={`${place.lat},${place.lng}`}>
                <button type="button" role="option" aria-selected={false} onClick={() => choose(place)}>
                  <MapPin aria-hidden />
                  <span><b>{place.label}</b><small>{place.detail}</small></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pp-mapa pp-mapa-picker">
        <MapContainer center={[value.lat, value.lng]} zoom={14} className="pp-mapa-in" style={{ height: 380 }} scrollWheelZoom zoomControl={false}>
          <MapTiles />
          <FitRadius lat={value.lat} lng={value.lng} radiusKm={radiusKm} />
          <ClickToMove onPick={pick} disabled={disabled} />
          <Circle center={[value.lat, value.lng]} radius={radiusKm * 1000} pathOptions={{ className: "pp-raio", weight: 2, fillOpacity: 0.08, dashArray: "6 6" }} />
          <Marker position={[value.lat, value.lng]} icon={PIN} draggable={!disabled}
            eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); pick(p.lat, p.lng); } }} />
        </MapContainer>
        <div className="pp-mapa-topo">
          <span className="pp-flutua">
            {naming ? <Loader2 className="animate-spin" aria-hidden /> : <MapPin aria-hidden />}
            <span className="pp-trunc" aria-live="polite">{value.label || "Escolha um ponto"}</span>
            <span className="pp-flutua-km">· {String(radiusKm).replace(".", ",")} km</span>
          </span>
        </div>
        <p className="pp-flutua pp-mapa-dica"><Crosshair aria-hidden /> Clique no mapa ou arraste o pino</p>
      </div>
    </div>
  );
}

// ───────────── Mapa dos resultados ─────────────

function FitLeads({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0]!, 15);
    else if (points.length > 1) map.fitBounds(points, { padding: [28, 28], maxZoom: 16 });
    // Só reenquadra quando muda o conjunto de pontos, não a cada seleção.
  }, [points.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
function FocusSelected({ lead }: { lead?: Lead }) {
  const map = useMap();
  useEffect(() => {
    if (lead && Number.isFinite(lead.latitude)) map.panTo([lead.latitude!, lead.longitude!], { animate: true });
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

interface LeadMapProps { leads: Lead[]; selectedId?: string; onSelect: (id: string) => void; radiusKm?: number; center?: [number, number] }

function InteractiveLeadMap({ leads, selectedId, onSelect, radiusKm, center }: LeadMapProps) {
  const mapped = useMemo(() => leads.filter((x) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude)), [leads]);
  const points = useMemo(() => mapped.map((x) => [x.latitude!, x.longitude!] as [number, number]), [mapped]);
  const origin: [number, number] = center ?? points[0]!;
  return (
    <section className="pp-mapa" aria-label="Mapa dos leads">
      <MapContainer center={origin} zoom={14} className="pp-mapa-in" style={{ height: 320 }} scrollWheelZoom zoomControl={false}>
        <MapTiles />
        <FitLeads points={points} />
        <FocusSelected lead={mapped.find((x) => x.id === selectedId)} />
        {center && radiusKm ? <Circle center={center} radius={radiusKm * 1000} pathOptions={{ className: "pp-raio", weight: 1.5, fillOpacity: 0.05, dashArray: "5 6" }} /> : null}
        {mapped.map((lead) => {
          const active = lead.id === selectedId;
          const color = (STATUS[lead.websiteStatus] ?? STATUS.unknown).color;
          const icon = L.divIcon({ className: `pp-marcador${active ? " is-active" : ""}`, html: `<span style="background:${color}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] });
          return (
            <Marker key={lead.id} position={[lead.latitude!, lead.longitude!]} icon={icon} zIndexOffset={active ? 1000 : 0} eventHandlers={{ click: () => onSelect(lead.id) }}>
              <Tooltip direction="top" offset={[0, -8]}>{lead.name} · {lead.score}</Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
      <ul className="pp-flutua pp-legenda" aria-label="Legenda">
        {(["no_site", "social_only", "broken", "weak", "healthy"] as const).map((k) => (
          <li key={k}><span style={{ background: STATUS[k].color }} />{STATUS[k].label}</li>
        ))}
      </ul>
    </section>
  );
}

export function LeadMap(props: LeadMapProps) {
  const has = props.leads.some((lead) => Number.isFinite(lead.latitude) && Number.isFinite(lead.longitude));
  if (!has) return <MapPlaceholder message="Os pinos aparecem quando a busca traz as coordenadas das empresas." />;
  return <MapGuard><InteractiveLeadMap {...props} /></MapGuard>;
}
