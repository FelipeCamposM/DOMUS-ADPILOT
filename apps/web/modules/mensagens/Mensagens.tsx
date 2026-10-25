"use client";

import { contatoSchema, formatarNumero, MAX_TEXTO_WA, preencherModelo, templateSchema, VARIAVEIS_MODELO } from "@domus-ads/core/mensagens";
import {
  AlertCircle, ArrowLeft, BellRing, Check, CheckCheck, Clock, Download, FileText, ImageIcon, Loader2, MessageCirclePlus, MessageSquareText,
  Mic, Paperclip, Pencil, Play, RotateCcw, Search, Send, StickyNote, Trash2, UploadCloud, User, Video, WifiOff, X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { enviarArquivo } from "../creatives/upload";
import { confirmar } from "../shell/confirmar";
import { Dialog } from "../shell/Dialog";
import { Popover } from "../shell/Popover";
import { toast } from "../shell/toast";
import { apagarNota, apagarTemplate, enviarMensagem, marcarLida, reenviarMensagem, salvarContato, salvarNota, salvarTemplate } from "./actions";

export interface Mensagem {
  id: string; created_at: string; para: string; texto: string; status: string; erro: string | null;
  direcao: "OUT" | "IN" | "NOTA"; tipo: string; midia: boolean; midia_mime: string | null; midia_nome: string | null; autor: string | null;
}
export interface Contato { numero: string; nome: string; salvo: boolean; lido_em: string }
export interface Modelo { id: string; nome: string; texto: string }
export interface ItemBiblioteca { id: string; nome: string; tipo: "imagem" | "video"; thumb: boolean }
type Anexo = { creativeId: string | null; nome: string; tipo: "imagem" | "video"; previa: string | null; pct: number };

const hora = (d: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(d));
const dia = (d: string) => new Date(d).toDateString();
function rotuloDia(d: string) {
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  if (dia(d) === new Date().toDateString()) return "Hoje";
  if (dia(d) === ontem.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(d));
}
const quando = (d: string) => {
  const r = rotuloDia(d);
  return r === "Hoje" ? hora(d) : r === "Ontem" ? r : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(d));
};
const midiaUrl = (id: string) => `/api/mensagens/${id}/midia`;
const ROTULO_TIPO: Record<string, string> = { imagem: "Foto", video: "Vídeo", audio: "Áudio", documento: "Arquivo" };
const ICONE_TIPO: Record<string, typeof ImageIcon> = { imagem: ImageIcon, video: Video, audio: Mic, documento: FileText };

/** *negrito*, _itálico_, ~riscado~ e links, como o WhatsApp mostra. */
function formatar(t: string): ReactNode[] {
  return t.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/\S+)/g).map((p, i) => {
    if (/^\*.+\*$/.test(p)) return <b key={i}>{p.slice(1, -1)}</b>;
    if (/^_.+_$/.test(p)) return <i key={i}>{p.slice(1, -1)}</i>;
    if (/^~.+~$/.test(p)) return <s key={i}>{p.slice(1, -1)}</s>;
    if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer noopener">{p}</a>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

/**
 * Caixa de mensagens do WhatsApp da plataforma, no formato do WhatsApp Web: conversas à esquerda, conversa à direita.
 * Manda texto, imagem e vídeo (da biblioteca ou do computador), modelos com variáveis e notas internas (não enviadas).
 * Nova conversa exige nome e número. Atualiza sozinha a cada poucos segundos.
 */
export function Mensagens({ mensagens, contatos, modelos, biblioteca, avisos, online }: {
  mensagens: Mensagem[]; contatos: Contato[]; modelos: Modelo[]; biblioteca: ItemBiblioteca[]; avisos: string | null; online: boolean;
}) {
  const router = useRouter();
  const conversas = useMemo(() => {
    const porNumero = new Map<string, Mensagem[]>();
    for (const m of mensagens) porNumero.set(m.para, [...(porNumero.get(m.para) ?? []), m]);
    const nomes = new Map(contatos.map((c) => [c.numero, c]));
    const numeros = new Set([...porNumero.keys(), ...contatos.map((c) => c.numero)]);
    return [...numeros].filter((n) => n !== "—").map((numero) => {
      const msgs = porNumero.get(numero) ?? [];
      const contato = nomes.get(numero) ?? null;
      const ultima = msgs.findLast((m) => m.direcao !== "NOTA") ?? msgs.at(-1) ?? null;
      const naoLidas = contato ? msgs.filter((m) => m.direcao === "IN" && m.created_at > contato.lido_em).length : 0;
      return { numero, msgs, contato, ultima, naoLidas, quando: ultima?.created_at ?? contato?.lido_em ?? "" };
    }).sort((a, b) => b.quando.localeCompare(a.quando));
  }, [mensagens, contatos]);

  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false); // celular: lista ou conversa
  const [contatoDlg, setContatoDlg] = useState<{ numero: string; nome: string; travado: boolean } | null>(null);
  const [modelosDlg, setModelosDlg] = useState(false);
  const [ver, setVer] = useState<Mensagem | null>(null);
  const atual = conversas.find((c) => c.numero === sel) ?? conversas[0] ?? null;

  const nome = (c: { numero: string; contato: Contato | null }) => (c.numero === avisos ? "Avisos da plataforma" : c.contato?.nome ?? formatarNumero(c.numero));

  // atualiza sozinha (mensagens novas, status do envio) enquanto a aba está aberta
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 5000);
    return () => clearInterval(t);
  }, [router]);
  // abriu a conversa com mensagens novas: marca como lida
  useEffect(() => {
    if (atual?.naoLidas && atual.contato) void marcarLida(atual.numero);
  }, [atual?.numero, atual?.naoLidas, atual?.contato]);

  const q = busca.trim().toLowerCase();
  const digitos = q.replace(/\D/g, "");
  const lista = q ? conversas.filter((c) => nome(c).toLowerCase().includes(q) || (digitos && c.numero.includes(digitos)) || c.msgs.some((m) => m.texto.toLowerCase().includes(q))) : conversas;
  const totalNaoLidas = conversas.reduce((a, c) => a + c.naoLidas, 0);

  return (
    <div className="wa" data-aberta={aberta}>
      <aside className="wa-lado">
        <header className="wa-topo">
          <span style={{ display: "flex", flexDirection: "column" }}><b>Mensagens</b><span className="subtle caption">{totalNaoLidas ? `${totalNaoLidas} não lida(s)` : `${conversas.length} conversa(s)`}</span></span>
          <span className="cluster" style={{ gap: 4 }}>
            <button className="btn btn-ghost btn-xs" onClick={() => setModelosDlg(true)} title="Modelos de mensagem"><MessageSquareText aria-hidden /> Modelos</button>
            <button className="btn btn-primary btn-xs" onClick={() => setContatoDlg({ numero: "", nome: "", travado: false })} title="Nova conversa"><MessageCirclePlus aria-hidden /> Nova</button>
          </span>
        </header>
        {!online && <div className="wa-alerta"><WifiOff size={14} aria-hidden /> WhatsApp ou worker offline: mensagens ficam na fila até voltar.</div>}
        <label className="wa-busca"><Search size={15} aria-hidden /><input placeholder="Pesquisar nome, número ou mensagem" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <ul className="wa-lista">
          {lista.map((c) => {
            const Ic = c.ultima && c.ultima.tipo !== "texto" ? ICONE_TIPO[c.ultima.tipo] : null;
            return (
              <li key={c.numero}>
                <button aria-current={c.numero === atual?.numero} onClick={() => { setSel(c.numero); setAberta(true); }}>
                  <Avatar aviso={c.numero === avisos} nome={c.contato?.nome} />
                  <span className="wa-resumo">
                    <span className="wa-linha"><b>{nome(c)}</b><small suppressHydrationWarning data-novo={c.naoLidas > 0}>{c.quando ? quando(c.quando) : ""}</small></span>
                    <span className="wa-linha wa-previa">
                      {c.ultima?.direcao === "OUT" && <Status m={c.ultima} />}
                      {Ic && <Ic size={14} aria-hidden style={{ flex: "none" }} />}
                      <span>{c.ultima ? c.ultima.texto.split("\n")[0] || ROTULO_TIPO[c.ultima.tipo] : "Nenhuma mensagem ainda"}</span>
                      {c.naoLidas > 0 && <em className="wa-badge">{c.naoLidas}</em>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {!lista.length && <li className="subtle small" style={{ padding: 20, textAlign: "center" }}>{conversas.length ? "Nada encontrado" : "Nenhuma conversa ainda. Clique em Nova para começar."}</li>}
        </ul>
      </aside>

      <section className="wa-chat">
        {atual ? (
          <Conversa key={atual.numero} c={atual} titulo={nome(atual)} aviso={atual.numero === avisos} modelos={modelos} biblioteca={biblioteca}
            voltar={() => setAberta(false)} abrir={setVer}
            editarContato={() => setContatoDlg({ numero: atual.numero, nome: atual.contato?.nome ?? "", travado: true })} />
        ) : (
          <div className="wa-vazio">
            <MessageCirclePlus size={42} aria-hidden /><b>Nenhuma conversa ainda</b>
            <span className="subtle small">Comece uma conversa com nome e número, ou espere alguém mandar mensagem.</span>
            <button className="btn btn-primary btn-sm" onClick={() => setContatoDlg({ numero: "", nome: "", travado: false })}><MessageCirclePlus aria-hidden /> Nova conversa</button>
          </div>
        )}
      </section>

      {contatoDlg && <ContatoDialog inicial={contatoDlg} fechar={() => setContatoDlg(null)} pronto={(n) => { setContatoDlg(null); setSel(n); setAberta(true); router.refresh(); }} />}
      <ModelosDialog open={modelosDlg} fechar={() => setModelosDlg(false)} modelos={modelos} />
      <Dialog open={!!ver} onClose={() => setVer(null)} title={ver ? (ver.midia_nome || ROTULO_TIPO[ver.tipo] || "Mídia") : ""} largo>
        {ver && (
          <div className="stack" style={{ gap: 12 }}>
            {ver.tipo === "video" ? <video src={midiaUrl(ver.id)} controls autoPlay playsInline className="wa-ver" />
              : <img src={midiaUrl(ver.id)} alt={ver.texto || "Imagem da conversa"} className="wa-ver" />}
            {ver.texto && <p style={{ margin: 0, whiteSpace: "pre-line" }}>{formatar(ver.texto)}</p>}
            <a className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} href={`${midiaUrl(ver.id)}?download=1`}><Download aria-hidden /> Baixar</a>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Avatar({ aviso, nome }: { aviso?: boolean; nome?: string }) {
  const ini = nome?.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return <span className="wa-avatar">{aviso ? <BellRing size={18} aria-hidden /> : ini || <User size={18} aria-hidden />}</span>;
}

function Status({ m }: { m: Mensagem }) {
  if (m.status === "PENDENTE") return <Clock size={13} className="subtle" aria-label="Na fila" style={{ flex: "none" }} />;
  if (m.status === "FALHOU") return <AlertCircle size={14} className="wa-erro" aria-label="Falhou" />;
  return m.autor === "pelo celular" ? <Check size={14} className="wa-ok" aria-label="Enviada pelo celular" /> : <CheckCheck size={15} className="wa-ok" aria-label="Enviada" />;
}

// ───────────── Conversa aberta ─────────────

function Conversa({ c, titulo, aviso, modelos, biblioteca, voltar, abrir, editarContato }: {
  c: { numero: string; msgs: Mensagem[]; contato: Contato | null }; titulo: string; aviso: boolean; modelos: Modelo[]; biblioteca: ItemBiblioteca[];
  voltar: () => void; abrir: (m: Mensagem) => void; editarContato: () => void;
}) {
  const router = useRouter();
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [nota, setNota] = useState(false);
  const [anexo, setAnexo] = useState<Anexo | null>(null);
  const [menu, setMenu] = useState<"modelos" | "anexo" | null>(null);
  const [filtroModelo, setFiltroModelo] = useState("");
  const [pend, start] = useTransition();
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [c.msgs.length]);
  useEffect(() => { campo.current?.focus(); }, [c.numero, nota]);
  const salvo = !!c.contato || aviso;
  const contatoModelo = { nome: c.contato?.nome ?? titulo, numero: c.numero };

  const enviar = () => start(async () => {
    const t = texto.trim();
    if (nota) {
      if (!t) return;
      const r = await salvarNota({ para: c.numero, texto: t });
      if (!r.ok) return toast.err(r.error);
    } else {
      if (!t && !anexo) return;
      if (anexo && !anexo.creativeId) return toast.err("Espere o envio do arquivo terminar");
      const r = await enviarMensagem({ para: c.numero, texto: t, creativeId: anexo?.creativeId ?? null });
      if (!r.ok) return toast.err(r.error);
      if (anexo?.previa) URL.revokeObjectURL(anexo.previa);
      setAnexo(null);
    }
    setTexto("");
    router.refresh();
  });

  const doComputador = async (f: File | undefined) => {
    if (arquivo.current) arquivo.current.value = "";
    if (!f) return;
    if (!/^(image|video)\//.test(f.type)) return toast.err("Envie uma imagem ou um vídeo");
    const previa = URL.createObjectURL(f);
    const tipo = f.type.startsWith("video/") ? "video" : "imagem";
    setAnexo({ creativeId: null, nome: f.name, tipo, previa, pct: 0 });
    try {
      const e = await enviarArquivo(f, { onProgresso: (pct) => setAnexo((a) => (a?.previa === previa ? { ...a, pct } : a)) });
      setAnexo((a) => (a?.previa === previa ? { ...a, creativeId: e.id, pct: 100 } : a));
    } catch (err) {
      toast.err((err as Error).message);
      setAnexo((a) => (a?.previa === previa ? null : a));
    }
  };

  const qm = filtroModelo.trim().toLowerCase();
  const modelosVistos = qm ? modelos.filter((m) => m.nome.toLowerCase().includes(qm) || m.texto.toLowerCase().includes(qm)) : modelos;

  return (
    <>
      <header className="wa-topo">
        <button className="btn btn-ghost btn-xs wa-voltar" onClick={voltar} aria-label="Voltar para as conversas"><ArrowLeft aria-hidden /></button>
        <Avatar aviso={aviso} nome={c.contato?.nome} />
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
          <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</b>
          <small className="subtle">{formatarNumero(c.numero)}{c.contato && !c.contato.salvo ? " · nome do WhatsApp" : ""}</small>
        </span>
        {!aviso && <button className="btn btn-ghost btn-xs" onClick={editarContato}>{salvo && c.contato?.salvo ? <><Pencil aria-hidden /> Editar contato</> : <><User aria-hidden /> Salvar contato</>}</button>}
      </header>

      <div className="wa-corpo">
        {!c.msgs.length && <div className="wa-dia">Nenhuma mensagem ainda. Escreva abaixo ou use um modelo.</div>}
        {c.msgs.map((m, i) => (
          <Fragment key={m.id}>
            {(i === 0 || dia(c.msgs[i - 1]!.created_at) !== dia(m.created_at)) && <div className="wa-dia" suppressHydrationWarning>{rotuloDia(m.created_at)}</div>}
            {m.direcao === "NOTA" ? (
              <div className="wa-nota">
                <span className="wa-nota-topo"><StickyNote size={13} aria-hidden /> Nota interna · {m.autor?.split("@")[0] ?? "equipe"} <span className="subtle" suppressHydrationWarning>{hora(m.created_at)}</span>
                  <button className="btn btn-ghost btn-xs" aria-label="Apagar nota" onClick={async () => {
                    if (!(await confirmar("Apagar esta nota interna?"))) return;
                    const r = await apagarNota(m.id);
                    if (!r.ok) toast.err(r.error); else router.refresh();
                  }}><Trash2 aria-hidden /></button>
                </span>
                <p>{formatar(m.texto)}</p>
              </div>
            ) : (
              <div className="wa-bolha" data-lado={m.direcao === "IN" ? "in" : "out"} data-erro={m.status === "FALHOU"}>
                {m.midia && <Midia m={m} abrir={() => abrir(m)} />}
                {m.texto && <p>{formatar(m.texto)}</p>}
                {m.status === "FALHOU" && (
                  <p className="wa-motivo"><AlertCircle size={13} aria-hidden /> Não enviada{m.erro ? `: ${m.erro}` : ""}
                    <button className="btn btn-ghost btn-xs" onClick={async () => { const r = await reenviarMensagem(m.id); if (!r.ok) toast.err(r.error); else router.refresh(); }}><RotateCcw aria-hidden /> Tentar de novo</button>
                  </p>
                )}
                <span className="wa-meta" suppressHydrationWarning>
                  {m.direcao === "OUT" && m.autor && m.autor !== "DOMUS (automático)" && <span>{m.autor === "pelo celular" ? "pelo celular" : m.autor.split("@")[0]} ·</span>}
                  {hora(m.created_at)}
                  {m.direcao === "OUT" && <Status m={m} />}
                </span>
              </div>
            )}
          </Fragment>
        ))}
        <div ref={fim} />
      </div>

      <footer className="wa-compor" data-nota={nota}>
        {anexo && (
          <div className="wa-anexo">
            {anexo.previa ? (anexo.tipo === "video" ? <video src={anexo.previa} muted /> : <img src={anexo.previa} alt="" />)
              : <img src={`/api/creatives/${anexo.creativeId}/file?kind=thumb`} alt="" />}
            <span className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
              <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{anexo.nome}</b>
              <span className="subtle caption">{anexo.pct < 100 ? `Enviando… ${anexo.pct}%` : `${ROTULO_TIPO[anexo.tipo]} pronta para mandar · o texto vira a legenda`}</span>
            </span>
            <button className="btn btn-ghost btn-xs" aria-label="Tirar anexo" onClick={() => { if (anexo.previa) URL.revokeObjectURL(anexo.previa); setAnexo(null); }}><X aria-hidden /></button>
          </div>
        )}
        <div className="wa-compor-linha">
          <span style={{ position: "relative" }}>
            <button className="btn btn-ghost btn-sm" aria-label="Modelos de mensagem" title="Modelos" onClick={() => setMenu(menu === "modelos" ? null : "modelos")}><MessageSquareText aria-hidden /></button>
            <Popover open={menu === "modelos"} onClose={() => setMenu(null)} width={340} style={{ top: "auto", bottom: "calc(100% + 8px)" }}>
              <div className="stack" style={{ gap: 6, padding: 6 }}>
                <input className="input-sm" placeholder="Buscar modelo" value={filtroModelo} onChange={(e) => setFiltroModelo(e.target.value)} autoFocus />
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  {modelosVistos.map((m) => (
                    <button key={m.id} className="menu-item" style={{ display: "block", width: "100%", textAlign: "left" }} onClick={() => {
                      const t = preencherModelo(m.texto, contatoModelo);
                      setTexto((x) => (x.trim() ? `${x}\n${t}` : t));
                      setMenu(null);
                      campo.current?.focus();
                    }}>
                      <b style={{ fontWeight: 600 }}>{m.nome}</b>
                      <span className="subtle caption" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preencherModelo(m.texto, contatoModelo)}</span>
                    </button>
                  ))}
                  {!modelosVistos.length && <p className="subtle caption" style={{ padding: 8 }}>{modelos.length ? "Nenhum modelo com isso." : "Nenhum modelo ainda: crie em Modelos, no topo da lista."}</p>}
                </div>
              </div>
            </Popover>
          </span>
          {!nota && (
            <span style={{ position: "relative" }}>
              <button className="btn btn-ghost btn-sm" aria-label="Anexar imagem ou vídeo" title="Anexar" onClick={() => setMenu(menu === "anexo" ? null : "anexo")}><Paperclip aria-hidden /></button>
              <input ref={arquivo} type="file" hidden accept="image/*,video/mp4,video/quicktime,video/webm" onChange={(e) => void doComputador(e.target.files?.[0])} />
              <Popover open={menu === "anexo"} onClose={() => setMenu(null)} width={380} style={{ top: "auto", bottom: "calc(100% + 8px)" }}>
                <div className="stack" style={{ gap: 8, padding: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setMenu(null); arquivo.current?.click(); }}><UploadCloud aria-hidden /> Do computador</button>
                  <span className="subtle caption">Ou da biblioteca (Criativos):</span>
                  <div className="wa-biblioteca">
                    {biblioteca.map((b) => (
                      <button key={b.id} title={b.nome} onClick={() => { setAnexo({ creativeId: b.id, nome: b.nome, tipo: b.tipo, previa: null, pct: 100 }); setMenu(null); }}>
                        {b.thumb ? <img src={`/api/creatives/${b.id}/file?kind=thumb`} alt="" loading="lazy" /> : <span className="wa-biblioteca-sem">{b.tipo === "video" ? <Video size={18} aria-hidden /> : <ImageIcon size={18} aria-hidden />}</span>}
                        {b.tipo === "video" && <Play size={14} className="wa-biblioteca-play" aria-hidden />}
                      </button>
                    ))}
                    {!biblioteca.length && <span className="subtle caption">Nada na biblioteca deste workspace.</span>}
                  </div>
                </div>
              </Popover>
            </span>
          )}
          <textarea ref={campo} rows={1} value={texto} maxLength={MAX_TEXTO_WA} onChange={(e) => setTexto(e.target.value)}
            placeholder={nota ? "Nota interna (só a equipe vê, não vai para o WhatsApp)" : salvo ? "Mensagem" : "Salve o contato para mandar mensagem"}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar(); } }} />
          <button className="btn btn-ghost btn-sm" aria-pressed={nota} title={nota ? "Voltar para mensagem" : "Escrever nota interna"} onClick={() => setNota((n) => !n)}><StickyNote aria-hidden /></button>
          <button className="btn btn-primary btn-sm" aria-label={nota ? "Salvar nota" : "Enviar"} disabled={pend || (nota ? !texto.trim() : !salvo || (!texto.trim() && !anexo) || (!!anexo && !anexo.creativeId))} onClick={enviar}>
            {pend ? <Loader2 className="animate-spin" aria-hidden /> : nota ? <StickyNote aria-hidden /> : <Send aria-hidden />}
          </button>
        </div>
        <span className="subtle caption wa-dica">{nota ? "Nota interna: fica só aqui na conversa." : "Enter envia · Shift+Enter quebra linha · *negrito* _itálico_"}</span>
      </footer>
    </>
  );
}

function Midia({ m, abrir }: { m: Mensagem; abrir: () => void }) {
  const url = midiaUrl(m.id);
  if (m.tipo === "imagem") return <button className="wa-midia" onClick={abrir} aria-label="Ver imagem"><img src={url} alt={m.texto || "Imagem"} loading="lazy" /></button>;
  if (m.tipo === "video") return <button className="wa-midia" onClick={abrir} aria-label="Ver vídeo"><video src={`${url}#t=0.1`} preload="metadata" muted playsInline /><span className="wa-midia-play"><Play size={22} aria-hidden /></span></button>;
  if (m.tipo === "audio") return <audio controls preload="none" src={url} style={{ width: 260, height: 36 }} />;
  return <a className="wa-arquivo" href={`${url}?download=1`}><FileText size={20} aria-hidden /><span>{m.midia_nome || "Arquivo"}</span><Download size={15} aria-hidden /></a>;
}

// ───────────── Contato e modelos ─────────────

function ContatoDialog({ inicial, fechar, pronto }: { inicial: { numero: string; nome: string; travado: boolean }; fechar: () => void; pronto: (numero: string) => void }) {
  const [nome, setNome] = useState(inicial.nome);
  const [numero, setNumero] = useState(inicial.numero ? formatarNumero(inicial.numero) : "");
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const salvar = () => start(async () => {
    const v = contatoSchema.safeParse({ nome, numero: inicial.travado ? inicial.numero : numero });
    if (!v.success) return setErro(v.error.issues[0]?.message ?? "Dados inválidos");
    const r = await salvarContato(v.data);
    if (!r.ok) return setErro(r.error);
    toast.ok(inicial.travado ? "Contato salvo" : "Conversa criada");
    pronto(r.data);
  });
  return (
    <Dialog open onClose={fechar} title={inicial.travado ? "Contato" : "Nova conversa"}>
      <form className="stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <div className="field">
          <label className="label" htmlFor="wa-nome">Nome *</label>
          <input id="wa-nome" className="input" value={nome} onChange={(e) => { setNome(e.target.value); setErro(null); }} maxLength={80} required autoFocus placeholder="Ex.: Maria Souza (Castilho Advogados)" />
        </div>
        <div className="field">
          <label className="label" htmlFor="wa-num">Número com DDD *</label>
          <input id="wa-num" className="input" inputMode="tel" value={numero} onChange={(e) => { setNumero(e.target.value); setErro(null); }} required disabled={inicial.travado} placeholder="31 99999-9999 ou +1 555 123 4567" />
          <span className="subtle caption">Brasil: só DDD + número. Outro país: comece com + e o código.</span>
        </div>
        {erro && <p className="error-text" role="alert">{erro}</p>}
        <div className="cluster" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={fechar}>Cancelar</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pend || nome.trim().length < 2 || (!inicial.travado && !numero.trim())}>
            {pend ? <Loader2 className="animate-spin" aria-hidden /> : inicial.travado ? "Salvar" : <><MessageCirclePlus aria-hidden /> Começar conversa</>}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ModelosDialog({ open, fechar, modelos }: { open: boolean; fechar: () => void; modelos: Modelo[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ id: string | null; nome: string; texto: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const campo = useRef<HTMLTextAreaElement>(null);
  const salvar = () => start(async () => {
    if (!edit) return;
    const v = templateSchema.safeParse(edit);
    if (!v.success) return setErro(v.error.issues[0]?.message ?? "Dados inválidos");
    const r = await salvarTemplate({ ...v.data, id: edit.id });
    if (!r.ok) return setErro(r.error);
    toast.ok("Modelo salvo");
    setEdit(null);
    router.refresh();
  });
  const inserir = (v: string) => {
    const el = campo.current;
    if (!el || !edit) return;
    const t = edit.texto.slice(0, el.selectionStart) + v + edit.texto.slice(el.selectionEnd);
    setEdit({ ...edit, texto: t });
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = el.selectionStart + v.length; });
  };
  return (
    <Dialog open={open} onClose={() => { setEdit(null); fechar(); }} title="Modelos de mensagem" largo>
      {edit ? (
        <form className="stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <div className="field">
            <label className="label" htmlFor="md-nome">Nome do modelo *</label>
            <input id="md-nome" className="input" value={edit.nome} maxLength={60} onChange={(e) => { setEdit({ ...edit, nome: e.target.value }); setErro(null); }} autoFocus placeholder="Ex.: Boas-vindas, Proposta enviada, Cobrança" />
          </div>
          <div className="field">
            <label className="label" htmlFor="md-texto">Texto *</label>
            <textarea ref={campo} id="md-texto" className="input" rows={6} style={{ height: "auto", paddingBlock: 12, resize: "vertical" }} maxLength={MAX_TEXTO_WA}
              value={edit.texto} onChange={(e) => { setEdit({ ...edit, texto: e.target.value }); setErro(null); }} placeholder="Olá {primeiro_nome}, tudo bem? …" />
            <span className="cluster" style={{ gap: 6 }}>
              <span className="subtle caption">Inserir:</span>
              {Object.entries(VARIAVEIS_MODELO).map(([v, d]) => <button key={v} type="button" className="chip" style={{ height: 24 }} title={d} onClick={() => inserir(v)}>{v}</button>)}
            </span>
          </div>
          {edit.texto.trim() && (
            <div className="wa-previa-modelo"><span className="subtle caption">Prévia com “Maria Souza”:</span><p>{formatar(preencherModelo(edit.texto, { nome: "Maria Souza", numero: "5531999999999" }))}</p></div>
          )}
          {erro && <p className="error-text" role="alert">{erro}</p>}
          <div className="cluster" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>Voltar</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={pend}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : "Salvar modelo"}</button>
          </div>
        </form>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setEdit({ id: null, nome: "", texto: "" })}><MessageSquareText aria-hidden /> Novo modelo</button>
          {modelos.map((m) => (
            <div key={m.id} className="panel" style={{ padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                <b style={{ fontWeight: 600 }}>{m.nome}</b>
                <span className="subtle small" style={{ whiteSpace: "pre-line", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.texto}</span>
              </span>
              <button className="btn btn-ghost btn-xs" onClick={() => setEdit({ ...m })} aria-label={`Editar ${m.nome}`}><Pencil aria-hidden /></button>
              <button className="btn btn-ghost btn-xs" aria-label={`Apagar ${m.nome}`} onClick={async () => {
                if (!(await confirmar(`Apagar o modelo “${m.nome}”?`))) return;
                const r = await apagarTemplate(m.id);
                if (!r.ok) toast.err(r.error); else router.refresh();
              }}><Trash2 aria-hidden /></button>
            </div>
          ))}
          {!modelos.length && <p className="subtle small">Nenhum modelo ainda. Modelos aceitam {Object.keys(VARIAVEIS_MODELO).join(", ")}, trocados pelos dados do contato na hora de usar.</p>}
        </div>
      )}
    </Dialog>
  );
}
