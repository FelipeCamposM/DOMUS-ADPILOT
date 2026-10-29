"use client";

import { MAX_TEXTO_WA, preencherModelo, temLink, VARIAVEIS_MODELO } from "@domus-ads/core/mensagens";
import { CalendarClock, CheckCheck, Clock, CornerDownLeft, Flame, Loader2, MessageSquareText, Search, Settings2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { entrar } from "../motion/entrar";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { agendarMensagem, usarModelo } from "./actions";
import { formatar, type Modelo } from "./Mensagens";

type ContatoModelo = { nome: string; numero: string; site?: string | null };
const horaAgora = () => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date());

/**
 * Seletor de modelos em janela: lista com busca e categorias à esquerda, prévia do jeito que o contato vai receber
 * à direita. ↑/↓ escolhe, Enter usa no texto; também dá para agendar direto.
 */
export function EscolherModelo({ modelos, contato, frio, fechar, usar, agendar }: {
  modelos: Modelo[]; contato: ContatoModelo; frio: boolean; fechar: () => void; usar: (texto: string) => void; agendar: (texto: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const categorias = useMemo(() => [...new Set(modelos.map((m) => m.categoria))].sort(), [modelos]);
  const maisUsado = useMemo(() => modelos.reduce<Modelo | null>((a, m) => (m.usos > (a?.usos ?? 0) ? m : a), null), [modelos]);
  const q = busca.trim().toLowerCase();
  const vistos = modelos.filter((m) => (!cat || m.categoria === cat) && (!q || m.nome.toLowerCase().includes(q) || m.texto.toLowerCase().includes(q)));
  const [selId, setSelId] = useState<string | null>(modelos[0]?.id ?? null);
  const sel = vistos.find((m) => m.id === selId) ?? vistos[0] ?? null;
  const texto = sel ? preencherModelo(sel.texto, contato) : "";
  const vars = sel ? Object.keys(VARIAVEIS_MODELO).filter((v) => sel.texto.includes(v)) : [];
  const semSite = sel?.texto.includes("{site}") && !contato.site;

  const escolher = (m: Modelo, acao: "usar" | "agendar") => {
    void usarModelo(m.id);
    (acao === "usar" ? usar : agendar)(preencherModelo(m.texto, contato));
  };
  const teclas = (e: React.KeyboardEvent) => {
    if (!vistos.length || e.nativeEvent.isComposing) return;
    const i = Math.max(0, vistos.findIndex((m) => m.id === sel?.id));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const prox = vistos[(i + (e.key === "ArrowDown" ? 1 : vistos.length - 1)) % vistos.length]!;
      setSelId(prox.id);
      document.getElementById(`mdl-${prox.id}`)?.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter" && sel) { e.preventDefault(); escolher(sel, "usar"); }
  };

  const lista = useRef<HTMLDivElement>(null);
  const bolha = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => entrar(lista.current?.children ?? [], { x: -10 }, { stagger: 0.025, duration: 0.4 }), [cat]);
  useLayoutEffect(() => entrar(bolha.current, { y: 12, scale: 0.96 }, { duration: 0.45, ease: "back.out(1.6)", transformOrigin: "100% 100%" }), [sel?.id]);

  return (
    <Dialog open onClose={fechar} title="Modelos de mensagem" largo>
      <div className="mdl" onKeyDown={teclas}>
        <aside className="mdl-lado">
          <label className="wa-busca mdl-busca"><Search size={15} aria-hidden />
            <input placeholder="Buscar por nome ou texto" value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
          </label>
          {categorias.length > 1 && (
            <div className="mdl-cats" role="tablist" aria-label="Categorias">
              {[null, ...categorias].map((c) => (
                <button key={c ?? "todas"} role="tab" aria-selected={cat === c} className="chip" data-active={cat === c} onClick={() => setCat(c)}>
                  {c ?? "Todos"}<span className="wa-filtro-n">{c ? modelos.filter((m) => m.categoria === c).length : modelos.length}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mdl-lista" ref={lista} role="listbox" aria-label="Modelos">
            {vistos.map((m) => (
              <button key={m.id} id={`mdl-${m.id}`} role="option" aria-selected={m.id === sel?.id} className="mdl-item" onClick={() => setSelId(m.id)} onDoubleClick={() => escolher(m, "usar")}>
                <span className="mdl-item-topo">
                  <b>{m.nome}</b>
                  {m.id === maisUsado?.id && <span className="mdl-quente" title={`Usado ${m.usos} vezes`}><Flame aria-hidden /> mais usado</span>}
                </span>
                <span className="mdl-item-txt">{preencherModelo(m.texto, contato).replace(/[*_~]/g, "")}</span>
                <span className="mdl-item-pe"><span className="mdl-cat">{m.categoria}</span>{m.usos > 0 && <small>usado {m.usos}×</small>}</span>
              </button>
            ))}
            {!vistos.length && (
              <p className="subtle small mdl-vazio">{modelos.length ? "Nenhum modelo com isso." : "Nenhum modelo ainda."}</p>
            )}
          </div>
          <Link href="/crm/config" className="btn btn-ghost btn-xs mdl-gerenciar" onClick={fechar}><Settings2 aria-hidden /> Criar e editar modelos</Link>
        </aside>

        <section className="mdl-previa">
          {sel ? (
            <>
              <header className="mdl-previa-topo">
                <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <b className="crm-trunc">{sel.nome}</b>
                  <small className="subtle">Para {contato.nome} · como vai chegar no WhatsApp</small>
                </span>
                <span className="mdl-cat">{sel.categoria}</span>
              </header>
              <div className="mdl-tela">
                <div className="wa-bolha mdl-bolha" data-lado="out" ref={bolha}>
                  <p>{formatar(texto)}</p>
                  <span className="wa-meta" suppressHydrationWarning>{horaAgora()} <CheckCheck size={15} className="wa-ok" aria-hidden /></span>
                </div>
              </div>
              <div className="mdl-info">
                {vars.map((v) => <span key={v} className="mdl-var" title={VARIAVEIS_MODELO[v as keyof typeof VARIAVEIS_MODELO]}>{v}</span>)}
                <span className="subtle caption" style={{ marginLeft: "auto" }}>{texto.length}/{MAX_TEXTO_WA}</span>
              </div>
              {frio && temLink(texto) && <p className="mdl-alerta"><ShieldAlert aria-hidden /> Tem link: no primeiro contato o envio é barrado (anti-spam). Use depois que a pessoa responder.</p>}
              {semSite && <p className="mdl-alerta"><ShieldAlert aria-hidden /> Este contato não veio de um site: {"{site}"} vai ficar vazio.</p>}
              <footer className="mdl-acoes">
                <span className="subtle caption mdl-atalho"><kbd>↑</kbd><kbd>↓</kbd> escolher · <kbd>Enter</kbd> usar</span>
                <button className="btn btn-secondary btn-sm" onClick={() => escolher(sel, "agendar")}><CalendarClock aria-hidden /> Agendar envio</button>
                <button className="btn btn-primary btn-sm" onClick={() => escolher(sel, "usar")}><CornerDownLeft aria-hidden /> Usar no texto</button>
              </footer>
            </>
          ) : (
            <div className="wa-vazio"><MessageSquareText size={38} aria-hidden /><b>Nenhum modelo</b>
              <span className="subtle small">Crie modelos com {Object.keys(VARIAVEIS_MODELO).join(", ")} em CRM → Configurações.</span></div>
          )}
        </section>
      </div>
    </Dialog>
  );
}

// ───────────── Agendar envio ─────────────

const p2 = (n: number) => String(n).padStart(2, "0");
/** Date → valor do <input type="datetime-local"> (hora local). */
const paraCampo = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
const em = (dias: number, h: number, m = 0) => { const d = new Date(); d.setDate(d.getDate() + dias); d.setHours(h, m, 0, 0); return d; };
function proximaSegunda() { const d = em(0, 9); d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); return d; }
function atalhos(): [string, Date][] {
  const umaHora = new Date(Date.now() + 3600_000); umaHora.setSeconds(0, 0);
  const lista: [string, Date][] = [["Daqui a 1 hora", umaHora], ["Hoje 18:00", em(0, 18)], ["Amanhã 09:00", em(1, 9)], ["Amanhã 14:00", em(1, 14)], ["Segunda 09:00", proximaSegunda()]];
  return lista.filter(([, d]) => d.getTime() > Date.now() + 5 * 60_000);
}
function falta(d: Date) {
  const min = Math.round((d.getTime() - Date.now()) / 60_000);
  return min < 60 ? `em ${min} min` : min < 48 * 60 ? `em ${Math.round(min / 60)} h` : `em ${Math.round(min / 1440)} dias`;
}

/** Janela de agendamento: atalhos de horário, data/hora livre, texto e o resumo de quando sai. */
export function AgendarDialog({ numero, nome, inicial, fechar, pronto }: { numero: string; nome: string; inicial: string; fechar: () => void; pronto: () => void }) {
  const router = useRouter();
  const opcoes = useMemo(atalhos, []);
  const [quando, setQuando] = useState(() => paraCampo(opcoes.find(([r]) => r.startsWith("Amanhã 09"))?.[1] ?? em(1, 9)));
  const [texto, setTexto] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const data = quando ? new Date(quando) : null;
  const valida = !!data && !Number.isNaN(data.getTime());
  const resumo = valida ? new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }).format(data) : "";
  const resumoRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => entrar(resumoRef.current, { y: 6 }, { duration: 0.35 }), [quando]);
  useEffect(() => setErro(null), [quando, texto]);

  const salvar = () => start(async () => {
    if (!valida) return setErro("Escolha data e hora");
    const r = await agendarMensagem({ para: numero, texto, quando: data.toISOString() });
    if (!r.ok) return setErro(r.error);
    toast.ok(`Agendada para ${resumo}`);
    pronto();
    router.refresh();
  });

  return (
    <Dialog open onClose={fechar} title={`Agendar mensagem para ${nome}`}>
      <form className="stack agd" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <div className="field">
          <span className="label">Quando</span>
          <div className="agd-atalhos">
            {opcoes.map(([r, d]) => (
              <button key={r} type="button" className="chip" data-active={quando === paraCampo(d)} onClick={() => setQuando(paraCampo(d))}>{r}</button>
            ))}
          </div>
          <input type="datetime-local" className="input" value={quando} min={paraCampo(new Date())} onChange={(e) => setQuando(e.target.value)} aria-label="Data e hora do envio" />
        </div>
        {valida && (
          <div className="agd-resumo" ref={resumoRef}>
            <span className="agd-relogio"><Clock aria-hidden /></span>
            <span><b>Sai {resumo}</b><small suppressHydrationWarning>{data.getTime() > Date.now() ? falta(data) : "horário já passou"} · com o worker ligado; se estiver desligado, sai assim que ligar</small></span>
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="agd-texto">Mensagem</label>
          <textarea id="agd-texto" className="input" rows={6} style={{ height: "auto", paddingBlock: 12, resize: "vertical" }} maxLength={MAX_TEXTO_WA}
            value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva o que vai sair na hora marcada" autoFocus={!inicial} />
          <span className="subtle caption">{texto.length}/{MAX_TEXTO_WA} · <code>*negrito*</code> <code>_itálico_</code></span>
        </div>
        {erro && <p className="error-text" role="alert">{erro}</p>}
        <div className="cluster" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={fechar}>Cancelar</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pend || !texto.trim() || !valida}>
            {pend ? <Loader2 className="animate-spin" aria-hidden /> : <><CalendarClock aria-hidden /> Agendar</>}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
