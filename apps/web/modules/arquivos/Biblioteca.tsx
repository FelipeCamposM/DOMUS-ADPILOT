"use client";

import { Check, CheckSquare, ExternalLink, Film, Folder, FolderInput, FolderOpen, FolderPlus, Images, Loader2, Pencil, Search, Square, Trash2, Upload, X, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UsoArmazenamento } from "@/lib/armazenamento";
import { enviarArquivo } from "../creatives/upload";
import { confirmar } from "../shell/confirmar";
import { Dialog } from "../shell/Dialog";
import { MenuContexto, type ItemMenu, type Menu } from "../shell/MenuContexto";
import { Seletor } from "../shell/Seletor";
import { toast } from "../shell/toast";
import { apagarCriativos } from "../studio/actions";
import { apagarPasta, criarPasta, listarArquivos, moverArquivos, renomearArquivo, renomearPasta, type ItemArquivo, type Pasta } from "./actions";
import { DriveIcone } from "./DriveIcone";
import { LocaisArmazenamento, type Onde } from "./UsoR2";

export type { ItemArquivo };
type Tipo = "IMAGE" | "VIDEO";

const mb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const arquivo = (id: string) => `/api/creatives/${id}/file`;
const ORIGENS = [{ valor: "todos", rotulo: "Enviados e gerados" }, { valor: "enviados", rotulo: "Só enviados" }, { valor: "gerados", rotulo: "Só gerados pela IA" }];
const ic = (I: typeof Folder) => <I size={15} aria-hidden />;

/**
 * Biblioteca de imagens e vídeos do workspace, com pastas e busca.
 * "gerenciar" (página Arquivos): R2 e Drive separados, seleciona vários, move (botão, arrastando ou botão direito), renomeia e apaga.
 * "escolher" (modal no Studio, Instagram e marca): marca até `max` itens e devolve em onEscolher, na ordem marcada.
 * Envio do computador cai na pasta aberta.
 */
export function Biblioteca({ modo, tipos = ["IMAGE", "VIDEO"], max = 12, jaTem = [], podeEditar, onEscolher, onCancelar, uso }: {
  modo: "gerenciar" | "escolher"; tipos?: Tipo[]; max?: number; jaTem?: string[]; podeEditar: boolean;
  onEscolher?: (itens: ItemArquivo[]) => void; onCancelar?: () => void;
  /** página Arquivos: cartões de R2 e Drive que também filtram a lista */
  uso?: { uso: UsoArmazenamento; limiteGb: number };
}) {
  const [pasta, setPasta] = useState<string>("todas");
  const [q, setQ] = useState("");
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<Tipo | "todos">(tipos.length === 1 ? tipos[0]! : "todos");
  const [origem, setOrigem] = useState<"todos" | "enviados" | "gerados">("todos");
  const [onde, setOnde] = useState<Onde>("todos");
  const [dados, setDados] = useState<{ itens: ItemArquivo[]; pastas: Pasta[] } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [nova, setNova] = useState<string | null>(null);
  const [paraNova, setParaNova] = useState<string[] | null>(null); // arquivos que vão para a pasta sendo criada
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null); // pasta sob o arraste
  const [enviando, setEnviando] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const fecharMenu = useCallback(() => setMenu(null), []);
  const input = useRef<HTMLInputElement>(null);
  const recarregar = () => setVersao((v) => v + 1);
  const gerenciar = modo === "gerenciar" && podeEditar;

  useEffect(() => { const t = setTimeout(() => setBusca(q), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    void listarArquivos({ q: busca, pasta, tipo, origem, onde }).then((r) => {
      if (!vivo) return;
      if (r.ok) setDados(r.data); else toast.err(r.error);
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [busca, pasta, tipo, origem, onde, versao]);

  const itens = (dados?.itens ?? []).filter((i) => tipos.includes(i.type) && !jaTem.includes(i.id));
  const pastas = dados?.pastas ?? [];
  const pastaAberta = pastas.find((p) => p.id === pasta);
  const limite = modo === "escolher" ? max : 400;
  const alternar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : limite === 1 ? [id] : s.length < limite ? [...s, id] : s));
  const abrir = (i: ItemArquivo) => window.open(`${arquivo(i.id)}${i.arquivado ? "?original=1" : ""}`, "_blank", "noopener");

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
    const nome = destino ? pastas.find((p) => p.id === destino)?.nome ?? "nova pasta" : "Sem pasta";
    if (await acao(() => moverArquivos(ids, destino), `${ids.length} arquivo(s) em “${nome}”`)) setSel([]);
  };
  const apagar = async (ids: string[]) => {
    if (!(await confirmar(`Apagar ${ids.length === 1 ? "este arquivo" : `${ids.length} arquivos`}? Some da biblioteca e do R2; não dá para desfazer.`))) return;
    setOcupado(true);
    const r = await apagarCriativos(ids.map((id) => [id]));
    setOcupado(false);
    if (!r.ok) { toast.err(r.error); return; }
    toast.ok(`${r.data.apagados} apagado(s)${r.data.pulados ? ` · ${r.data.pulados} não (em uso ou gerando)` : ""}`);
    setSel((s) => s.filter((x) => !ids.includes(x)));
    recarregar();
  };
  const novaPasta = (com: string[] | null = null) => { setParaNova(com); setNova(""); };
  const criar = async (nome: string) => {
    const r = await criarPasta(nome);
    if (!r.ok) { toast.err(r.error); return; }
    setNova(null);
    if (paraNova?.length) { await mover(paraNova, r.data); setParaNova(null); return; }
    setPasta(r.data);
    recarregar();
  };
  const apagarAPasta = async (p: Pasta) => {
    if (!(await confirmar(`Apagar a pasta “${p.nome}”? Os ${p.n} arquivo(s) dela continuam na biblioteca, sem pasta.`))) return;
    if ((await acao(() => apagarPasta(p.id), "Pasta apagada")) && pasta === p.id) setPasta("todas");
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

  // botão direito
  const destinos = (ids: string[]): ItemMenu[] => [
    { secao: "Mover para" },
    ...(pasta !== "sem" ? [{ rotulo: "Sem pasta", icone: ic(FolderOpen), onClick: () => void mover(ids, null) }] : []),
    ...pastas.filter((p) => p.id !== pasta).map((p) => ({ rotulo: p.nome, icone: ic(FolderInput), onClick: () => void mover(ids, p.id) })),
    { rotulo: "Nova pasta…", icone: ic(FolderPlus), onClick: () => novaPasta(ids) },
  ];
  const menuArquivo = (e: React.MouseEvent, i: ItemArquivo) => {
    if (!gerenciar) return;
    e.preventDefault();
    const marcado = sel.includes(i.id);
    const ids = marcado ? sel : [i.id];
    const n = ids.length;
    setMenu({ x: e.clientX, y: e.clientY, itens: [
      { rotulo: "Abrir", icone: ic(ExternalLink), onClick: () => abrir(i) },
      { rotulo: marcado ? "Desmarcar" : "Selecionar", icone: ic(marcado ? Square : CheckSquare), onClick: () => alternar(i.id) },
      { rotulo: "Selecionar tudo", icone: ic(CheckSquare), onClick: () => setSel(itens.map((x) => x.id)), desativado: sel.length === itens.length },
      ...(n === 1 ? [{ rotulo: "Renomear", icone: ic(Pencil), onClick: () => setRenomeando({ id: i.id, nome: i.name }) }] : []),
      "sep", ...destinos(ids), "sep",
      { rotulo: n > 1 ? `Apagar ${n} arquivos` : "Apagar", icone: ic(Trash2), perigo: true, onClick: () => void apagar(ids) },
    ] });
  };
  const menuGrade = (e: React.MouseEvent) => {
    if (!gerenciar || (e.target as HTMLElement).closest(".bib-card")) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, itens: [
      { rotulo: "Nova pasta", icone: ic(FolderPlus), onClick: () => novaPasta() },
      { rotulo: "Enviar arquivos", icone: ic(Upload), onClick: () => input.current?.click() },
      "sep",
      { rotulo: "Selecionar tudo", icone: ic(CheckSquare), onClick: () => setSel(itens.map((x) => x.id)), desativado: !itens.length },
      { rotulo: "Limpar seleção", icone: ic(X), onClick: () => setSel([]), desativado: !sel.length },
    ] });
  };
  const menuPasta = (e: React.MouseEvent, p?: Pasta) => {
    if (!gerenciar) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, itens: p ? [
      { rotulo: "Abrir", icone: ic(FolderOpen), onClick: () => { setPasta(p.id); setSel([]); } },
      { rotulo: "Renomear", icone: ic(Pencil), onClick: () => setEditando({ id: p.id, nome: p.nome }) },
      ...(sel.length ? [{ rotulo: `Mover ${sel.length} selecionado(s) para cá`, icone: ic(FolderInput), onClick: () => void mover(sel, p.id) }] : []),
      "sep",
      { rotulo: "Apagar pasta", icone: ic(Trash2), perigo: true, onClick: () => void apagarAPasta(p) },
    ] : [{ rotulo: "Nova pasta", icone: ic(FolderPlus), onClick: () => novaPasta() }] });
  };

  const pastaBotao = (id: string, nome: string, icone: React.ReactNode, n?: number, p?: Pasta) => (
    <button key={id} type="button" className="bib-pasta" aria-current={pasta === id} data-alvo={alvo === id}
      onClick={() => { setPasta(id); setSel(modo === "escolher" ? sel : []); }}
      onContextMenu={(e) => menuPasta(e, p)}
      onDragOver={(e) => { if (podeEditar && id !== "todas") { e.preventDefault(); setAlvo(id); } }}
      onDragLeave={() => setAlvo((a) => (a === id ? null : a))}
      onDrop={(e) => { e.preventDefault(); setAlvo(null); const ids = JSON.parse(e.dataTransfer.getData("application/x-arquivos") || "[]") as string[]; if (ids.length) void mover(ids, id === "sem" ? null : id); }}>
      {icone}<span>{nome}</span>{n != null && <small>{n}</small>}
    </button>
  );

  const cartao = (i: ItemArquivo) => {
    const n = sel.indexOf(i.id);
    return (
      <div key={i.id} className="bib-card" data-on={n >= 0} draggable={gerenciar}
        onDragStart={(e) => e.dataTransfer.setData("application/x-arquivos", JSON.stringify(n >= 0 ? sel : [i.id]))}
        onContextMenu={(e) => menuArquivo(e, i)}>
        <button type="button" className="bib-thumb" onClick={() => alternar(i.id)} title={i.name} aria-pressed={n >= 0}
          onDoubleClick={() => modo === "gerenciar" && abrir(i)}>
          {i.type === "IMAGE" || i.thumb ? <img src={i.type === "IMAGE" ? arquivo(i.id) : `${arquivo(i.id)}?kind=thumb`} alt="" loading="lazy" />
            : <video src={`${arquivo(i.id)}#t=0.5`} muted playsInline preload="metadata" />}
          {i.type === "VIDEO" && <span className="bib-dur"><Film size={11} aria-hidden />{i.duration_ms ? `${Math.round(i.duration_ms / 1000)}s` : ""}</span>}
          <span className="bib-onde" data-drive={i.arquivado} title={i.arquivado ? (i.previa ? "Original no Google Drive; aqui aparece a prévia leve" : "Original no Google Drive; volta ao abrir (PC ligado)") : "No Cloudflare R2: abre na hora"}>
            {i.arquivado ? <><DriveIcone size={11} /> Drive</> : <><Zap size={11} aria-hidden /> R2</>}
          </span>
          {n >= 0 && <span className="bib-check">{modo === "escolher" && limite > 1 ? n + 1 : <Check size={13} aria-hidden />}</span>}
        </button>
        {renomeando?.id === i.id ? (
          <form onSubmit={(e) => { e.preventDefault(); void acao(() => renomearArquivo(i.id, renomeando.nome), "Arquivo renomeado").then((ok) => ok && setRenomeando(null)); }}>
            <input className="input-sm bib-renomear" autoFocus maxLength={120} value={renomeando.nome} aria-label="Novo nome do arquivo"
              onChange={(e) => setRenomeando({ id: i.id, nome: e.target.value })} onKeyDown={(e) => e.key === "Escape" && setRenomeando(null)} />
          </form>
        ) : (
          <div className="bib-info">
            <span title={i.name}>{i.name}</span>
            <a href={`${arquivo(i.id)}${i.arquivado ? "?original=1" : ""}`} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${i.name}`} className="bib-abrir"><ExternalLink size={13} aria-hidden /></a>
          </div>
        )}
        <small className="subtle">{[i.width && `${i.width}×${i.height}`, i.size && mb(i.size), !i.enviado && "IA"].filter(Boolean).join(" · ")}</small>
      </div>
    );
  };
  // na página Arquivos, com "Todos", R2 e Drive aparecem em blocos separados
  const separar = modo === "gerenciar" && onde === "todos";
  const noR2 = itens.filter((i) => !i.arquivado), noDrive = itens.filter((i) => i.arquivado);

  return (
    <>
    {uso && <LocaisArmazenamento uso={uso.uso} limiteGb={uso.limiteGb} onde={onde} setOnde={(o) => { setOnde(o); setSel([]); }} />}
    <div className="bib" data-modo={modo}>
      <aside className="bib-lado" onContextMenu={(e) => menuPasta(e)}>
        {pastaBotao("todas", "Todos os arquivos", <Images size={15} aria-hidden />)}
        {pastaBotao("sem", "Sem pasta", <FolderOpen size={15} aria-hidden />)}
        {pastas.length > 0 && <div className="bib-rotulo">Pastas</div>}
        {pastas.map((p) => editando?.id === p.id ? (
          <form key={p.id} className="bib-nova" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); void acao(() => renomearPasta(p.id, editando.nome), "Pasta renomeada").then((ok) => ok && setEditando(null)); }}>
            <input className="input-sm" autoFocus maxLength={60} value={editando.nome} onChange={(e) => setEditando({ id: p.id, nome: e.target.value })} onKeyDown={(e) => e.key === "Escape" && setEditando(null)} aria-label="Novo nome da pasta" />
          </form>
        ) : (
          <div key={p.id} className="bib-pasta-linha">
            {pastaBotao(p.id, p.nome, <Folder size={15} aria-hidden />, p.n, p)}
            {gerenciar && (
              <span className="bib-pasta-acoes">
                <button type="button" className="btn btn-ghost btn-xs" aria-label={`Renomear ${p.nome}`} onClick={() => setEditando({ id: p.id, nome: p.nome })}><Pencil aria-hidden /></button>
                <button type="button" className="btn btn-ghost btn-xs" aria-label={`Apagar a pasta ${p.nome}`} disabled={ocupado} onClick={() => void apagarAPasta(p)}><Trash2 aria-hidden /></button>
              </span>
            )}
          </div>
        ))}
        {podeEditar && (nova == null ? (
          <button type="button" className="bib-pasta bib-criar" onClick={() => novaPasta()}><FolderPlus size={15} aria-hidden /><span>Nova pasta</span></button>
        ) : (
          <form className="bib-nova" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); void criar(nova); }}>
            <input className="input-sm" autoFocus maxLength={60} placeholder={paraNova?.length ? `Pasta para ${paraNova.length} arquivo(s)` : "Nome da pasta"} value={nova} onChange={(e) => setNova(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setNova(null); setParaNova(null); } }} aria-label="Nome da nova pasta" />
          </form>
        ))}
        {gerenciar && <p className="subtle caption bib-dica">Arraste para uma pasta para mover. Botão direito abre as opções.</p>}
      </aside>

      <section className="bib-main">
        <div className="bib-barra">
          <label className="bib-busca"><Search size={15} aria-hidden /><input placeholder={`Pesquisar em ${pastaAberta ? `“${pastaAberta.nome}”` : pasta === "sem" ? "Sem pasta" : "todos os arquivos"}`} value={q} onChange={(e) => setQ(e.target.value)} /></label>
          {tipos.length > 1 && (["todos", "IMAGE", "VIDEO"] as const).map((t) => <button key={t} type="button" className="chip" data-active={tipo === t} onClick={() => setTipo(t)}>{t === "todos" ? "Tudo" : t === "IMAGE" ? "Imagens" : "Vídeos"}</button>)}
          <Seletor ariaLabel="Origem" valor={origem} opcoes={ORIGENS} onChange={(v) => setOrigem(v as typeof origem)} className="seletor-alto" />
          {!uso && <Seletor ariaLabel="Onde está" valor={onde} opcoes={[{ valor: "todos", rotulo: "R2 e Drive" }, { valor: "r2", rotulo: "Só no R2" }, { valor: "drive", rotulo: "Só no Drive" }]} onChange={(v) => setOnde(v as Onde)} className="seletor-alto" />}
          {podeEditar && <>
            <input ref={input} type="file" hidden multiple={limite > 1} accept={tipos.map((t) => (t === "IMAGE" ? "image/png,image/jpeg,image/webp,image/gif,image/svg+xml" : "video/mp4,video/webm,video/quicktime")).join(",")} onChange={(e) => void enviar(e.target.files)} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={enviando !== null}>
              {enviando !== null ? <><Loader2 className="animate-spin" aria-hidden /> {enviando}%</> : <><Upload aria-hidden /> Enviar</>}
            </button>
          </>}
        </div>

        <div className="bib-grade" aria-busy={carregando} onContextMenu={menuGrade}>
          {carregando && !dados && Array.from({ length: 8 }).map((_, i) => <div key={i} className="bib-card skeleton" style={{ aspectRatio: "1" }} />)}
          {dados && !itens.length && <p className="subtle small bib-vazio">{busca ? `Nada encontrado para “${busca}”.` : pastaAberta ? "Pasta vazia. Envie arquivos ou arraste para cá." : onde === "drive" ? "Nada arquivado no Drive." : "Nenhum arquivo ainda."}</p>}
          {separar ? <>
            {noR2.length > 0 && <div className="bib-secao" data-onde="r2"><Zap size={14} aria-hidden /><b>No Cloudflare R2</b><span>{noR2.length} · abrem na hora</span></div>}
            {noR2.map(cartao)}
            {noDrive.length > 0 && <div className="bib-secao" data-onde="drive"><DriveIcone size={14} /><b>No Google Drive</b><span>{noDrive.length} · prévia leve, o original volta ao abrir</span></div>}
            {noDrive.map(cartao)}
          </> : itens.map(cartao)}
        </div>

        {modo === "gerenciar" && sel.length > 0 && (
          <div className="bib-acoes">
            <b>{sel.length} selecionado(s)</b>
            {sel.length < itens.length && <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSel(itens.map((i) => i.id))}><CheckSquare aria-hidden /> Selecionar tudo</button>}
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSel([])}><X aria-hidden /> Limpar</button>
            <span style={{ flex: 1 }} />
            {podeEditar && <>
              {sel.length === 1 && <button type="button" className="btn btn-ghost btn-xs" onClick={() => { const i = itens.find((x) => x.id === sel[0]); if (i) setRenomeando({ id: i.id, nome: i.name }); }}><Pencil aria-hidden /> Renomear</button>}
              <Seletor ariaLabel="Mover para a pasta" valor="" icone={<FolderInput size={14} aria-hidden />} disabled={ocupado}
                opcoes={[{ valor: "", rotulo: "Mover para…" }, { valor: "sem", rotulo: "Sem pasta" }, ...pastas.map((p) => ({ valor: p.id, rotulo: p.nome })), { valor: "+nova", rotulo: "Nova pasta…" }]}
                onChange={(v) => { if (v === "+nova") novaPasta(sel); else if (v) void mover(sel, v === "sem" ? null : v); }} />
              <button type="button" className="btn btn-danger btn-xs" disabled={ocupado} onClick={() => void apagar(sel)}>{ocupado ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />} Apagar</button>
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
      <MenuContexto menu={menu} onClose={fecharMenu} />
    </div>
    </>
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
