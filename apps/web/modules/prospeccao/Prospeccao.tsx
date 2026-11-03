"use client";

import { formatarNumero } from "@domus-ads/core/mensagens";
import { NICHOS_SUGERIDOS, ROTULO_TIPO_SITE, type StatusProspecto, type TipoSite } from "@domus-ads/core/prospeccao";
import {
  Ban, Building2, Check, Download, ExternalLink, Globe, Loader2, Mail, MapPin, MessageCircleOff, Phone, Radar, Search, Sparkles, Star, StickyNote, Trash2, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { InstagramIcon, WhatsappIcon } from "../connections/Logos";
import { Num } from "../mensagens/Leads";
import { entrar } from "../motion/entrar";
import { confirmar } from "../shell/confirmar";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { anotarProspecto, apagarProspeccao, cancelarProspeccao, criarProspeccao, mandarParaCrm, marcarProspectos } from "./actions";

export interface Busca {
  id: string; nicho: string; cidade: string; bairros: string[]; profundidade: number; status: string; progresso: number; encontrados: number; novos: number; erro: string | null; created_at: string;
}
export interface Prospecto {
  id: string; prospeccao_id: string | null; nome: string; categoria: string | null; endereco: string | null; telefone: string | null; whatsapp: string | null;
  site: string | null; tipo_site: TipoSite; emails: string[]; redes: Record<string, string>; nota: number | null; avaliacoes: number | null; link: string | null;
  pontos: number; status: StatusProspecto; nota_interna: string | null;
}

const ROTULO_STATUS: Record<StatusProspecto, string> = { NOVO: "Novo", CONTATADO: "Contatado", DESCARTADO: "Descartado", LEAD: "No CRM" };
const QUANTOS = [[1, "~20"], [2, "~40"], [3, "~60"], [4, "~80"], [6, "~120"]] as const;
const ROTULO_BUSCA: Record<string, string> = { FILA: "Na fila", RODANDO: "Buscando", PRONTO: "Pronta", ERRO: "Erro", CANCELADO: "Cancelada" };
const POR_PAGINA = 60;

type Filtro = { busca: string | null; texto: string; site: "todos" | TipoSite | "SEM_PROPRIO"; status: "abertos" | StatusProspecto | "todos"; whats: boolean; ordem: "pontos" | "avaliacoes" | "nota" | "nome" };
const INICIAL: Filtro = { busca: null, texto: "", site: "SEM_PROPRIO", status: "abertos", whats: false, ordem: "pontos" };

/** CRM → Prospecção: busca empresas no Google Maps (worker) e separa as que mais precisam de site. */
export function Prospeccao({ buscas, prospectos, online }: { buscas: Busca[]; prospectos: Prospecto[]; online: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<Filtro>(INICIAL);
  const [pagina, setPagina] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ficha, setFicha] = useState<Prospecto | null>(null);
  const [pend, start] = useTransition();
  const rodando = buscas.some((b) => b.status === "FILA" || b.status === "RODANDO");

  // busca em andamento: atualiza sozinha
  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 4000);
    return () => clearInterval(t);
  }, [rodando, router]);

  const daBusca = f.busca ? prospectos.filter((p) => p.prospeccao_id === f.busca) : prospectos;
  const q = f.texto.trim().toLowerCase();
  const vistos = useMemo(() => daBusca.filter((p) =>
    (f.site === "todos" || (f.site === "SEM_PROPRIO" ? p.tipo_site !== "PROPRIO" : p.tipo_site === f.site))
    && (f.status === "todos" || (f.status === "abertos" ? p.status === "NOVO" || p.status === "CONTATADO" : p.status === f.status))
    && (!f.whats || !!p.whatsapp)
    && (!q || `${p.nome} ${p.categoria ?? ""} ${p.endereco ?? ""}`.toLowerCase().includes(q)),
  ).sort((a, b) => f.ordem === "nome" ? a.nome.localeCompare(b.nome) : f.ordem === "nota" ? (b.nota ?? 0) - (a.nota ?? 0)
    : f.ordem === "avaliacoes" ? (b.avaliacoes ?? 0) - (a.avaliacoes ?? 0) : b.pontos - a.pontos), [daBusca, f, q]);
  const pag = vistos.slice(0, pagina * POR_PAGINA);
  useEffect(() => { setPagina(1); setSel(new Set()); }, [f]);

  const k = {
    total: daBusca.length,
    semSite: daBusca.filter((p) => p.tipo_site === "NENHUM").length,
    rede: daBusca.filter((p) => p.tipo_site === "REDE_SOCIAL").length,
    whats: daBusca.filter((p) => p.whatsapp && p.tipo_site !== "PROPRIO").length,
    crm: daBusca.filter((p) => p.status === "LEAD").length,
  };

  const raiz = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const r = raiz.current;
    if (!r) return;
    const fins = [entrar(r.querySelectorAll(".prs-topo > *, .prs-form"), { y: 10 }, { stagger: 0.06 }),
      entrar(r.querySelectorAll(".crm-kpi"), { y: 16, scale: 0.97 }, { stagger: 0.05, delay: 0.1 })];
    return () => fins.forEach((x) => x());
  }, []);
  const grade = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => entrar(grade.current?.children ?? [], { y: 14 }, { stagger: 0.02, duration: 0.45 }), [f]);

  const marcar = (ids: string[], s: StatusProspecto) => start(async () => {
    const r = await marcarProspectos(ids, s);
    if (!r.ok) return toast.err(r.error);
    setSel(new Set());
    router.refresh();
  });
  const paraCrm = (p: Prospecto) => start(async () => {
    const r = await mandarParaCrm(p.id);
    if (!r.ok) return toast.err(r.error);
    toast.ok(`${p.nome} entrou no CRM`);
    router.push(`/crm?c=${r.data}`);
  });

  const exportar = () => {
    const col = ["nome", "categoria", "telefone", "whatsapp", "site", "tipo_site", "emails", "instagram", "nota", "avaliacoes", "endereco", "pontos", "status", "link"];
    const cel = (v: unknown) => { const t = String(v ?? "").replace(/"/g, '""'); return /^[=+\-@]/.test(t) ? `"'${t}"` : `"${t}"`; }; // sem fórmula no Excel
    const linhas = vistos.map((p) => [p.nome, p.categoria, p.telefone, p.whatsapp, p.site, ROTULO_TIPO_SITE[p.tipo_site], p.emails.join(" "), p.redes.instagram, p.nota, p.avaliacoes, p.endereco, p.pontos, ROTULO_STATUS[p.status], p.link].map(cel).join(";"));
    const blob = new Blob(["﻿" + [col.join(";"), ...linhas].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `prospeccao-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="prs" ref={raiz}>
      <header className="prs-topo">
        <div>
          <div className="eyebrow">CRM · DOMUS</div>
          <h1 className="page-title">Prospecção</h1>
          <p className="muted small" style={{ margin: 0 }}>Empresas do Google Maps que ainda não têm site, ordenadas por quem mais precisa e tem como pagar.</p>
        </div>
      </header>

      <NovaBusca online={online} />

      {buscas.length > 0 && (
        <div className="prs-buscas" role="tablist" aria-label="Buscas">
          <button role="tab" aria-selected={!f.busca} className="prs-busca" data-ativa={!f.busca} onClick={() => setF({ ...f, busca: null })}>
            <b>Todas as empresas</b><small>{prospectos.length} no total</small>
          </button>
          {buscas.map((b) => <CartaoBusca key={b.id} b={b} ativa={f.busca === b.id} escolher={() => setF({ ...f, busca: f.busca === b.id ? null : b.id })} />)}
        </div>
      )}

      <div className="crm-kpis prs-kpis">
        <Kpi rot="Empresas" v={k.total} sub={f.busca ? "nesta busca" : "em todas as buscas"} icone={<Building2 />} />
        <Kpi rot="Sem site" v={k.semSite} sub={k.total ? `${Math.round((k.semSite / k.total) * 100)}% das empresas` : "—"} icone={<Globe />} quente />
        <Kpi rot="Só rede social" v={k.rede} sub="Instagram, Linktree…" icone={<InstagramIcon />} />
        <Kpi rot="Com WhatsApp" v={k.whats} sub="sem site e com celular" icone={<WhatsappIcon />} />
        <Kpi rot="No CRM" v={k.crm} sub="viraram lead" icone={<Sparkles />} />
      </div>

      <div className="crm-barra prs-barra">
        <label className="wa-busca" style={{ margin: 0, flex: "1 1 240px" }}><Search size={15} aria-hidden />
          <input placeholder="Buscar nome, categoria ou endereço" value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} />
        </label>
        <select className="input input-sm prs-sel" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value as Filtro["site"] })} aria-label="Site">
          <option value="SEM_PROPRIO">Sem site próprio</option><option value="NENHUM">Sem site nenhum</option><option value="REDE_SOCIAL">Só rede social</option>
          <option value="PROPRIO">Têm site</option><option value="todos">Todas</option>
        </select>
        <select className="input input-sm prs-sel" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Filtro["status"] })} aria-label="Situação">
          <option value="abertos">A trabalhar</option><option value="NOVO">Novos</option><option value="CONTATADO">Contatados</option>
          <option value="LEAD">No CRM</option><option value="DESCARTADO">Descartados</option><option value="todos">Todas</option>
        </select>
        <select className="input input-sm prs-sel" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value as Filtro["ordem"] })} aria-label="Ordenar">
          <option value="pontos">Mais promissoras</option><option value="avaliacoes">Mais avaliações</option><option value="nota">Melhor nota</option><option value="nome">Nome</option>
        </select>
        <button className="chip" data-active={f.whats} aria-pressed={f.whats} onClick={() => setF({ ...f, whats: !f.whats })}><WhatsappIcon aria-hidden /> Com WhatsApp</button>
        <button className="btn btn-ghost btn-sm" onClick={exportar} disabled={!vistos.length}><Download aria-hidden /> CSV</button>
      </div>

      {sel.size > 0 && (
        <div className="prs-lote">
          <b>{sel.size} selecionada(s)</b>
          <button className="btn btn-ghost btn-xs" onClick={() => marcar([...sel], "CONTATADO")} disabled={pend}><Check aria-hidden /> Contatadas</button>
          <button className="btn btn-ghost btn-xs" onClick={() => marcar([...sel], "DESCARTADO")} disabled={pend}><Ban aria-hidden /> Descartar</button>
          <button className="btn btn-ghost btn-xs" onClick={() => marcar([...sel], "NOVO")} disabled={pend}>Voltar para novas</button>
          <button className="btn btn-ghost btn-xs" style={{ marginLeft: "auto" }} onClick={() => setSel(new Set())}><X aria-hidden /> Limpar</button>
        </div>
      )}

      <div className="prs-grade" ref={grade}>
        {pag.map((p) => (
          <article key={p.id} className="prs-card" data-status={p.status} onClick={() => setFicha(p)}>
            <header>
              <input type="checkbox" aria-label={`Selecionar ${p.nome}`} checked={sel.has(p.id)} onClick={(e) => e.stopPropagation()}
                onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(p.id); else s.delete(p.id); setSel(s); }} />
              <span className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                <b className="crm-trunc" title={p.nome}>{p.nome}</b>
                <small className="crm-trunc subtle">{p.categoria ?? "—"}</small>
              </span>
              <Pontos v={p.pontos} />
            </header>
            <div className="prs-tags">
              <span className="prs-site" data-tipo={p.tipo_site}>{ROTULO_TIPO_SITE[p.tipo_site]}</span>
              {p.nota != null && <span className="prs-nota"><Star aria-hidden /> {p.nota.toFixed(1).replace(".", ",")} <small>({p.avaliacoes ?? 0})</small></span>}
              {p.status !== "NOVO" && <span className="prs-status" data-s={p.status}>{ROTULO_STATUS[p.status]}</span>}
            </div>
            {p.endereco && <p className="prs-end"><MapPin aria-hidden /> <span className="crm-trunc">{p.endereco}</span></p>}
            <footer onClick={(e) => e.stopPropagation()}>
              {p.whatsapp ? <span className="prs-ok" title={formatarNumero(p.whatsapp)}><WhatsappIcon aria-hidden /></span> : p.telefone ? <span title={p.telefone}><Phone aria-hidden /></span> : <span className="prs-sem" title="Sem telefone"><Phone aria-hidden /></span>}
              {p.emails.length > 0 && <span title={p.emails.join(", ")}><Mail aria-hidden /></span>}
              {p.redes.instagram && <a href={p.redes.instagram} target="_blank" rel="noreferrer noopener" title="Instagram"><InstagramIcon aria-hidden /></a>}
              {p.link && <a href={p.link} target="_blank" rel="noreferrer noopener" title="Abrir no Google Maps"><MapPin aria-hidden /></a>}
              <span style={{ flex: 1 }} />
              {p.status === "LEAD" ? <Link className="btn btn-ghost btn-xs" href={`/crm?c=${p.whatsapp}`}>Conversa</Link>
                : p.whatsapp && <button className="btn btn-secondary btn-xs" disabled={pend} onClick={() => paraCrm(p)}><Sparkles aria-hidden /> Para o CRM</button>}
            </footer>
          </article>
        ))}
      </div>
      {!vistos.length && (
        <div className="panel"><div className="empty">
          <span className="icon-tile"><Radar aria-hidden /></span>
          <h2 className="h3">{prospectos.length ? "Nenhuma empresa com esses filtros" : "Nenhuma empresa ainda"}</h2>
          <p className="muted" style={{ maxWidth: 460 }}>{prospectos.length ? "Mude os filtros acima ou escolha outra busca." : "Diga o tipo de empresa e a cidade acima. O worker busca no Google Maps e as que não têm site aparecem aqui primeiro."}</p>
        </div></div>
      )}
      {vistos.length > pag.length && <button className="btn btn-secondary btn-sm" style={{ alignSelf: "center" }} onClick={() => setPagina(pagina + 1)}>Mostrar mais ({vistos.length - pag.length})</button>}

      {ficha && <Ficha p={prospectos.find((x) => x.id === ficha.id) ?? ficha} fechar={() => setFicha(null)} paraCrm={paraCrm} marcar={marcar} pend={pend} />}
    </div>
  );
}

function NovaBusca({ online }: { online: boolean }) {
  const router = useRouter();
  const [nicho, setNicho] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairros, setBairros] = useState("");
  const [prof, setProf] = useState(3);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const lista = bairros.split(/[,;\n]/).map((b) => b.trim()).filter((b) => b.length >= 2);
  const estimativa = (1 + lista.length) * prof * 20;
  const enviar = () => start(async () => {
    const r = await criarProspeccao({ nicho, cidade, bairros: lista, profundidade: prof });
    if (!r.ok) return setErro(r.error);
    toast.ok("Busca na fila do worker");
    setNicho(""); setBairros("");
    router.refresh();
  });
  return (
    <form className="panel prs-form" onSubmit={(e) => { e.preventDefault(); setErro(null); enviar(); }}>
      <span className="prs-form-ic"><Radar aria-hidden /></span>
      <div className="field"><label className="label" htmlFor="prs-nicho">Tipo de empresa</label>
        <input id="prs-nicho" className="input" list="prs-nichos" value={nicho} onChange={(e) => setNicho(e.target.value)} placeholder="dentista, advogado, pet shop…" maxLength={80} />
        <datalist id="prs-nichos">{NICHOS_SUGERIDOS.map((n) => <option key={n} value={n} />)}</datalist>
      </div>
      <div className="field"><label className="label" htmlFor="prs-cidade">Cidade</label>
        <input id="prs-cidade" className="input" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Belo Horizonte, MG" maxLength={120} />
      </div>
      <div className="field" style={{ flex: "1.4 1 220px" }}><label className="label" htmlFor="prs-bairros">Bairros <small className="subtle">(opcional, separados por vírgula)</small></label>
        <input id="prs-bairros" className="input" value={bairros} onChange={(e) => setBairros(e.target.value)} placeholder="Savassi, Funcionários, Buritis" />
      </div>
      <div className="field" style={{ flex: "0 0 auto" }}><span className="label">Por busca</span>
        <div className="prs-qtd">{QUANTOS.map(([v, r]) => <button key={v} type="button" className="chip" data-active={prof === v} onClick={() => setProf(v)}>{r}</button>)}</div>
      </div>
      <div className="prs-form-fim">
        <button type="submit" className="btn btn-primary" disabled={pend || nicho.trim().length < 2 || cidade.trim().length < 2}>
          {pend ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />} Buscar empresas
        </button>
        <small className="subtle">até ~{estimativa} empresas · {online ? "worker online" : "worker offline: começa quando ligar"}</small>
      </div>
      {erro && <p className="error-text" role="alert" style={{ flexBasis: "100%", margin: 0 }}>{erro}</p>}
    </form>
  );
}

function CartaoBusca({ b, ativa, escolher }: { b: Busca; ativa: boolean; escolher: () => void }) {
  const router = useRouter();
  const ativo = b.status === "FILA" || b.status === "RODANDO";
  const barra = useRef<HTMLSpanElement>(null);
  return (
    <div role="tab" aria-selected={ativa} tabIndex={0} className="prs-busca" data-ativa={ativa} data-status={b.status} onClick={escolher} onKeyDown={(e) => { if (e.key === "Enter") escolher(); }}>
      <b className="crm-trunc">{b.nicho} · {b.cidade}</b>
      <small>{ROTULO_BUSCA[b.status] ?? b.status}{ativo ? ` · ${b.encontrados} achada(s)` : b.status === "PRONTO" ? ` · ${b.encontrados} (${b.novos} nova${b.novos === 1 ? "" : "s"})` : ""}</small>
      {ativo && <span className="prs-prog"><span ref={barra} style={{ width: `${Math.max(4, b.progresso)}%` }} /></span>}
      {b.erro && <small className="prs-erro" title={b.erro}>{b.erro}</small>}
      <span className="prs-busca-acao" onClick={(e) => e.stopPropagation()}>
        {ativo ? (
          <button className="btn btn-ghost btn-xs" aria-label="Cancelar busca" onClick={async () => {
            if (!(await confirmar("Cancelar esta busca?"))) return;
            const r = await cancelarProspeccao(b.id); if (!r.ok) toast.err(r.error); else router.refresh();
          }}><X aria-hidden /></button>
        ) : (
          <button className="btn btn-ghost btn-xs" aria-label="Apagar busca do histórico" onClick={async () => {
            if (!(await confirmar("Apagar esta busca do histórico? As empresas que ela achou continuam na lista."))) return;
            const r = await apagarProspeccao(b.id); if (!r.ok) toast.err(r.error); else router.refresh();
          }}><Trash2 aria-hidden /></button>
        )}
      </span>
    </div>
  );
}

function Kpi({ rot, v, sub, icone, quente }: { rot: string; v: number; sub: string; icone: React.ReactNode; quente?: boolean }) {
  return (
    <div className="crm-kpi" data-quente={quente}>
      <span className="crm-kpi-rot">{icone}{rot}</span>
      <span className="crm-kpi-val"><Num v={v} /></span>
      <span className="crm-kpi-sub">{sub}</span>
    </div>
  );
}

function Pontos({ v }: { v: number }) {
  const tom = v >= 70 ? "quente" : v >= 45 ? "morno" : "frio";
  return <span className="prs-pontos" data-tom={tom} title="Quanto parece precisar de site e ter como pagar (0–100)">{v}</span>;
}

function Ficha({ p, fechar, paraCrm, marcar, pend }: { p: Prospecto; fechar: () => void; paraCrm: (p: Prospecto) => void; marcar: (ids: string[], s: StatusProspecto) => void; pend: boolean }) {
  const router = useRouter();
  const [nota, setNota] = useState(p.nota_interna ?? "");
  const [salvando, start] = useTransition();
  const redes = Object.entries(p.redes);
  const salvarNota = () => start(async () => {
    const r = await anotarProspecto(p.id, nota);
    if (!r.ok) return toast.err(r.error);
    toast.ok("Anotação salva");
    router.refresh();
  });
  return (
    <Dialog open onClose={fechar} title={p.nome}>
      <div className="stack prs-ficha" style={{ gap: 14 }}>
        <div className="prs-ficha-topo">
          <Pontos v={p.pontos} />
          <span className="stack" style={{ gap: 4, minWidth: 0 }}>
            <span className="subtle small">{p.categoria ?? "—"}</span>
            <span className="prs-tags"><span className="prs-site" data-tipo={p.tipo_site}>{ROTULO_TIPO_SITE[p.tipo_site]}</span>
              {p.nota != null && <span className="prs-nota"><Star aria-hidden /> {p.nota.toFixed(1).replace(".", ",")} <small>({p.avaliacoes ?? 0} avaliações)</small></span>}
              <span className="prs-status" data-s={p.status}>{ROTULO_STATUS[p.status]}</span></span>
          </span>
        </div>
        <ul className="prs-dados">
          {p.telefone && <li><Phone aria-hidden /><span>{p.telefone}{p.whatsapp ? " · WhatsApp" : " · fixo"}</span></li>}
          {p.emails.map((e) => <li key={e}><Mail aria-hidden /><a href={`mailto:${e}`}>{e}</a></li>)}
          {p.site && <li><Globe aria-hidden /><a href={/^https?:/i.test(p.site) ? p.site : `https://${p.site}`} target="_blank" rel="noreferrer noopener">{p.site.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}</a></li>}
          {redes.map(([k, u]) => <li key={k}><ExternalLink aria-hidden /><a href={u} target="_blank" rel="noreferrer noopener">{k}</a></li>)}
          {p.endereco && <li><MapPin aria-hidden /><span>{p.endereco}</span></li>}
          {p.link && <li><MapPin aria-hidden /><a href={p.link} target="_blank" rel="noreferrer noopener">Abrir no Google Maps</a></li>}
        </ul>
        <div className="field">
          <label className="label" htmlFor="prs-nota"><StickyNote size={13} aria-hidden /> Anotação</label>
          <textarea id="prs-nota" className="input" rows={3} style={{ height: "auto", paddingBlock: 10 }} maxLength={1000} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: falei com a recepção, ligar de novo sexta" onBlur={() => { if (nota !== (p.nota_interna ?? "")) salvarNota(); }} />
        </div>
        {!p.whatsapp && <p className="subtle small" style={{ margin: 0 }}><MessageCircleOff size={14} aria-hidden /> Sem celular no Google Maps: não dá para mandar para Mensagens. Use o telefone ou o e-mail.</p>}
        <p className="subtle caption" style={{ margin: 0 }}>No CRM, a conversa com empresa prospectada é primeiro contato: sem link e poucas mensagens até responder (protege o número de ban).</p>
        <div className="cluster" style={{ justifyContent: "flex-end", gap: 8 }}>
          {salvando && <Loader2 className="animate-spin subtle" aria-hidden />}
          {p.status !== "DESCARTADO" && p.status !== "LEAD" && <button className="btn btn-ghost btn-sm" disabled={pend} onClick={() => { marcar([p.id], "DESCARTADO"); fechar(); }}><Ban aria-hidden /> Descartar</button>}
          {p.status === "NOVO" && <button className="btn btn-ghost btn-sm" disabled={pend} onClick={() => marcar([p.id], "CONTATADO")}><Check aria-hidden /> Contatada</button>}
          {p.status === "LEAD" ? <Link className="btn btn-primary btn-sm" href={`/crm?c=${p.whatsapp}`}><WhatsappIcon aria-hidden /> Abrir conversa</Link>
            : p.whatsapp && <button className="btn btn-primary btn-sm" disabled={pend} onClick={() => paraCrm(p)}><Sparkles aria-hidden /> Mandar para o CRM</button>}
        </div>
      </div>
    </Dialog>
  );
}
