"use client";

import { MapPin, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/** UFs com o nome que o Google Ads reconhece. */
const ESTADOS: [string, string][] = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"],
  ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"],
  ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"],
];
const nomeUF = Object.fromEntries(ESTADOS);
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// municípios do IBGE por UF (lista oficial, grafia certa); uma busca por UF por sessão
const cache = new Map<string, Promise<string[]>>();
function municipios(uf: string): Promise<string[]> {
  if (!cache.has(uf)) {
    cache.set(uf, fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
      .then((r) => (r.ok ? (r.json() as Promise<{ nome: string }[]>) : Promise.reject(new Error(String(r.status)))))
      .then((l) => l.map((m) => m.nome))
      .catch((e) => { cache.delete(uf); throw e; }));
  }
  return cache.get(uf)!;
}

/** Locais da campanha: estado + cidades reais do IBGE. Cidade vai como "Senador Canedo, Goiás" (o Google desambigua pelo estado). */
export function LocalPicker({ valor, onChange, disabled }: { valor: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [uf, setUf] = useState(() => ESTADOS.find(([, n]) => valor.some((v) => v === n || v.endsWith(`, ${n}`)))?.[0] ?? "GO");
  const [cidades, setCidades] = useState<string[] | null>(null);
  const [erro, setErro] = useState(false);
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    setCidades(null); setErro(false);
    municipios(uf).then((l) => vivo && setCidades(l), () => vivo && setErro(true));
    return () => { vivo = false; };
  }, [uf]);

  const estado = nomeUF[uf]!;
  const opcoes = useMemo(() => {
    const t = semAcento(q.trim());
    const todas = [`__estado`, "__brasil", ...(cidades ?? [])];
    const filtradas = todas.filter((c) =>
      c === "__estado" ? !t || semAcento(estado).includes(t) || "todo o estado".includes(t)
      : c === "__brasil" ? !t || "brasil".includes(t)
      : !t || semAcento(c).includes(t));
    // quem começa com o texto vem primeiro
    return filtradas.sort((a, b) => Number(!semAcento(a).startsWith(t)) - Number(!semAcento(b).startsWith(t))).slice(0, 9);
  }, [q, cidades, estado]);

  const valorDe = (o: string) => (o === "__estado" ? estado : o === "__brasil" ? "Brasil" : `${o}, ${estado}`);
  const adicionar = (o: string) => {
    onChange([...new Set([...valor, valorDe(o)])]);
    setQ(""); setAtivo(0); campo.current?.focus();
  };

  return (
    <div className="local-picker">
      <div className="cluster" style={{ gap: 6 }}>
        {valor.map((l) => (
          <span key={l} className="chip" data-active>
            <MapPin size={12} aria-hidden />{l}
            {!disabled && <button type="button" aria-label={`Remover ${l}`} onClick={() => onChange(valor.filter((y) => y !== l))} style={{ all: "unset", cursor: "pointer", display: "inline-flex" }}><X size={13} /></button>}
          </span>
        ))}
        {!valor.length && <span className="subtle small">Nenhum local: escolha abaixo.</span>}
      </div>
      {!disabled && (
        <div className="local-busca">
          <select className="select" value={uf} onChange={(e) => setUf(e.target.value)} aria-label="Estado" style={{ width: 92, height: 38 }}>
            {ESTADOS.map(([s, n]) => <option key={s} value={s} title={n}>{s}</option>)}
          </select>
          <div style={{ position: "relative", flex: 1 }}>
            <input ref={campo} className="input-sm" style={{ width: "100%", height: 38 }} value={q} role="combobox" aria-expanded={aberto} aria-controls="local-opcoes" aria-autocomplete="list"
              placeholder={cidades ? `Cidade de ${estado} (${cidades.length} municípios)…` : erro ? "Não consegui carregar as cidades (IBGE)" : "Carregando cidades…"}
              onChange={(e) => { setQ(e.target.value); setAtivo(0); setAberto(true); }} onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 120)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setAberto(true); setAtivo((a) => Math.min(a + 1, opcoes.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
                else if (e.key === "Enter") { e.preventDefault(); if (opcoes[ativo]) adicionar(opcoes[ativo]); }
                else if (e.key === "Escape") setAberto(false);
              }} />
            {aberto && opcoes.length > 0 && (
              <div id="local-opcoes" role="listbox" className="menu local-opcoes">
                {opcoes.map((o, i) => {
                  const v = valorDe(o);
                  const ja = valor.includes(v);
                  return (
                    <button key={o} type="button" role="option" aria-selected={i === ativo} className="menu-item" data-active={i === ativo} disabled={ja}
                      onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAtivo(i)} onClick={() => adicionar(o)}>
                      {o === "__estado" ? <><MapPin aria-hidden /><span style={{ flex: 1 }}>Todo o estado de <b>{estado}</b></span></>
                        : o === "__brasil" ? <><MapPin aria-hidden /><span style={{ flex: 1 }}>Brasil inteiro</span></>
                        : <><Plus aria-hidden /><span style={{ flex: 1 }}>{o} <span className="subtle">· {uf}</span></span></>}
                      {ja && <span className="subtle small">adicionado</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
