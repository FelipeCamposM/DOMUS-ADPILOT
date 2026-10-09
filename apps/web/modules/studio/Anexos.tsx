"use client";

import { Check, Clipboard, Film, ImageIcon, Link2, Paperclip, Plus, Sparkles, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { enviarArquivo } from "../creatives/upload";
import { Popover } from "../shell/Popover";
import { toast } from "../shell/toast";

export interface ArquivoLib { id: string; name: string; type: string }
// preview: URL local (blob:) do arquivo recém-enviado, para mostrar na hora sem baixar de volta
export interface AnexoItem { creativeId: string; uso: "incluir" | "inspiracao"; nota: string; name: string; type: string; preview?: string }
export interface LinkItem { url: string; nota: string }
export interface AnexosValor { assets: AnexoItem[]; links: LinkItem[] }

const MAX = 12;
const ACEITOS = /^(image\/(png|jpeg|webp|gif|svg\+xml)|video\/(mp4|webm|quicktime))$/;
const tamanho = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
interface Envio { key: string; name: string; url: string; video: boolean; size: number; pct: number; pronto: boolean }

/**
 * Arquivos e links do projeto. "Colocar na arte" entra no vídeo/imagem (logo, print, foto, vídeo do produto);
 * "Inspiração" só orienta o estilo. A IA abre e olha as imagens antes de criar. A identidade visual do workspace já vai junto.
 * Entrada: clicar, arrastar para o quadro ou para QUALQUER lugar da página (abre uma área de soltar em tela cheia),
 * ou colar (Ctrl+V) uma imagem. Os envios correm em paralelo, com prévia local e progresso real.
 */
export function Anexos({ valor, onChange, biblioteca, brand }: {
  valor: AnexosValor; onChange: (v: AnexosValor) => void; biblioteca: ArquivoLib[];
  brand: { cores: { hex: string; nome: string }[]; temLogo: boolean; preenchida: boolean };
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const atual = useRef(valor);
  atual.current = valor; // envios terminam depois: sempre acrescentam sobre o valor mais recente
  const [enviando, setEnviando] = useState<Envio[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [recusou, setRecusou] = useState(0);
  const [lib, setLib] = useState(false);
  const [url, setUrl] = useState("");
  const [nota, setNota] = useState("");
  const set = (v: Partial<AnexosValor>) => onChange({ ...atual.current, ...v });
  const anexar = (a: { id: string; name: string; type: string }) => {
    if (valor.assets.some((x) => x.creativeId === a.id)) return;
    if (valor.assets.length >= MAX) return toast.err(`No máximo ${MAX} arquivos por projeto`);
    set({ assets: [...valor.assets, { creativeId: a.id, name: a.name, type: a.type, uso: "incluir", nota: "" }] });
  };

  const enviar = async (files: FileList | File[] | null) => {
    const todos = Array.from(files ?? []);
    const validos = todos.filter((f) => ACEITOS.test(f.type));
    if (validos.length < todos.length) {
      setRecusou((n) => n + 1);
      toast.err(`${todos.length - validos.length} arquivo(s) ignorado(s): envie imagem (PNG, JPG, WEBP, GIF, SVG) ou vídeo (MP4, MOV, WEBM)`);
    }
    const vagas = Math.max(0, MAX - atual.current.assets.length - enviando.length);
    const lista = validos.slice(0, vagas);
    if (validos.length > lista.length) toast.err(`No máximo ${MAX} arquivos por projeto`);
    if (!lista.length) return;
    const fila = lista.map((f) => ({ f, key: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 6)}`, name: f.name, url: URL.createObjectURL(f), video: f.type.startsWith("video/"), size: f.size, pct: 0, pronto: false }));
    setEnviando((x) => [...x, ...fila.map(({ f: _, ...v }) => v)]);
    if (input.current) input.current.value = "";
    const muda = (key: string, p: Partial<Envio>) => setEnviando((x) => x.map((y) => (y.key === key ? { ...y, ...p } : y)));
    await Promise.all(fila.map(async (it) => {
      try {
        const e = await enviarArquivo(it.f, { onProgresso: (pct) => muda(it.key, { pct }) });
        muda(it.key, { pct: 100, pronto: true });
        await new Promise((ok) => setTimeout(ok, 650)); // deixa o "✓" aparecer antes de ir para a lista
        set({ assets: [...atual.current.assets, { creativeId: e.id, name: e.name, type: e.type, uso: "incluir" as const, nota: "", preview: it.url }].slice(0, MAX) });
      } catch (err) {
        URL.revokeObjectURL(it.url);
        toast.err((err as Error).message);
      }
      setEnviando((x) => x.filter((y) => y.key !== it.key));
    }));
  };

  const addUrl = (u: string) => {
    if (atual.current.links.length >= 8) return toast.err("No máximo 8 links");
    if (atual.current.links.some((l) => l.url === u)) return;
    set({ links: [...atual.current.links, { url: u, nota: "" }] });
    toast.ok("Link adicionado");
  };

  // soltar/colar em qualquer lugar da página (só a instância visível: a aba escondida não reage)
  const enviarRef = useRef(enviar);
  enviarRef.current = enviar;
  const addUrlRef = useRef(addUrl);
  addUrlRef.current = addUrl;
  useEffect(() => {
    const visivel = () => !!raiz.current?.offsetParent;
    const temArquivo = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].some((t) => t === "Files" || t === "text/uri-list");
    let profundidade = 0;
    const entra = (e: DragEvent) => { if (!visivel() || !temArquivo(e)) return; e.preventDefault(); profundidade++; setArrastando(true); };
    const sobre = (e: DragEvent) => { if (!visivel() || !temArquivo(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; };
    const sai = (e: DragEvent) => { if (!visivel()) return; profundidade = Math.max(0, profundidade - 1); if (!profundidade || !e.relatedTarget) setArrastando(false); };
    const solta = (e: DragEvent) => {
      if (!visivel() || !temArquivo(e)) return;
      e.preventDefault(); // nunca deixa o navegador abrir o arquivo no lugar da página
      profundidade = 0; setArrastando(false);
      const dt = e.dataTransfer!;
      if (dt.files.length) return void enviarRef.current(dt.files);
      const u = (dt.getData("text/uri-list") || dt.getData("text/plain")).split("\n")[0]?.trim();
      if (u && /^https?:\/\//i.test(u)) addUrlRef.current(u);
    };
    const cola = (e: ClipboardEvent) => {
      if (!visivel()) return;
      const arqs = [...(e.clipboardData?.files ?? [])];
      if (!arqs.length) return; // texto colado segue normal
      e.preventDefault();
      void enviarRef.current(arqs.map((f, i) => (f.name && f.name !== "image.png" ? f : new File([f], `colado-${Date.now().toString(36)}-${i + 1}.${f.type.split("/")[1] ?? "png"}`, { type: f.type }))));
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { profundidade = 0; setArrastando(false); } };
    window.addEventListener("dragenter", entra);
    window.addEventListener("dragover", sobre);
    window.addEventListener("dragleave", sai);
    window.addEventListener("drop", solta);
    window.addEventListener("paste", cola);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("dragenter", entra);
      window.removeEventListener("dragover", sobre);
      window.removeEventListener("dragleave", sai);
      window.removeEventListener("drop", solta);
      window.removeEventListener("paste", cola);
      window.removeEventListener("keydown", esc);
    };
  }, []);

  const addLink = () => {
    try {
      const u = new URL(url.trim());
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      if (valor.links.length >= 8) return toast.err("No máximo 8 links");
      set({ links: [...valor.links, { url: u.toString(), nota: nota.trim() }] });
      setUrl(""); setNota("");
    } catch {
      toast.err("Link inválido (use http:// ou https://)");
    }
  };

  const usados = valor.assets.length + enviando.length;

  return (
    <div ref={raiz} className="panel" data-enter style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, position: "relative" }}>
      {arrastando && typeof document !== "undefined" && createPortal(
        <div className="solta-tela" aria-hidden>
          <div className="solta-alvo">
            <span className="solta-anel" /><span className="solta-anel" style={{ animationDelay: "0.6s" }} />
            <UploadCloud size={46} className="solta-icone" />
            <b style={{ fontSize: 20 }}>Solte para anexar</b>
            <span className="subtle small">Imagens, vídeos ou links · {Math.max(0, MAX - usados)} vaga(s) de {MAX}</span>
          </div>
        </div>, document.body)}
      <div className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Paperclip size={15} aria-hidden /> Arquivos, inspirações e links
        <span className="subtle caption tabular" style={{ marginLeft: "auto", fontWeight: 500 }}>{usados}/{MAX}</span>
      </div>

      <div className="panel" style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, background: "rgb(var(--c-brand) / 0.06)", borderColor: "rgb(var(--c-brand) / 0.25)" }}>
        <Sparkles size={15} aria-hidden style={{ color: "rgb(var(--c-glow))" }} />
        {brand.preenchida ? (
          <span className="small" style={{ flex: 1 }}>
            Identidade visual do workspace aplicada automaticamente{brand.temLogo ? " (com logo)" : ""}
            <span style={{ display: "inline-flex", gap: 4, marginLeft: 8, verticalAlign: "middle" }}>
              {brand.cores.slice(0, 6).map((c) => <i key={c.hex} title={c.nome || c.hex} style={{ width: 14, height: 14, borderRadius: 4, background: c.hex, border: "1px solid rgb(255 255 255 / 0.2)" }} />)}
            </span>
          </span>
        ) : (
          <span className="small" style={{ flex: 1 }}>Este workspace ainda não tem identidade visual. <Link href="/settings#marca" style={{ textDecoration: "underline" }}>Definir cores, fontes e logo</Link></span>
        )}
      </div>

      <input ref={input} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,video/quicktime" onChange={(e) => void enviar(e.target.files)} />
      <button key={recusou} type="button" onClick={() => input.current?.click()} className={`solta-quadro${recusou ? " treme" : ""}`} data-arrastando={arrastando} disabled={usados >= MAX}>
        <span className="solta-quadro-icone"><UploadCloud size={26} aria-hidden /></span>
        <b style={{ fontWeight: 650, fontSize: 15 }}>{usados >= MAX ? "Limite de arquivos atingido" : "Arraste arquivos aqui ou em qualquer lugar da página"}</b>
        <span className="subtle caption">ou <u>clique para escolher</u> · cole uma imagem com <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">V</kbd> · arraste um link do navegador</span>
        <span className="cluster" style={{ gap: 6, justifyContent: "center", marginTop: 2 }}>
          {[["PNG · JPG · WEBP · SVG", ImageIcon], ["MP4 · MOV · WEBM", Film], ["Links", Link2], ["Colar", Clipboard]].map(([t, I]) => {
            const Icone = I as typeof Film;
            return <span key={t as string} className="badge" style={{ gap: 5 }}><Icone size={11} aria-hidden /> {t as string}</span>;
          })}
        </span>
      </button>

      <div className="cluster">
        <div style={{ position: "relative" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLib((v) => !v)} disabled={!biblioteca.length} title={biblioteca.length ? undefined : "A biblioteca de arquivos está vazia"}>
            <Plus aria-hidden /> Da biblioteca ({biblioteca.length})
          </button>
          <Popover open={lib} onClose={() => setLib(false)} width={340}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, maxHeight: 300, overflowY: "auto", padding: 2 }}>
              {biblioteca.map((a) => (
                <button key={a.id} type="button" onClick={() => anexar(a)} title={a.name} className="thumb-card"
                  style={{ aspectRatio: "1", border: valor.assets.some((x) => x.creativeId === a.id) ? "2px solid rgb(var(--c-brand))" : "1px solid rgb(var(--c-border))", cursor: "pointer", padding: 0 }}>
                  {a.type === "IMAGE" ? <img src={`/api/creatives/${a.id}/file`} alt={a.name} loading="lazy" /> : <span style={{ display: "grid", placeItems: "center", height: "100%" }}><Film size={20} aria-hidden /></span>}
                </button>
              ))}
            </div>
          </Popover>
        </div>
        <span className="subtle caption">Logo, prints do sistema, fotos do produto, vídeos curtos. A IA olha cada imagem antes de criar.</span>
      </div>

      {enviando.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 10 }}>
          {enviando.map((x) => (
            <div key={x.key} className="envio surge-escala" title={x.name} data-pronto={x.pronto}>
              <div className="thumb-card" style={{ aspectRatio: "1", position: "relative" }}>
                {x.video ? <video src={`${x.url}#t=0.5`} muted preload="metadata" /> : <img src={x.url} alt="" />}
                <span className="envio-veu">
                  {x.pronto ? <Check size={26} className="envio-ok" aria-label="Enviado" /> : (
                    <svg viewBox="0 0 36 36" width="40" height="40" aria-label={`Enviando ${x.name}: ${x.pct}%`}>
                      <circle cx="18" cy="18" r="15" fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15" fill="none" stroke="url(#envio-grad)" strokeWidth="3" strokeLinecap="round" pathLength={100} strokeDasharray={`${Math.max(2, x.pct)} 100`} transform="rotate(-90 18 18)" style={{ transition: "stroke-dasharray .3s" }} />
                      <defs><linearGradient id="envio-grad" x1="0" x2="1"><stop offset="0" stopColor="#c084fc" /><stop offset="1" stopColor="#7c3aed" /></linearGradient></defs>
                      <text x="18" y="21.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">{x.pct}%</text>
                    </svg>
                  )}
                </span>
              </div>
              <div className="caption" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 4 }}>{x.name}</div>
              <div className="subtle" style={{ fontSize: 10.5 }}>{tamanho(x.size)}</div>
            </div>
          ))}
        </div>
      )}

      {valor.assets.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {valor.assets.map((a, i) => (
            <div key={a.creativeId} className="panel surge" style={{ padding: 8, display: "grid", gridTemplateColumns: "72px 1fr auto", gap: 10, alignItems: "center", background: "rgb(var(--c-bg-elevated) / 0.5)" }}>
              <div className="thumb-card anexo-thumb" style={{ width: 72, height: 72, position: "relative" }}>
                {a.type === "IMAGE" ? <img src={a.preview ?? `/api/creatives/${a.creativeId}/file`} alt="" />
                  : <>
                    <video src={`${a.preview ?? `/api/creatives/${a.creativeId}/file`}#t=0.5`} muted loop playsInline preload="metadata"
                      onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => e.currentTarget.pause()} />
                    <Film size={13} aria-hidden style={{ position: "absolute", right: 4, bottom: 4, filter: "drop-shadow(0 1px 2px #000)" }} />
                  </>}
              </div>
              <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                <div className="cluster" style={{ gap: 6, flexWrap: "nowrap" }}>
                  <b style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{a.name}</b>
                  {(["incluir", "inspiracao"] as const).map((u) => (
                    <button key={u} type="button" className="chip" style={{ height: 26, fontSize: 11.5 }} data-active={a.uso === u}
                      onClick={() => set({ assets: valor.assets.map((x, j) => (j === i ? { ...x, uso: u } : x)) })}>{u === "incluir" ? "Colocar na arte" : "Inspiração"}</button>
                  ))}
                </div>
                <input className="input-sm" placeholder={a.uso === "incluir" ? "Onde/como usar (ex.: print na cena 2, logo no final)" : "O que inspira (ex.: estas cores, este layout)"}
                  value={a.nota} maxLength={300} onChange={(e) => set({ assets: valor.assets.map((x, j) => (j === i ? { ...x, nota: e.target.value } : x)) })} />
              </div>
              <button type="button" className="btn btn-ghost btn-xs" aria-label={`Remover ${a.name}`} onClick={() => { if (a.preview) URL.revokeObjectURL(a.preview); set({ assets: valor.assets.filter((_, j) => j !== i) }); }}><X aria-hidden /></button>
            </div>
          ))}
        </div>
      )}

      <div className="cluster" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "2 1 220px" }}>
          <label className="label" htmlFor="link-url">Link (site, post, referência)</label>
          <input id="link-url" className="input-sm" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())} />
        </div>
        <div className="field" style={{ flex: "2 1 200px" }}>
          <label className="label" htmlFor="link-nota">Para quê</label>
          <input id="link-nota" className="input-sm" placeholder="Ex.: site do produto, inspiração de estilo" value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} />
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addLink} disabled={!url.trim()}><Link2 aria-hidden /> Adicionar</button>
      </div>
      {valor.links.map((l, i) => (
        <div key={l.url + i} className="cluster surge" style={{ gap: 8 }}>
          <Link2 size={14} aria-hidden className="text-tertiary" />
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="small" style={{ textDecoration: "underline", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.url}</a>
          {l.nota && <span className="subtle caption">· {l.nota}</span>}
          <button type="button" className="btn btn-ghost btn-xs" aria-label="Remover link" onClick={() => set({ links: valor.links.filter((_, j) => j !== i) })}><X aria-hidden /></button>
        </div>
      ))}
      {valor.links.length > 0 && <p className="subtle caption">O worker lê o texto público de cada página (sem login) e passa para a IA como contexto.</p>}
    </div>
  );
}

/** Formato enviado às actions (só ids/uso/nota; nomes ficam na tela). */
export const paraEnvio = (v: AnexosValor) => ({ assets: v.assets.map(({ creativeId, uso, nota }) => ({ creativeId, uso, nota })), links: v.links });
