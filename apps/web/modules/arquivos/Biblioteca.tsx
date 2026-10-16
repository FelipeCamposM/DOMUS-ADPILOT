"use client";

import { Check, Cloud, ExternalLink, Film, Folder, FolderInput, FolderOpen, FolderPlus, Images, Loader2, Pencil, Search, Trash2, Upload, X, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apagarCriativo } from "../creatives/actions";
import { enviarArquivo } from "../creatives/upload";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { apagarPasta, criarPasta, listarArquivos, moverArquivos, renomearPasta, type ItemArquivo, type Pasta } from "./actions";

export type { ItemArquivo };
type Tipo = "IMAGE" | "VIDEO";

const mb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const arquivo = (id: string) => `/api/creatives/${id}/file`;

/**
 * Biblioteca de imagens e vídeos do workspace, com pastas e busca.
 * "gerenciar" (página Arquivos): seleciona vários, move entre pastas (botão ou arrastando para a pasta), apaga os enviados.
 * "escolher" (modal no Studio, Instagram e marca): marca até `max` itens e devolve em onEscolher, na ordem marcada.
 * Envio do computador cai na pasta aberta.
 */
export function Biblioteca({ modo, tipos = ["IMAGE", "VIDEO"], max = 12, jaTem = [], podeEditar, onEscolher, onCancelar }: {
  modo: "gerenciar" | "escolher"; tipos?: Tipo[]; max?: number; jaTem?: string[]; podeEditar: boolean;
  onEscolher?: (itens: ItemArquivo[]) => void; onCancelar?: () => void;
}) {
  const [pasta, setPasta] = useState<string>("todas");
  const [q, setQ] = useState("");
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<Tipo | "todos">(tipos.length === 1 ? tipos[0]! : "todos");
  const [origem, setOrigem] = useState<"todos" | "enviados" | "gerados">("todos");
  const [dados, setDados] = useState<{ itens: ItemArquivo[]; pastas: Pasta[] } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [nova, setNova] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null); // pasta sob o arraste
  const [enviando, setEnviando] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const recarregar = () => setVersao((v) => v + 1);

  useEffect(() => { const t = setTimeout(() => setBusca(q), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    void listarArquivos({ q: busca, pasta, tipo, origem }).then((r) => {
      if (!vivo) return;
      if (r.ok) setDados(r.data); else toast.err(r.error);
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [busca, pasta, tipo, origem, versao]);

  const itens = (dados?.itens ?? []).filter((i) => tipos.includes(i.type) && !jaTem.includes(i.id));
  const pastas = dados?.pastas ?? [];
  const pastaAberta = pastas.find((p) => p.id === pasta);
  const limite = modo === "escolher" ? max : 400;
  const alternar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : limite === 1 ? [id] : s.length < limite ? [...s, id] : s));

  const acao = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg?: string) => {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (!r.ok) { toast.err(r.error ?? "Erro"); return false; }
    if (msg) toast.ok(msg);
    recarregar();
    return true;
  };
  const mover = async (ids: string[], destino: string | null) => {
    const nome = destino ? pastas.find((p) => p.id === destino)?.nome : "Sem pasta";
    if (await acao(() => moverArquivos(ids, destino), `${ids.length} arquivo(s) em “${nome}”`)) setSel([]);
  };

  const enviar = async (files: FileList | null) => {
    const novos: string[] = [];
    for (const f of Array.from(files ?? [])) {
      try {
        setEnviando(0);
        novos.push((await enviarArquivo(f, { pastaId: pastaAberta?.id ?? null, onProgresso: setEnviando })).id);
      } catch (e) { toast.err((e as Error).message); }
    }
    setEnviando(null);
    if (input.current) input.current.value = "";
    if (!novos.length) return;
    toast.ok(`${novos.length} arquivo(s) enviado(s)${pastaAberta ? ` para “${pastaAberta.nome}”` : ""}`);
    if (modo === "escolher") setSel((s) => [...s, ...novos].slice(-limite));
    recarregar();
  };

  const escolhidos = sel.map((id) => itens.find((i) => i.id === id)).filter((i): i is ItemArquivo => !!i);
  const soEnviados = escolhidos.length > 0 && escolhidos.every((i) => i.enviado);

  const pastaBotao = (id: string, nome: string, icone: React.ReactNode, n?: number) => (
    <button key={id} type="button" className="bib-pasta" aria-current={pasta === id} data-alvo={alvo === id}
      onClick={() => { setPasta(id); setSel(modo === "escolher" ? sel : []); }}
      onDragOver={(e) => { if (podeEditar && id !== "todas") { e.preventDefault(); setAlvo(id); } }}
      onDragLeave={() => setAlvo((a) => (a === id ? null : a))}
      onDrop={(e) => { e.preventDefault(); setAlvo(null); const ids = JSON.parse(e.dataTransfer.getData("application/x-arquivos") || "[]") as string[]; if (ids.length) void mover(ids, id === "sem" ? null : id); }}>
      {icone}<span>{nome}</span>{n != null && <small>{n}</small>}
    </button>
  );

  return (
    <div className="bib" data-modo={modo}>
      <aside className="bib-lado">
        {pastaBotao("todas", "Todos os arquivos", <Images size={15} aria-hidden />)}
        {pastaBotao("sem", "Sem pasta", <FolderOpen size={15} aria-hidden />)}
        {pastas.length > 0 && <div className="bib-rotulo">Pastas</div>}
        {pastas.map((p) => editando?.id === p.id ? (
          <form key={p.id} className="bib-nova" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); void acao(() => renomearPasta(p.id, editando.nome), "Pasta renomeada").then((ok) => ok && setEditando(null)); }}>
            <input className="input-sm" autoFocus maxLength={60} value={editando.nome} onChange={(e) => setEditando({ id: p.id, nome: e.target.value })} onKeyDown={(e) => e.key === "Escape" && setEditando(null)} aria-label="Novo nome da pasta" />
          </form>
        ) : (
          <div key={p.id} className="bib-pasta-linha">
            {pastaBotao(p.id, p.nome, <Folder size={15} aria-hidden />, p.n)}
            {podeEditar && modo === "gerenciar" && (
              <span className="bib-pasta-acoes">
                <button type="button" className="btn btn-ghost btn-xs" aria-label={`Renomear ${p.nome}`} onClick={() => setEditando({ id: p.id, nome: p.nome })}><Pencil aria-hidden /></button>
                <button type="button" className="btn btn-ghost btn-xs" aria-label={`Apagar a pasta ${p.nome}`} disabled={ocupado}
                  onClick={() => confirm(`Apagar a pasta “${p.nome}”? Os ${p.n} arquivo(s) dela continuam na biblioteca, sem pasta.`) && void acao(() => apagarPasta(p.id), "Pasta apagada").then((ok) => ok && pasta === p.id && setPasta("todas"))}><Trash2 aria-hidden /></button>
              </span>
            )}
          </div>
        ))}
        {podeEditar && (nova == null ? (
          <button type="button" className="bib-pasta bib-criar" onClick={() => setNova("")}><FolderPlus size={15} aria-hidden /><span>Nova pasta</span></button>
        ) : (
          <form className="bib-nova" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); void criarPasta(nova).then((r) => { if (!r.ok) return toast.err(r.error); setNova(null); setPasta(r.data); recarregar(); }); }}>
            <input className="input-sm" autoFocus maxLength={60} placeholder="Nome da pasta" value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setNova(null)} aria-label="Nome da nova pasta" />
          </form>
        ))}
        {podeEditar && modo === "gerenciar" && <p className="subtle caption bib-dica">Arraste arquivos para uma pasta para mover.</p>}
      </aside>

      <section className="bib-main">
        <div className="bib-barra">
          <label className="bib-busca"><Search size={15} aria-hidden /><input placeholder={`Pesquisar em ${pastaAberta ? `“${pastaAberta.nome}”` : pasta === "sem" ? "Sem pasta" : "todos os arquivos"}`} value={q} onChange={(e) => setQ(e.target.value)} /></label>
          {tipos.length > 1 && (["todos", "IMAGE", "VIDEO"] as const).map((t) => <button key={t} type="button" className="chip" data-active={tipo === t} onClick={() => setTipo(t)}>{t === "todos" ? "Tudo" : t === "IMAGE" ? "Imagens" : "Vídeos"}</button>)}
          <select className="select" value={origem} onChange={(e) => setOrigem(e.target.value as typeof origem)} aria-label="Origem">
            <option value="todos">Enviados e gerados</option><option value="enviados">Só enviados</option><option value="gerados">Só gerados pela IA</option>
          </select>
          {podeEditar && <>
            <input ref={input} type="file" hidden multiple={limite > 1} accept={tipos.map((t) => (t === "IMAGE" ? "image/png,image/jpeg,image/webp,image/gif,image/svg+xml" : "video/mp4,video/webm,video/quicktime")).join(",")} onChange={(e) => void enviar(e.target.files)} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={enviando !== null}>
              {enviando !== null ? <><Loader2 className="animate-spin" aria-hidden /> {enviando}%</> : <><Upload aria-hidden /> Enviar</>}
            </button>
          </>}
        </div>

        <div className="bib-grade" aria-busy={carregando}>
          {carregando && !dados && Array.from({ length: 8 }).map((_, i) => <div key={i} className="bib-card skeleton" style={{ aspectRatio: "1" }} />)}
          {dados && !itens.length && <p className="subtle small bib-vazio">{busca ? `Nada encontrado para “${busca}”.` : pastaAberta ? "Pasta vazia. Envie arquivos ou arraste para cá." : "Nenhum arquivo ainda."}</p>}
          {itens.map((i) => {
            const n = sel.indexOf(i.id);
            return (
              <div key={i.id} className="bib-card" data-on={n >= 0} draggable={podeEditar && modo === "gerenciar"}
                onDragStart={(e) => e.dataTransfer.setData("application/x-arquivos", JSON.stringify(n >= 0 ? sel : [i.id]))}>
                <button type="button" className="bib-thumb" onClick={() => alternar(i.id)} title={i.name} aria-pressed={n >= 0}>
                  {i.type === "IMAGE" || i.thumb ? <img src={i.type === "IMAGE" ? arquivo(i.id) : `${arquivo(i.id)}?kind=thumb`} alt="" loading="lazy" />
                    : <video src={`${arquivo(i.id)}#t=0.5`} muted playsInline preload="metadata" />}
                  {i.type === "VIDEO" && <span className="bib-dur"><Film size={11} aria-hidden />{i.duration_ms ? `${Math.round(i.duration_ms / 1000)}s` : ""}</span>}
                  <span className="bib-onde" data-drive={i.arquivado} title={i.arquivado ? (i.previa ? "Original no Drive; aqui aparece a prévia leve" : "Original no Drive; volta ao abrir (PC ligado)") : "No R2: abre na hora"}>
                    {i.arquivado ? <><Cloud size={11} aria-hidden /> Drive</> : <><Zap size={11} aria-hidden /> R2</>}
                  </span>
                  {n >= 0 && <span className="bib-check">{modo === "escolher" && limite > 1 ? n + 1 : <Check size={13} aria-hidden />}</span>}
                </button>
                <div className="bib-info">
                  <span title={i.name}>{i.name}</span>
                  <a href={`${arquivo(i.id)}${i.arquivado ? "?original=1" : ""}`} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${i.name}`} className="bib-abrir"><ExternalLink size={13} aria-hidden /></a>
                </div>
                <small className="subtle">{[i.width && `${i.width}×${i.height}`, i.size && mb(i.size), !i.enviado && "IA"].filter(Boolean).join(" · ")}</small>
              </div>
            );
          })}
        </div>

        {modo === "gerenciar" && sel.length > 0 && (
          <div className="bib-acoes">
            <b>{sel.length} selecionado(s)</b>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSel([])}><X aria-hidden /> Limpar</button>
            <span style={{ flex: 1 }} />
            {podeEditar && <>
              <label className="cluster" style={{ gap: 6 }}><FolderInput size={15} aria-hidden />
                <select className="select" value="" disabled={ocupado} onChange={(e) => e.target.value && void mover(sel, e.target.value === "sem" ? null : e.target.value)} aria-label="Mover para a pasta">
                  <option value="">Mover para…</option><option value="sem">Sem pasta</option>{pastas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </label>
              <button type="button" className="btn btn-ghost btn-xs" disabled={ocupado || !soEnviados} title={soEnviados ? undefined : "Só arquivos enviados são apagados aqui; os gerados pela IA são apagados no projeto do Studio"}
                onClick={() => confirm(`Apagar ${sel.length} arquivo(s)? Projetos que já usaram continuam como estão.`) && void (async () => {
                  setOcupado(true);
                  for (const id of sel) { const r = await apagarCriativo(id); if (!r.ok) toast.err(r.error); }
                  setOcupado(false); setSel([]); toast.ok("Apagado"); recarregar();
                })()}><Trash2 aria-hidden /> Apagar</button>
            </>}
          </div>
        )}
        {modo === "escolher" && (
          <div className="bib-acoes">
            <span className="subtle small">{limite > 1 ? `${sel.length} de até ${limite}` : "Escolha 1"}</span>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelar}>Cancelar</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!escolhidos.length} onClick={() => onEscolher?.(escolhidos)}><Check aria-hidden /> Usar {escolhidos.length > 1 ? `${escolhidos.length} arquivos` : "arquivo"}</button>
          </div>
        )}
      </section>
    </div>
  );
}

/** A biblioteca num modal, para escolher arquivos sem sair da tela. */
export function BibliotecaModal({ open, onClose, titulo = "Escolher da biblioteca", ...p }: Omit<Parameters<typeof Biblioteca>[0], "modo" | "onCancelar"> & { open: boolean; onClose: () => void; titulo?: string }) {
  return (
    <Dialog open={open} onClose={onClose} title={titulo} largo>
      {open && <Biblioteca modo="escolher" {...p} onCancelar={onClose} onEscolher={(i) => { p.onEscolher?.(i); onClose(); }} />}
    </Dialog>
  );
}
