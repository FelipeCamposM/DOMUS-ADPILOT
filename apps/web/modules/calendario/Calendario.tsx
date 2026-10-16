"use client";

import { faltasItem, FORMATOS_CAL, type FormatoCal, type Roteiro } from "@domus-ads/core/calendario";
import { LIMITES_IG } from "@domus-ads/core/instagram-regras";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarRange, Check, CheckCheck, ChevronLeft, CircleDot, ChevronRight, Clapperboard, ExternalLink, GalleryHorizontal, ImageIcon, Loader2, Plus, RefreshCw, Sparkles, Trash2, Undo2, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ItemTela, PlanoTela, PostAvulso } from "@/lib/calendario";
import { DataPicker } from "../shell/DataPicker";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { gradeDoMes, somaDias } from "./grade";
import { apagarPlanejamento, aprovarItens, descartarItem, novoItem, planejarPeriodo, refazerComIA, replanejar, salvarItem, voltarParaSugestao } from "./actions";

const TZ = "America/Sao_Paulo";
const ICONE: Record<FormatoCal, typeof ImageIcon> = { FEED: ImageIcon, CARROSSEL: GalleryHorizontal, REELS: Clapperboard };
const ICONE_POST = { ...ICONE, STORY: CircleDot };
const STATUS: Record<string, string> = { SUGERIDO: "Sugestão", APROVADO: "Aprovado", GERANDO: "Gerando arte", AGENDADO: "Agendado", PUBLICADO: "Publicado", FALHOU: "Falhou" };
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-10-20" do horário de Brasília (a grade e o worker usam o mesmo fuso). */
const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const paraInput = (iso: string) => `${diaDe(iso)}T${horaDe(iso)}`;
const deInput = (v: string) => new Date(`${v}:00-03:00`).toISOString();
const hojeBr = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

export function Calendario({ conta, contas, marcas, mes, itens, avulsos, planos, podeEditar }: {
  conta: { id: string; username: string }; contas: { id: string; username: string }[]; marcas: { id: string; nome: string }[];
  mes: string; itens: ItemTela[]; avulsos: PostAvulso[]; planos: PlanoTela[]; podeEditar: boolean;
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [aberto, setAberto] = useState<string | null>(null);
  const [planejar, setPlanejar] = useState(false);
  const [verPlanos, setVerPlanos] = useState(false);
  const dias = useMemo(() => gradeDoMes(mes), [mes]);
  const porDia = useMemo(() => {
    // posts do calendário e publicações agendadas à mão, na ordem do horário
    const todos = [...itens.map((i) => ({ hora: i.data_hora, i, p: null })), ...avulsos.map((p) => ({ hora: p.data, i: null, p }))].sort((a, b) => a.hora.localeCompare(b.hora));
    const m = new Map<string, typeof todos>();
    for (const t of todos) m.set(diaDe(t.hora), [...(m.get(diaDe(t.hora)) ?? []), t]);
    return m;
  }, [itens, avulsos]);
  const hoje = hojeBr();
  const item = itens.find((i) => i.id === aberto) ?? null;
  const sugeridos = itens.filter((i) => i.status === "SUGERIDO" && !i.refazendo);
  const prontos = sugeridos.filter((i) => !faltasItem(i).length && Date.parse(i.data_hora) > Date.now() + 10 * 60_000);
  const trabalhando = planos.some((p) => p.status === "GERANDO") || itens.some((i) => i.refazendo);
  const gerando = itens.some((i) => i.status === "GERANDO" || i.status === "AGENDADO");

  // acompanha a IA (3 s) e a geração das artes (15 s) sem recarregar a página
  useEffect(() => {
    if (!trabalhando && !gerando) return;
    const t = setInterval(() => router.refresh(), trabalhando ? 3000 : 15000);
    return () => clearInterval(t);
  }, [trabalhando, gerando, router]);

  const navegar = (delta: number) => {
    const [y, m] = mes.split("-").map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    router.push(`/conteudos?conta=${conta.id}&mes=${d.toISOString().slice(0, 7)}`);
  };
  const acao = (fn: () => Promise<{ ok: boolean; error?: string }>, msg?: string) => start(async () => {
    const r = await fn();
    if (!r.ok) toast.err(r.error ?? "Erro"); else if (msg) toast.ok(msg);
    router.refresh();
  });
  const planoDoDia = (d: string) => planos.find((p) => p.inicio <= d && d <= p.fim);

  const titulo = new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="cal-pagina">
      <div className="page-head">
        <div>
          <div className="eyebrow" data-enter>@{conta.username} · Instagram</div>
          <h1 className="page-title" data-enter>Conteúdos programados</h1>
        </div>
        <div className="cluster" data-enter>
          {contas.length > 1 && contas.map((c) => <Link key={c.id} href={`/conteudos?conta=${c.id}&mes=${mes}`} className="chip" data-active={c.id === conta.id}>@{c.username}</Link>)}
          <Link href={`/instagram?conta=${conta.id}`} className="btn btn-ghost btn-sm"><ChevronLeft aria-hidden /> Perfil</Link>
          {planos.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setVerPlanos(true)}><CalendarRange aria-hidden /> Planejamentos ({planos.length})</button>}
          {podeEditar && <button className="btn btn-primary btn-sm" onClick={() => setPlanejar(true)}><Sparkles aria-hidden /> Planejar período</button>}
        </div>
      </div>

      {planos.filter((p) => p.status !== "PRONTO" || p.erro).map((p) => (
        <div key={p.id} className="cal-aviso" data-status={p.status}>
          {p.status === "GERANDO" ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <AlertTriangle size={16} aria-hidden />}
          <span style={{ flex: 1 }}>
            <b>{fmtPeriodo(p)}</b>{p.marca ? ` · ${p.marca}` : ""} ·{" "}
            {p.status === "GERANDO" ? "a IA está planejando os posts (olhando a marca, o site e os seus melhores posts)…" : p.erro}
          </span>
          {podeEditar && p.status !== "GERANDO" && <button className="btn btn-ghost btn-xs" disabled={pend} onClick={() => acao(() => replanejar(p.id), "Planejando de novo")}><RefreshCw aria-hidden /> Tentar de novo</button>}
        </div>
      ))}

      {podeEditar && sugeridos.length > 0 && (
        <div className="cal-aviso" data-status="SUGERIDO">
          <Wand2 size={16} aria-hidden />
          <span style={{ flex: 1 }}><b>{sugeridos.length} sugestão(ões)</b> esperando você. Clique num post para ajustar; o que for aprovado é gerado e publicado sozinho.</span>
          {prontos.length > 0 && <button className="btn btn-primary btn-xs" disabled={pend} onClick={() => start(async () => {
            const r = await aprovarItens(prontos.map((i) => i.id));
            if (!r.ok) toast.err(r.error); else toast.ok(`${r.data.aprovados} post(s) aprovado(s)${r.data.motivo ? ` · ficou de fora ${r.data.motivo}` : ""}`);
            router.refresh();
          })}><CheckCheck aria-hidden /> Aprovar {prontos.length} pronto(s)</button>}
        </div>
      )}

      <div className="panel cal" data-enter>
        <div className="cal-topo">
          <button className="btn btn-ghost btn-xs" onClick={() => navegar(-1)} aria-label="Mês anterior"><ChevronLeft aria-hidden /></button>
          <b className="cal-mes">{titulo}</b>
          <button className="btn btn-ghost btn-xs" onClick={() => navegar(1)} aria-label="Próximo mês"><ChevronRight aria-hidden /></button>
          <span style={{ flex: 1 }} />
          <span className="cal-legenda">{Object.entries(STATUS).map(([k, v]) => <span key={k} data-status={k}><i />{v}</span>)}</span>
        </div>
        <div className="cal-grade">
          {SEMANA.map((d) => <div key={d} className="cal-sem">{d}</div>)}
          {dias.map((d) => {
            const lista = porDia.get(d) ?? [];
            const plano = planoDoDia(d);
            return (
              <div key={d} className="cal-dia" data-fora={!d.startsWith(mes)} data-hoje={d === hoje} data-passado={d < hoje} data-tem={lista.length > 0}>
                <span className="cal-num">{Number(d.slice(8))}<small>{new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" })}</small></span>
                {lista.map(({ i: doCal, p }) => {
                  if (p) {
                    const Icone = ICONE_POST[p.tipo];
                    return (
                      <Link key={p.id} href={`/instagram/publicar/${p.id}`} className="cal-item" data-status={p.status === "PUBLICANDO" ? "AGENDADO" : p.status} title={`${STATUS[p.status] ?? "Publicando"} · agendado à mão`}>
                        {p.status === "PUBLICANDO" ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Icone size={12} aria-hidden />}
                        <b>{horaDe(p.data)}</b><span>{p.tipo === "STORY" ? "Story" : p.legenda.split(/\n/)[0] || FORMATOS_CAL[p.tipo]}</span>
                      </Link>
                    );
                  }
                  const i = doCal!;
                  const Icone = ICONE[i.formato];
                  return (
                    <button key={i.id} type="button" className="cal-item" data-status={i.status} onClick={() => setAberto(i.id)} title={`${STATUS[i.status]} · ${i.tema}`}>
                      {i.refazendo || i.status === "GERANDO" ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Icone size={12} aria-hidden />}
                      <b>{horaDe(i.data_hora)}</b><span>{i.tema}</span>
                    </button>
                  );
                })}
                {podeEditar && d >= hoje && (
                  <button type="button" className="cal-mais" aria-label={`Adicionar post em ${d}`} disabled={pend} onClick={() => start(async () => {
                    const r = await novoItem(conta.id, plano?.id ?? null, new Date(`${d}T${d === hoje ? horaDe(new Date(Date.now() + 2 * 3_600_000).toISOString()) : "12:00"}:00-03:00`).toISOString(), "FEED");
                    if (!r.ok) return toast.err(r.error);
                    router.refresh();
                    setAberto(r.data);
                  })}><Plus size={13} aria-hidden /></button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={verPlanos && planos.length > 0} onClose={() => setVerPlanos(false)} title="Planejamentos" largo>
          <table className="data">
            <tbody>
              {planos.map((p) => (
                <tr key={p.id}>
                  <td><b>{fmtPeriodo(p)}</b>{p.marca && <span className="subtle"> · {p.marca}</span>}<div className="caption subtle" style={{ maxWidth: 520 }}>{p.objetivo}</div></td>
                  <td className="small">{p.itens} post(s){p.sugeridos ? ` · ${p.sugeridos} sugestão(ões)` : ""}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {podeEditar && <>
                      <button className="btn btn-ghost btn-xs" disabled={pend || p.status === "GERANDO"} title="Troca as sugestões não aprovadas por novas" onClick={() => confirm("Planejar de novo? As sugestões não aprovadas deste período são trocadas; as aprovadas ficam.") && acao(() => replanejar(p.id), "Planejando de novo")}><RefreshCw aria-hidden /> Refazer sugestões</button>
                      <button className="btn btn-ghost btn-xs" disabled={pend} aria-label="Apagar planejamento" onClick={() => confirm("Apagar este planejamento e as sugestões dele? O que já foi agendado continua em Planejados.") && acao(() => apagarPlanejamento(p.id), "Planejamento apagado")}><Trash2 aria-hidden /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      </Dialog>

      <Planejar open={planejar} onClose={() => setPlanejar(false)} contaId={conta.id} marcas={marcas} />
      <Dialog open={!!item} onClose={() => setAberto(null)} title={item ? `${FORMATOS_CAL[item.formato]} · ${new Date(item.data_hora).toLocaleString("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}` : ""} largo>
        {item && <Editor key={`${item.id}-${item.updated_at}`} item={item} podeEditar={podeEditar} onFechar={() => setAberto(null)} />}
      </Dialog>
    </div>
  );
}

const fmtPeriodo = (p: { inicio: string; fim: string }) => {
  const f = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
  return `${f(p.inicio)} – ${f(p.fim)}`;
};

/** Pedido do período: perfil fixo, marca, datas, objetivo e quantos de cada formato por semana. */
function Planejar({ open, onClose, contaId, marcas }: { open: boolean; onClose: () => void; contaId: string; marcas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const domingo = (() => { const h = hojeBr(); return somaDias(h, 7 - new Date(`${h}T12:00:00Z`).getUTCDay()); })();
  const [f, setF] = useState({ marcaId: marcas[0]?.id ?? "", inicio: domingo, fim: somaDias(domingo, 6), objetivo: "", mix: { FEED: 2, CARROSSEL: 1, REELS: 1 } });
  const periodo = (dias: number, de = domingo) => setF((x) => ({ ...x, inicio: de, fim: somaDias(de, dias - 1) }));
  const total = Math.round(((f.mix.FEED + f.mix.CARROSSEL + f.mix.REELS) * (Math.round((Date.parse(f.fim) - Date.parse(f.inicio)) / 86_400_000) + 1)) / 7);
  const enviar = () => start(async () => {
    const r = await planejarPeriodo({ contaId, marcaId: f.marcaId || null, inicio: f.inicio, fim: f.fim, objetivo: f.objetivo, mix: f.mix });
    if (!r.ok) return toast.err(r.error);
    toast.ok("A IA está planejando: as sugestões aparecem no calendário em instantes");
    onClose();
    router.push(`/conteudos?conta=${contaId}&mes=${f.inicio.slice(0, 7)}`);
    router.refresh();
  });
  return (
    <Dialog open={open} onClose={onClose} title="Planejar período">
      <div className="field"><label className="label" htmlFor="pl-marca">Marca</label>
        <select id="pl-marca" className="select" value={f.marcaId} onChange={(e) => setF({ ...f, marcaId: e.target.value })}>
          <option value="">Sem marca (usa só o perfil)</option>{marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        <span className="subtle caption">A IA lê a identidade, o tom e o site da marca.</span></div>
      <div className="field">
        <span className="label">Período</span>
        <div className="cluster" style={{ gap: 6 }}>
          <button type="button" className="chip" onClick={() => periodo(7)}>Próxima semana</button>
          <button type="button" className="chip" onClick={() => periodo(14)}>2 semanas</button>
          <button type="button" className="chip" onClick={() => { const h = hojeBr(); const [y, m] = h.split("-").map(Number) as [number, number]; const ini = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); periodo(new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), ini); }}>Próximo mês</button>
        </div>
        <div className="cluster" style={{ gap: 6 }}>
          <DataPicker value={f.inicio} min={hojeBr()} onChange={(d) => setF({ ...f, inicio: d, fim: f.fim < d ? d : f.fim })} ariaLabel="Início" />
          <span className="subtle">até</span>
          <DataPicker value={f.fim} min={f.inicio} onChange={(d) => setF({ ...f, fim: d })} ariaLabel="Fim" />
        </div>
      </div>
      <div className="field"><label className="label" htmlFor="pl-obj">Objetivo do período</label>
        <textarea id="pl-obj" className="input-sm" rows={3} style={{ height: "auto", paddingBlock: 8 }} maxLength={1000} value={f.objetivo} onChange={(e) => setF({ ...f, objetivo: e.target.value })}
          placeholder="Ex.: lançar o plano anual com 20% de desconto até dia 31; reforçar que o sistema funciona offline; atrair escolas de Goiânia" /></div>
      <div className="field">
        <span className="label">Posts por semana</span>
        <div className="cluster" style={{ gap: 10 }}>
          {(Object.keys(FORMATOS_CAL) as FormatoCal[]).map((k) => {
            const Icone = ICONE[k];
            return (
              <label key={k} className="cal-mix"><Icone size={15} aria-hidden /> {FORMATOS_CAL[k]}
                <input type="number" className="input-sm tabular" min={0} max={7} value={f.mix[k]} onChange={(e) => setF({ ...f, mix: { ...f.mix, [k]: Math.max(0, Math.min(7, Number(e.target.value) || 0)) } })} />
              </label>
            );
          })}
        </div>
        <span className="subtle caption">Cerca de {total} post(s) no período. Stories ficam de fora: todo post vai para os stories automaticamente (em breve).</span>
      </div>
      <div className="cluster" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary btn-sm" disabled={pend || f.objetivo.trim().length < 5} onClick={enviar}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Gerar sugestões</button>
      </div>
    </Dialog>
  );
}

/** Edição de um post: tudo em campos; cada parte tem ↻ para a IA refazer só ela (com um pedido opcional). */
function Editor({ item, podeEditar, onFechar }: { item: ItemTela; podeEditar: boolean; onFechar: () => void }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [v, setV] = useState({ dataHora: paraInput(item.data_hora), formato: item.formato, tema: item.tema, objetivo: item.objetivo, roteiro: item.roteiro, legenda: item.legenda, hashtags: item.hashtags.join(" ") });
  const [dica, setDica] = useState("");
  const editavel = podeEditar && (item.status === "SUGERIDO" || item.status === "APROVADO") && !item.refazendo;
  const r = v.roteiro;
  const setR = (x: Partial<Roteiro>) => setV({ ...v, roteiro: { ...r, ...x } });
  const tags = v.hashtags.split(/[\s,]+/).filter(Boolean).map((h) => `#${h.replace(/^#+/, "")}`);
  const dados = () => ({ dataHora: deInput(v.dataHora), formato: v.formato, tema: v.tema, objetivo: v.objetivo, roteiro: v.roteiro, legenda: v.legenda, hashtags: tags });
  const faltas = faltasItem({ formato: v.formato, roteiro: r, legenda: v.legenda, hashtags: tags });
  const sujo = JSON.stringify(v) !== JSON.stringify({ dataHora: paraInput(item.data_hora), formato: item.formato, tema: item.tema, objetivo: item.objetivo, roteiro: item.roteiro, legenda: item.legenda, hashtags: item.hashtags.join(" ") });

  const salvar = async () => {
    const s = await salvarItem(item.id, dados());
    if (!s.ok) { toast.err(s.error); return false; }
    if (s.data.voltouParaSugestao) toast.err("Faltou algo para continuar aprovado: o post voltou a ser sugestão");
    return true;
  };
  const refazer = (campo: string) => start(async () => {
    if (sujo && !(await salvar())) return; // o que foi editado vai junto para a IA
    const x = await refazerComIA(item.id, campo, dica);
    if (!x.ok) toast.err(x.error); else toast.ok(campo === "item" ? "A IA está refazendo o post" : `A IA está refazendo: ${campo}`);
    router.refresh();
  });
  const refazerBtn = (campo: string, rotulo?: string) => editavel ? (
    <button type="button" className="btn btn-ghost btn-xs cal-refazer" disabled={pend} onClick={() => refazer(campo)} title={`A IA refaz ${rotulo ?? campo}${dica ? " seguindo o seu pedido" : ""}`}>
      {item.refazendo === campo ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} {rotulo ? "Refazer post" : ""}
    </button>
  ) : item.refazendo === campo || item.refazendo === "item" ? <Loader2 size={14} className="animate-spin" aria-label="A IA está refazendo" /> : null;

  return (
    <div className="cal-editor">
      {(item.erro || item.refazendo) && <div className="cal-aviso" data-status={item.refazendo ? "GERANDO" : "FALHOU"}>{item.refazendo ? <Loader2 className="animate-spin" size={15} aria-hidden /> : <AlertTriangle size={15} aria-hidden />}<span>{item.refazendo ? "A IA está refazendo este post…" : item.erro}</span></div>}
      {item.status !== "SUGERIDO" && item.status !== "APROVADO" && (
        <div className="cal-aviso" data-status={item.status}>
          {item.status === "GERANDO" ? <Loader2 className="animate-spin" size={15} aria-hidden /> : item.status === "FALHOU" ? <AlertTriangle size={15} aria-hidden /> : <Check size={15} aria-hidden />}
          <span style={{ flex: 1 }}>{STATUS[item.status]}{item.status === "GERANDO" && item.etapa ? `: ${item.etapa}` : ""}{item.status === "AGENDADO" ? ": a arte está pronta e sai sozinha no horário." : ""}</span>
          {item.project_id && <Link className="btn btn-ghost btn-xs" href={`/studio/${item.project_id}`}>Ver arte</Link>}
          {item.post_id && <Link className="btn btn-ghost btn-xs" href={`/instagram/publicar/${item.post_id}`}>Abrir publicação</Link>}
          {item.permalink && <a className="btn btn-ghost btn-xs" href={item.permalink} target="_blank" rel="noreferrer">No Instagram <ExternalLink aria-hidden /></a>}
        </div>
      )}
      {item.capa && <img className="cal-capa" src={`/api/creatives/${item.capa}/file`} alt="Arte do post" />}

      <fieldset disabled={!editavel || pend} className="cal-campos">
        <div className="cluster" style={{ gap: 10 }}>
          <div className="field"><label className="label" htmlFor="ed-quando">Data e hora (Brasília)</label>
            <DataPicker id="ed-quando" hora value={v.dataHora} min={hojeBr()} onChange={(d) => setV({ ...v, dataHora: d })} /></div>
          <div className="field"><label className="label" htmlFor="ed-formato">Formato</label>
            <select id="ed-formato" className="select" value={v.formato} onChange={(e) => setV({ ...v, formato: e.target.value as FormatoCal })}>
              {(Object.keys(FORMATOS_CAL) as FormatoCal[]).map((k) => <option key={k} value={k}>{FORMATOS_CAL[k]}</option>)}
            </select></div>
          <span style={{ flex: 1 }} />
          <span className="chip cal-status" data-status={item.status}>{STATUS[item.status]}</span>
        </div>

        <div className="field"><div className="cal-rotulo"><label className="label" htmlFor="ed-tema">Tema</label>{refazerBtn("tema")}</div>
          <input id="ed-tema" className="input-sm" maxLength={160} value={v.tema} onChange={(e) => setV({ ...v, tema: e.target.value })} /></div>
        <div className="field"><label className="label" htmlFor="ed-obj">Objetivo do post</label>
          <input id="ed-obj" className="input-sm" maxLength={300} value={v.objetivo} onChange={(e) => setV({ ...v, objetivo: e.target.value })} placeholder="Ex.: gerar salvamentos, levar ao link da bio" /></div>

        <div className="cal-bloco">
          <div className="cal-rotulo"><b>{v.formato === "REELS" ? "Roteiro do vídeo" : v.formato === "CARROSSEL" ? "Slides" : "Arte"}</b>{refazerBtn("roteiro")}</div>
          {v.formato === "FEED" && <>
            <input className="input-sm" maxLength={120} value={r.headline} onChange={(e) => setR({ headline: e.target.value })} placeholder="Título grande da arte" aria-label="Título da arte" />
            <input className="input-sm" maxLength={200} value={r.apoio} onChange={(e) => setR({ apoio: e.target.value })} placeholder="Texto de apoio" aria-label="Texto de apoio" />
          </>}
          {v.formato === "CARROSSEL" && <>
            {r.slides.map((s, n) => (
              <div key={n} className="cal-slide">
                <span className="cal-slide-n">{n + 1}</span>
                <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                  <input className="input-sm" maxLength={120} value={s.headline} placeholder="Título do slide" aria-label={`Título do slide ${n + 1}`} onChange={(e) => setR({ slides: r.slides.map((x, j) => (j === n ? { ...x, headline: e.target.value } : x)) })} />
                  <input className="input-sm" maxLength={200} value={s.apoio} placeholder="Texto do slide" aria-label={`Texto do slide ${n + 1}`} onChange={(e) => setR({ slides: r.slides.map((x, j) => (j === n ? { ...x, apoio: e.target.value } : x)) })} />
                </div>
                <div className="stack" style={{ gap: 2 }}>
                  <button type="button" className="btn btn-ghost btn-xs" aria-label="Subir slide" disabled={n === 0} onClick={() => { const l = [...r.slides]; [l[n - 1], l[n]] = [l[n]!, l[n - 1]!]; setR({ slides: l }); }}><ArrowUp aria-hidden /></button>
                  <button type="button" className="btn btn-ghost btn-xs" aria-label="Descer slide" disabled={n === r.slides.length - 1} onClick={() => { const l = [...r.slides]; [l[n + 1], l[n]] = [l[n]!, l[n + 1]!]; setR({ slides: l }); }}><ArrowDown aria-hidden /></button>
                </div>
                <button type="button" className="btn btn-ghost btn-xs" aria-label={`Tirar slide ${n + 1}`} onClick={() => setR({ slides: r.slides.filter((_, j) => j !== n) })}><X aria-hidden /></button>
              </div>
            ))}
            {r.slides.length < LIMITES_IG.carrosselMax && <button type="button" className="btn btn-ghost btn-xs" style={{ alignSelf: "flex-start" }} onClick={() => setR({ slides: [...r.slides, { headline: "", apoio: "", visual: "" }] })}><Plus aria-hidden /> Slide</button>}
          </>}
          {v.formato === "REELS" && <>
            <div className="cluster" style={{ gap: 6 }}>
              {([15, 30] as const).map((d) => <button key={d} type="button" className="chip" data-active={r.duracao === d} onClick={() => setR({ duracao: d })}>{d} s</button>)}
              <span className="subtle caption">{r.narracao.trim().split(/\s+/).filter(Boolean).length} palavras (ideal: {r.duracao === 15 ? "35–45" : "70–85"})</span>
            </div>
            <textarea className="input-sm" rows={5} style={{ height: "auto", paddingBlock: 8 }} maxLength={1500} value={r.narracao} onChange={(e) => setR({ narracao: e.target.value })} placeholder="O que a voz fala no vídeo" aria-label="Narração" />
          </>}
          <textarea className="input-sm" rows={2} style={{ height: "auto", paddingBlock: 8 }} maxLength={400} value={r.visual} onChange={(e) => setR({ visual: e.target.value })} placeholder="Como deve ser o visual (opcional)" aria-label="Visual" />
          <input className="input-sm" maxLength={60} value={r.cta} onChange={(e) => setR({ cta: e.target.value })} placeholder="Chamada para ação (ex.: Link na bio)" aria-label="Chamada para ação" />
        </div>

        <div className="field"><div className="cal-rotulo"><label className="label" htmlFor="ed-leg">Legenda</label><span className="subtle caption tabular">{v.legenda.length + (tags.length ? tags.join(" ").length + 2 : 0)}/2200</span>{refazerBtn("legenda")}</div>
          <textarea id="ed-leg" className="input-sm" rows={6} style={{ height: "auto", paddingBlock: 8 }} maxLength={2200} value={v.legenda} onChange={(e) => setV({ ...v, legenda: e.target.value })} /></div>
        <div className="field"><div className="cal-rotulo"><label className="label" htmlFor="ed-tags">Hashtags</label><span className="subtle caption tabular">{tags.length}/30</span>{refazerBtn("hashtags")}</div>
          <input id="ed-tags" className="input-sm" value={v.hashtags} onChange={(e) => setV({ ...v, hashtags: e.target.value })} placeholder="#gestaoescolar #goiania" /></div>
      </fieldset>

      {editavel && (
        <div className="cal-dica">
          <Wand2 size={15} aria-hidden />
          <input className="input-sm" maxLength={500} value={dica} onChange={(e) => setDica(e.target.value)} placeholder="Pedido para a IA ao refazer (opcional): ex.: mais curto, fale do app, tom mais divertido" aria-label="Pedido para a IA" />
          {refazerBtn("item", "o post inteiro")}
        </div>
      )}

      <div className="cal-rodape">
        {podeEditar && ["SUGERIDO", "APROVADO", "FALHOU"].includes(item.status) && (
          <button className="btn btn-ghost btn-sm" disabled={pend} onClick={() => confirm("Descartar este post do calendário?") && start(async () => { const x = await descartarItem(item.id); if (!x.ok) return toast.err(x.error); toast.ok("Post descartado"); onFechar(); router.refresh(); })}><Trash2 aria-hidden /> Descartar</button>
        )}
        {podeEditar && (item.status === "APROVADO" || item.status === "FALHOU") && (
          <button className="btn btn-ghost btn-sm" disabled={pend} onClick={() => start(async () => { const x = await voltarParaSugestao(item.id); if (!x.ok) toast.err(x.error); router.refresh(); })}><Undo2 aria-hidden /> Voltar para sugestão</button>
        )}
        <span style={{ flex: 1 }} />
        {editavel && faltas.length > 0 && <span className="subtle caption"><AlertTriangle size={13} aria-hidden style={{ verticalAlign: -2 }} /> {faltas[0]}</span>}
        {editavel && <button className="btn btn-secondary btn-sm" disabled={pend || !sujo} onClick={() => start(async () => { if (await salvar()) toast.ok("Salvo"); router.refresh(); })}>Salvar</button>}
        {editavel && item.status === "SUGERIDO" && (
          <button className="btn btn-primary btn-sm" disabled={pend || faltas.length > 0} onClick={() => start(async () => {
            if (sujo && !(await salvar())) return;
            const x = await aprovarItens([item.id]);
            if (!x.ok) toast.err(x.error); else if (!x.data.aprovados) toast.err(x.data.motivo ?? "Não deu para aprovar"); else { toast.ok("Aprovado: a arte é gerada perto da hora e o post sai sozinho"); onFechar(); }
            router.refresh();
          })}><Check aria-hidden /> {sujo ? "Salvar e aprovar" : "Aprovar"}</button>
        )}
      </div>
    </div>
  );
}
