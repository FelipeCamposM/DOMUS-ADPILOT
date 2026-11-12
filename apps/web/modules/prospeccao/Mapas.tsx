"use client";

import "leaflet/dist/leaflet.css";
import type { Lead, LeadCampaign } from "@domus-ads/core/prospeccao";
import L from "leaflet";
import { ArrowRight, Crosshair, Loader2, LocateFixed, MapPin, Minus, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
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

// ───────────── Zoom flutuante (fora do MapContainer) ─────────────

function ZoomHud({ map, onRecentrar, rotulo }: { map: L.Map | null; onRecentrar: () => void; rotulo: string }) {
  const [zoom, setZoom] = useState(14);
  useEffect(() => {
    if (!map) return;
    const f = () => setZoom(Math.round(map.getZoom()));
    f();
    map.on("zoomend", f);
    return () => { map.off("zoomend", f); };
  }, [map]);
  return (
    <div className="pp-hud pp-hud-zoom" role="group" aria-label="Zoom do mapa">
      <button type="button" aria-label="Aproximar" onClick={() => map?.zoomIn()}><Plus aria-hidden /></button>
      <span><small>zoom</small><b className="tabular">{zoom}</b></span>
      <button type="button" aria-label="Afastar" onClick={() => map?.zoomOut()}><Minus aria-hidden /></button>
      <button type="button" aria-label={rotulo} title={rotulo} onClick={onRecentrar}><LocateFixed aria-hidden /></button>
    </div>
  );
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

export function LocationPicker({ value, radiusKm, disabled, onChange, extra }: { value: PickedLocation; radiusKm: number; disabled?: boolean; onChange: (v: PickedLocation) => void; /** cartão a mais no topo, à direita */ extra?: ReactNode }) {
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

  // mapa ocupa tudo; busca, território, zoom e dica flutuam por cima (fora do MapContainer: clique neles não move o pino)
  const [map, setMap] = useState<L.Map | null>(null);
  const recentrar = () => map?.flyToBounds(L.latLng(value.lat, value.lng).toBounds(radiusKm * 2000), { padding: [28, 28], duration: 0.6 });
  const irAoLocal = () => { if (open && results[0] && !searching) choose(results[0]); else void buscar(); };

  return (
    <div className="pp-picker">
      <div className="pp-mapa pp-mapa-picker">
        <MapContainer ref={setMap} center={[value.lat, value.lng]} zoom={14} className="pp-mapa-in" style={{ height: "100%" }} scrollWheelZoom zoomControl={false}>
          <MapTiles />
          <FitRadius lat={value.lat} lng={value.lng} radiusKm={radiusKm} />
          <ClickToMove onPick={pick} disabled={disabled} />
          <Circle center={[value.lat, value.lng]} radius={radiusKm * 1000} pathOptions={{ className: "pp-raio", color: "#a855f7", weight: 2, fillOpacity: 0.1, dashArray: "6 6" }} />
          <Marker position={[value.lat, value.lng]} icon={PIN} draggable={!disabled}
            eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); pick(p.lat, p.lng); } }} />
        </MapContainer>
      </div>

      <div className="pp-hud-topo">
        <div className="pp-hud pp-hud-terr">
          <span className="pp-hud-rot"><i data-on={!naming || undefined} />Território definido</span>
          <b className="pp-trunc" aria-live="polite">{naming ? "Identificando o lugar…" : value.label || "Escolha um ponto"}</b>
          <small className="tabular">{String(radiusKm).replace(".", ",")} km de raio · {Math.round(Math.PI * radiusKm * radiusKm).toLocaleString("pt-BR")} km² de área</small>
        </div>

        <div className="pp-hud pp-hud-busca">
          <span className="pp-hud-ico">{searching ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}</span>
          <label className="pp-hud-campo">
            <span className="pp-hud-rot">Explorar o mapa</span>
            <input type="search" aria-label="Buscar endereço, bairro ou cidade" placeholder="Busque cidade, bairro ou endereço" value={query} disabled={disabled}
              onChange={(e) => { setQuery(e.target.value); if (!e.target.value) { setResults([]); setOpen(false); } }}
              onFocus={() => results.length && setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); irAoLocal(); }
                if (e.key === "Escape") setOpen(false);
              }} />
          </label>
          {query && !searching && <button type="button" className="pp-hud-x" aria-label="Limpar busca" onClick={() => { setQuery(""); setResults([]); setOpen(false); }}><X aria-hidden /></button>}
          <button type="button" className="btn btn-primary btn-sm pp-hud-ir" disabled={disabled || query.trim().length < 3 || searching} onClick={irAoLocal}>Ir ao local <ArrowRight aria-hidden /></button>
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
        {extra}
      </div>

      <ZoomHud map={map} onRecentrar={recentrar} rotulo="Voltar ao território" />

      <div className="pp-hud pp-hud-dica">
        <span className="pp-hud-ico pp-hud-ico-sm"><Crosshair aria-hidden /></span>
        <span><b>Marque o território</b><small>Clique no mapa ou arraste o pino · a roda do mouse aproxima</small></span>
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
  const [map, setMap] = useState<L.Map | null>(null);
  const enquadrar = () => { if (points.length === 1) map?.setView(points[0]!, 15); else if (points.length > 1) map?.fitBounds(points, { padding: [28, 28], maxZoom: 16 }); };
  return (
    <section className="pp-mapa pp-mapa-res" aria-label="Mapa dos leads">
      <MapContainer ref={setMap} center={origin} zoom={14} className="pp-mapa-in" style={{ height: "100%" }} scrollWheelZoom zoomControl={false}>
        <MapTiles />
        <FitLeads points={points} />
        <FocusSelected lead={mapped.find((x) => x.id === selectedId)} />
        {center && radiusKm ? <Circle center={center} radius={radiusKm * 1000} pathOptions={{ className: "pp-raio", color: "#a855f7", weight: 1.5, fillOpacity: 0.05, dashArray: "5 6" }} /> : null}
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
      <ZoomHud map={map} onRecentrar={enquadrar} rotulo="Enquadrar todos os leads" />
      <ul className="pp-hud pp-legenda" aria-label="Legenda">
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

// ───────────── Mapa de todas as buscas (lista "Suas buscas") ─────────────

interface CampanhasMapProps { campanhas: LeadCampaign[]; leads: Lead[]; destaque?: string; onDestaque: (id?: string) => void; onOpen: (id: string) => void }

function InteractiveCampanhasMap({ campanhas, leads, destaque, onDestaque, onOpen }: CampanhasMapProps) {
  const areas = useMemo(() => campanhas.filter((c) => Number.isFinite(c.centerLat) && Number.isFinite(c.centerLng)), [campanhas]);
  const pontos = useMemo(() => leads.filter((x) => !x.deletedAt && Number.isFinite(x.latitude) && Number.isFinite(x.longitude)), [leads]);
  const [map, setMap] = useState<L.Map | null>(null);
  const enquadrar = () => {
    if (!map || !areas.length) return;
    const b = L.latLngBounds([]);
    areas.forEach((c) => b.extend(L.latLng(c.centerLat!, c.centerLng!).toBounds(c.radiusKm * 2000)));
    map.fitBounds(b, { padding: [40, 40], maxZoom: 15 });
  };
  useEffect(enquadrar, [map, areas.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // passar o mouse numa busca da lista leva o mapa até ela
  useEffect(() => {
    const c = areas.find((x) => x.id === destaque);
    if (map && c) map.flyToBounds(L.latLng(c.centerLat!, c.centerLng!).toBounds(c.radiusKm * 2000), { padding: [40, 40], maxZoom: 15, duration: 0.6 });
  }, [destaque]); // eslint-disable-line react-hooks/exhaustive-deps
  const origem: [number, number] = areas[0] ? [areas[0].centerLat!, areas[0].centerLng!] : [-15.78, -47.93];
  return (
    <section className="pp-mapa pp-mapa-res" aria-label="Mapa das buscas">
      <MapContainer ref={setMap} center={origem} zoom={12} className="pp-mapa-in" style={{ height: "100%" }} scrollWheelZoom zoomControl={false}>
        <MapTiles />
        {pontos.map((l) => {
          const fraco = destaque && l.campaignId !== destaque;
          return <CircleMarker key={l.id} center={[l.latitude!, l.longitude!]} radius={4} interactive={false}
            pathOptions={{ stroke: false, fillColor: (STATUS[l.websiteStatus] ?? STATUS.unknown).color, fillOpacity: fraco ? 0.15 : 0.85 }} />;
        })}
        {areas.map((c) => {
          const ativo = c.id === destaque;
          return (
            <Circle key={c.id} center={[c.centerLat!, c.centerLng!]} radius={c.radiusKm * 1000}
              pathOptions={{ className: `pp-raio${ativo ? " pp-raio-ativo" : ""}`, color: ativo ? "#d8b4fe" : "#a855f7", weight: ativo ? 2.5 : 1.5, fillOpacity: ativo ? 0.12 : 0.04, dashArray: ativo ? undefined : "5 6" }}
              eventHandlers={{ click: () => onOpen(c.id), mouseover: () => onDestaque(c.id), mouseout: () => onDestaque(undefined) }}>
              <Tooltip direction="top" sticky>{c.name} · {c.foundCount} leads</Tooltip>
            </Circle>
          );
        })}
      </MapContainer>
      <ZoomHud map={map} onRecentrar={enquadrar} rotulo="Enquadrar todas as buscas" />
      <ul className="pp-hud pp-legenda" aria-label="Legenda">
        {(["no_site", "social_only", "broken", "weak", "healthy"] as const).map((k) => (
          <li key={k}><span style={{ background: STATUS[k].color }} />{STATUS[k].label}</li>
        ))}
      </ul>
    </section>
  );
}

export function CampanhasMap(props: CampanhasMapProps) {
  if (!props.campanhas.some((c) => Number.isFinite(c.centerLat))) return <MapPlaceholder message="As áreas das buscas aparecem aqui." />;
  return <MapGuard><InteractiveCampanhasMap {...props} /></MapGuard>;
}
