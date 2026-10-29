"use client";

import {
  CONSENTIMENTO, contatoSchema, ETAPAS, FRIO, formatarNumero, leadSiteSchema, MAX_TEXTO_WA, preencherModelo, ROTULO_ETAPA, temLink, templateSchema, VARIAVEIS_MODELO, type Etapa,
} from "@domus-ads/core/mensagens";
import {
  AlertCircle, ArrowLeft, BellRing, Check, CheckCheck, Clock, Code2, Copy, Download, FileText, Globe, ImageIcon, Loader2, MessageCirclePlus, MessageSquareText,
  Mic, Paperclip, Pencil, Play, RotateCcw, Search, Send, ShieldCheck, Sparkles, StickyNote, Trash2, UploadCloud, User, Video, WifiOff, X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { enviarArquivo } from "../creatives/upload";
import { confirmar } from "../shell/confirmar";
import { Dialog } from "../shell/Dialog";
import { Popover } from "../shell/Popover";
import { toast } from "../shell/toast";
import {
  alternarSite, apagarNota, apagarSite, apagarTemplate, definirEtapa, enviarMensagem, marcarLida, reenviarMensagem, salvarContato, salvarNota, salvarSite, salvarTemplate,
} from "./actions";

export interface Mensagem {
  id: string; created_at: string; para: string; texto: string; status: string; erro: string | null;
  direcao: "OUT" | "IN" | "NOTA"; tipo: string; midia: boolean; midia_mime: string | null; midia_nome: string | null; autor: string | null;
}
export interface Contato {
  numero: string; nome: string; salvo: boolean; lido_em: string;
  etapa: Etapa | null; site: string | null; lead_em: string | null; consentimento_em: string | null;
  lead_dados: { mensagem?: string; pagina?: string | null; utm?: Record<string, string> } | null;
}
export interface SiteLead { id: string; nome: string; chave: string; dominios: string[]; mensagem_inicial: string; ativo: boolean; ultimo_lead: string | null; leads: number }
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
/** "há 5 min", "há 3 h", "há 2 dias" */
function ha(d: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60_000));
  return min < 60 ? `há ${min} min` : min < 48 * 60 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} dias`;
}
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
export function Mensagens({ mensagens, contatos, modelos, biblioteca, avisos, online, sites, inicial }: {
  mensagens: Mensagem[]; contatos: Contato[]; modelos: Modelo[]; biblioteca: ItemBiblioteca[]; avisos: string | null; online: boolean;
  sites: SiteLead[]; inicial: string | null;
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
  const [sel, setSel] = useState<string | null>(inicial); // ?c= do aviso de lead novo abre a conversa
  const [aberta, setAberta] = useState(!!inicial); // celular: lista ou conversa
  const [filtro, setFiltro] = useState<"todas" | "leads" | Etapa>("todas");
  const [sitesDlg, setSitesDlg] = useState(false);
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
  const leads = conversas.filter((c) => c.contato?.etapa);
  const doFiltro = filtro === "todas" ? conversas : filtro === "leads" ? leads : leads.filter((c) => c.contato?.etapa === filtro);
  const lista = q ? doFiltro.filter((c) => nome(c).toLowerCase().includes(q) || (digitos && c.numero.includes(digitos)) || c.msgs.some((m) => m.texto.toLowerCase().includes(q))) : doFiltro;
  const totalNaoLidas = conversas.reduce((a, c) => a + c.naoLidas, 0);

  return (
    <div className="wa" data-aberta={aberta}>
      <aside className="wa-lado">
        <header className="wa-topo">
          <span style={{ display: "flex", flexDirection: "column" }}><b>Mensagens</b><span className="subtle caption">{totalNaoLidas ? `${totalNaoLidas} não lida(s)` : `${conversas.length} conversa(s)`}</span></span>
          <span className="cluster" style={{ gap: 4 }}>
            <button className="btn btn-ghost btn-xs" onClick={() => setSitesDlg(true)} title="Sites que mandam leads"><Globe aria-hidden /> Sites</button>
            <button className="btn btn-ghost btn-xs" onClick={() => setModelosDlg(true)} title="Modelos de mensagem"><MessageSquareText aria-hidden /> Modelos</button>
            <button className="btn btn-primary btn-xs" onClick={() => setContatoDlg({ numero: "", nome: "", travado: false })} title="Nova conversa"><MessageCirclePlus aria-hidden /> Nova</button>
          </span>
        </header>
        {!online && <div className="wa-alerta"><WifiOff size={14} aria-hidden /> WhatsApp ou worker offline: mensagens ficam na fila até voltar.</div>}
        <label className="wa-busca"><Search size={15} aria-hidden /><input placeholder="Pesquisar nome, número ou mensagem" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <div className="wa-filtros" role="tablist" aria-label="Filtrar conversas">
          <button role="tab" aria-selected={filtro === "todas"} className="chip" data-active={filtro === "todas"} onClick={() => setFiltro("todas")}>Todas</button>
          <button role="tab" aria-selected={filtro !== "todas"} className="chip" data-active={filtro !== "todas"} onClick={() => setFiltro("leads")}><Sparkles aria-hidden /> Leads{leads.length ? ` · ${leads.length}` : ""}</button>
        </div>
        {filtro !== "todas" && (
          <div className="wa-funil">
            {ETAPAS.map((e) => (
              <button key={e} data-etapa={e} aria-pressed={filtro === e} onClick={() => setFiltro(filtro === e ? "leads" : e)}>
                <b>{leads.filter((c) => c.contato?.etapa === e).length}</b><span>{ROTULO_ETAPA[e]}</span>
              </button>
            ))}
          </div>
        )}
        <ul className="wa-lista">
          {lista.map((c) => {
            const Ic = c.ultima && c.ultima.tipo !== "texto" ? ICONE_TIPO[c.ultima.tipo] : null;
            return (
              <li key={c.numero}>
                <button aria-current={c.numero === atual?.numero} onClick={() => { setSel(c.numero); setAberta(true); }}>
                  <Avatar aviso={c.numero === avisos} nome={c.contato?.nome} />
                  <span className="wa-resumo">
                    <span className="wa-linha"><b>{nome(c)}</b>{c.contato?.etapa && <Etiqueta etapa={c.contato.etapa} />}<small suppressHydrationWarning data-novo={c.naoLidas > 0}>{c.quando ? quando(c.quando) : ""}</small></span>
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
          {!lista.length && (
            <li className="subtle small" style={{ padding: 20, textAlign: "center" }}>
              {q && doFiltro.length ? "Nada encontrado"
                : filtro !== "todas" ? (sites.length ? "Nenhum lead aqui ainda." : <>Nenhum lead ainda.<br /><button className="btn btn-ghost btn-xs" style={{ marginTop: 8 }} onClick={() => setSitesDlg(true)}><Globe aria-hidden /> Ligar um site</button></>)
                : conversas.length ? "Nada encontrado" : "Nenhuma conversa ainda. Clique em Nova para começar."}
            </li>
          )}
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
      <SitesDialog open={sitesDlg} fechar={() => setSitesDlg(false)} sites={sites} />
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

function Etiqueta({ etapa }: { etapa: Etapa }) {
  return <span className="wa-etapa" data-etapa={etapa}>{ROTULO_ETAPA[etapa]}</span>;
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
  const contatoModelo = { nome: c.contato?.nome ?? titulo, numero: c.numero, site: c.contato?.site };
  // conversa fria = a pessoa nunca respondeu: as mesmas travas contra ban do servidor, avisadas antes de enviar
  const frio = !aviso && !c.msgs.some((m) => m.direcao === "IN");
  const enviadasFrio = frio ? c.msgs.filter((m) => m.direcao === "OUT" && m.status !== "FALHOU").length : 0;
  const travado = frio && !nota && (temLink(texto) || enviadasFrio >= FRIO.porConversa);
  const mudarEtapa = (e: string) => start(async () => {
    const r = await definirEtapa(c.numero, e || null);
    if (!r.ok) return toast.err(r.error);
    router.refresh();
  });

  const enviar = () => start(async () => {
    const t = texto.trim();
    if (nota) {
      if (!t) return;
      const r = await salvarNota({ para: c.numero, texto: t });
      if (!r.ok) return toast.err(r.error);
    } else {
      if ((!t && !anexo) || travado) return;
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
        {!aviso && c.contato && (
          <select className="select wa-etapa-sel" data-etapa={c.contato.etapa ?? ""} value={c.contato.etapa ?? ""} onChange={(e) => mudarEtapa(e.target.value)} aria-label="Etapa do lead" disabled={pend}>
            <option value="">Não é lead</option>
            {ETAPAS.map((e) => <option key={e} value={e}>{ROTULO_ETAPA[e]}</option>)}
          </select>
        )}
        {!aviso && <button className="btn btn-ghost btn-xs" onClick={editarContato}>{salvo && c.contato?.salvo ? <><Pencil aria-hidden /> Editar contato</> : <><User aria-hidden /> Salvar contato</>}</button>}
      </header>

      {c.contato?.etapa && c.contato.lead_em && <FaixaLead c={c.contato} />}

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
          <button className="btn btn-primary btn-sm" aria-label={nota ? "Salvar nota" : "Enviar"} disabled={pend || (nota ? !texto.trim() : !salvo || travado || (!texto.trim() && !anexo) || (!!anexo && !anexo.creativeId))} onClick={enviar}>
            {pend ? <Loader2 className="animate-spin" aria-hidden /> : nota ? <StickyNote aria-hidden /> : <Send aria-hidden />}
          </button>
        </div>
        {!nota && frio && salvo && (
          <span className="wa-frio" data-alerta={travado}>
            <ShieldCheck size={13} aria-hidden />
            {temLink(texto) ? "Tire o link: no primeiro contato ele vira denúncia de spam. Mande depois que a pessoa responder."
              : enviadasFrio >= FRIO.porConversa ? `Espere a resposta: ${enviadasFrio} mensagens sem retorno nesta conversa.`
              : `Primeiro contato: curto, pessoal e sem link · ${FRIO.porConversa - enviadasFrio} mensagem(ns) até a pessoa responder.`}
          </span>
        )}
        <span className="subtle caption wa-dica">{nota ? "Nota interna: fica só aqui na conversa." : "Enter envia · Shift+Enter quebra linha · *negrito* _itálico_"}</span>
      </footer>
    </>
  );
}

/** Faixa no topo da conversa de um lead: de onde veio, há quanto tempo, o que escreveu e o consentimento. */
function FaixaLead({ c }: { c: Contato }) {
  const d = c.lead_dados ?? {};
  const utm = Object.entries(d.utm ?? {});
  const esfriando = c.etapa === "NOVO" && Date.now() - new Date(c.lead_em!).getTime() > 6 * 3600_000;
  return (
    <div className="wa-lead" data-etapa={c.etapa}>
      <span className="wa-lead-topo">
        <Sparkles size={14} aria-hidden />
        <b>Lead{c.site ? ` do site ${c.site}` : ""}</b>
        <span className="subtle" data-esfriando={esfriando} suppressHydrationWarning title={new Date(c.lead_em!).toLocaleString("pt-BR")}>
          · chegou {ha(c.lead_em!)}{esfriando ? " · responda logo: lead esfria rápido" : ""}
        </span>
      </span>
      {d.mensagem && <p className="wa-lead-msg">“{d.mensagem}”</p>}
      {(d.pagina || utm.length > 0 || c.consentimento_em) && (
        <span className="wa-lead-info">
          {d.pagina && <a href={d.pagina} target="_blank" rel="noreferrer noopener" title={d.pagina}><Globe size={12} aria-hidden /> {d.pagina.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}</a>}
          {utm.map(([k, v]) => <span key={k} className="wa-lead-utm">{k}: {v}</span>)}
          {c.consentimento_em && (
            <span title={CONSENTIMENTO} suppressHydrationWarning><ShieldCheck size={12} aria-hidden /> aceitou contato pelo WhatsApp em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(c.consentimento_em))}</span>
          )}
        </span>
      )}
    </div>
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

// ───────────── Sites que mandam leads ─────────────

/** Formulário pronto para colar no site: manda o lead e abre o WhatsApp dele já com a mensagem escrita. */
function codigoFormulario(origem: string, chave: string) {
  return `<!-- Formulário de contato · DOMUS AdPilot -->
<form class="domus-lead" action="${origem}/api/leads" method="post">
  <input type="hidden" name="site" value="${chave}">
  <input name="nome" placeholder="Seu nome" required minlength="2" maxlength="80" autocomplete="name">
  <input name="numero" type="tel" placeholder="WhatsApp com DDD" required autocomplete="tel">
  <textarea name="mensagem" placeholder="Como podemos ajudar? (opcional)" maxlength="1000" rows="3"></textarea>
  <label class="domus-lead-ok"><input type="checkbox" name="consentimento" value="sim" required> ${CONSENTIMENTO}</label>
  <input name="_hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
  <button type="submit">Falar no WhatsApp</button>
  <p class="domus-lead-erro" role="alert" hidden></p>
</form>
<style>
  .domus-lead { --cor: #25d366; display: grid; gap: 10px; max-width: 420px; font: inherit; }
  .domus-lead input:not([type=checkbox]), .domus-lead textarea { padding: 12px 14px; border: 1px solid #d0d5dd; border-radius: 10px; font: inherit; }
  .domus-lead-ok { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; }
  .domus-lead button { padding: 13px; border: 0; border-radius: 10px; background: var(--cor); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
  .domus-lead button:disabled { opacity: .6; }
  .domus-lead-erro { margin: 0; color: #d92d20; font-size: 14px; }
</style>
<script>
  document.querySelectorAll("form.domus-lead").forEach(function (f) {
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var b = f.querySelector("button"), erro = f.querySelector(".domus-lead-erro");
      var d = Object.fromEntries(new FormData(f));
      d.pagina = location.href;
      new URLSearchParams(location.search).forEach(function (v, k) { if (k.indexOf("utm_") === 0) d[k] = v; });
      b.disabled = true; erro.hidden = true;
      try {
        var r = await fetch(f.action, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(d) });
        var j = await r.json();
        if (!r.ok) throw new Error(j.erro);
        f.innerHTML = "<p>Recebemos seu contato! " + (j.whatsapp ? "Abrindo o WhatsApp…" : "Em breve falamos com você pelo WhatsApp.") + "</p>";
        if (j.whatsapp) location.href = j.whatsapp;
      } catch (err) {
        erro.textContent = err.message || "Não deu para enviar. Tente de novo.";
        erro.hidden = false; b.disabled = false;
      }
    });
  });
</script>`;
}

function SitesDialog({ open, fechar, sites }: { open: boolean; fechar: () => void; sites: SiteLead[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ id: string | null; nome: string; dominios: string; mensagem_inicial: string } | null>(null);
  const [codigo, setCodigo] = useState<SiteLead | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const salvar = () => start(async () => {
    if (!edit) return;
    const v = leadSiteSchema.safeParse(edit);
    if (!v.success) return setErro(v.error.issues[0]?.message ?? "Dados inválidos");
    const r = await salvarSite(edit.id, edit);
    if (!r.ok) return setErro(r.error);
    toast.ok(edit.id ? "Site salvo" : "Site criado: agora copie o código do formulário");
    setEdit(null);
    router.refresh();
  });
  const fecharTudo = () => { setEdit(null); setCodigo(null); setErro(null); fechar(); };
  const html = codigo ? codigoFormulario(window.location.origin, codigo.chave) : "";

  return (
    <Dialog open={open} onClose={fecharTudo} title={codigo ? `Formulário · ${codigo.nome}` : edit ? (edit.id ? "Editar site" : "Novo site") : "Sites que mandam leads"} largo>
      {codigo ? (
        <div className="stack" style={{ gap: 12 }}>
          <p className="subtle small" style={{ margin: 0 }}>
            Cole no HTML do site, onde o formulário deve aparecer. Quem preencher entra em <b>Leads</b>, você recebe um aviso no WhatsApp,
            e o WhatsApp da pessoa abre com a mensagem pronta para <b>ela</b> começar a conversa (o que menos dá ban).
          </p>
          <pre className="wa-codigo"><code>{html}</code></pre>
          <span className="subtle caption">A cor do botão muda em <code>--cor</code>. Sem JavaScript o formulário também funciona (vai direto para o WhatsApp).</span>
          <div className="cluster" style={{ justifyContent: "space-between", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setCodigo(null)}><ArrowLeft aria-hidden /> Voltar</button>
            <button className="btn btn-primary btn-sm" onClick={async () => { await navigator.clipboard.writeText(html); toast.ok("Código copiado"); }}><Copy aria-hidden /> Copiar código</button>
          </div>
        </div>
      ) : edit ? (
        <form className="stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <div className="field">
            <label className="label" htmlFor="st-nome">Nome do site *</label>
            <input id="st-nome" className="input" value={edit.nome} maxLength={60} autoFocus onChange={(e) => { setEdit({ ...edit, nome: e.target.value }); setErro(null); }} placeholder="Ex.: Castilho Advogados" />
          </div>
          <div className="field">
            <label className="label" htmlFor="st-dom">Domínios que podem mandar</label>
            <input id="st-dom" className="input" value={edit.dominios} onChange={(e) => { setEdit({ ...edit, dominios: e.target.value }); setErro(null); }} placeholder="castilho.adv.br, outro-dominio.com" />
            <span className="subtle caption">Subdomínios valem (www.). Vazio = qualquer site pode usar: preencha assim que o site estiver no ar.</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="st-msg">Mensagem que o lead manda ao abrir o WhatsApp *</label>
            <textarea id="st-msg" className="input" rows={3} style={{ height: "auto", paddingBlock: 12, resize: "vertical" }} maxLength={500}
              value={edit.mensagem_inicial} onChange={(e) => { setEdit({ ...edit, mensagem_inicial: e.target.value }); setErro(null); }} />
            <span className="subtle caption">Aceita {"{nome}"}, {"{primeiro_nome}"} e {"{site}"}. A pessoa ainda pode mudar antes de mandar.</span>
          </div>
          {edit.mensagem_inicial.trim() && (
            <div className="wa-previa-modelo"><span className="subtle caption">Prévia com “Maria Souza”:</span>
              <p>{preencherModelo(edit.mensagem_inicial, { nome: "Maria Souza", numero: "5531999999999", site: edit.nome || "seu site" })}</p></div>
          )}
          {erro && <p className="error-text" role="alert">{erro}</p>}
          <div className="cluster" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEdit(null); setErro(null); }}>Voltar</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={pend}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : edit.id ? "Salvar" : "Criar site"}</button>
          </div>
        </form>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <div className="cluster" style={{ justifyContent: "space-between", gap: 8 }}>
            <span className="subtle small">Cada site tem um formulário. Os leads caem em Mensagens → Leads.</span>
            <button className="btn btn-primary btn-sm" onClick={() => setEdit({ id: null, nome: "", dominios: "", mensagem_inicial: "Olá! Vim pelo site {site} e quero saber mais." })}><Globe aria-hidden /> Novo site</button>
          </div>
          {sites.map((st) => (
            <div key={st.id} className="panel wa-site" data-ativo={st.ativo}>
              <span className="wa-avatar"><Globe size={18} aria-hidden /></span>
              <span className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                <b style={{ fontWeight: 600 }}>{st.nome}{!st.ativo && <span className="subtle caption"> · pausado</span>}</b>
                <span className="subtle caption" suppressHydrationWarning style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {st.dominios.length ? st.dominios.join(", ") : "qualquer domínio"} · {st.leads} lead(s){st.ultimo_lead ? ` · último ${ha(st.ultimo_lead)}` : ""}
                </span>
              </span>
              <button className="btn btn-secondary btn-xs" onClick={() => setCodigo(st)}><Code2 aria-hidden /> Código</button>
              <button className="btn btn-ghost btn-xs" title={st.ativo ? "Pausar: o formulário para de aceitar leads" : "Reativar o formulário"} onClick={async () => {
                const r = await alternarSite(st.id, !st.ativo);
                if (!r.ok) toast.err(r.error); else router.refresh();
              }}>{st.ativo ? "Pausar" : "Ativar"}</button>
              <button className="btn btn-ghost btn-xs" aria-label={`Editar ${st.nome}`} onClick={() => setEdit({ id: st.id, nome: st.nome, dominios: st.dominios.join(", "), mensagem_inicial: st.mensagem_inicial })}><Pencil aria-hidden /></button>
              <button className="btn btn-ghost btn-xs" aria-label={`Apagar ${st.nome}`} onClick={async () => {
                if (!(await confirmar(`Apagar o site “${st.nome}”? O formulário dele para de funcionar; os leads que já chegaram continuam nas Mensagens.`))) return;
                const r = await apagarSite(st.id);
                if (!r.ok) toast.err(r.error); else router.refresh();
              }}><Trash2 aria-hidden /></button>
            </div>
          ))}
          {!sites.length && (
            <div className="wa-vazio" style={{ padding: "28px 12px" }}>
              <Globe size={36} aria-hidden /><b>Nenhum site ainda</b>
              <span className="subtle small" style={{ textAlign: "center", maxWidth: 420 }}>Crie um site, copie o formulário e cole no HTML. Cada pessoa que preencher vira um lead aqui, com a página e o anúncio de onde veio.</span>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
