"use client";

import { CATEGORIAS_MODELO, FRIO, MAX_TEXTO_WA, preencherModelo, templateSchema, temLink, VARIAVEIS_MODELO } from "@domus-ads/core/mensagens";
import { Loader2, MessageSquareText, Pencil, Plus, ShieldCheck, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { entrar } from "../motion/entrar";
import { confirmar } from "../shell/confirmar";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { apagarTemplate, gerarModeloIA, resultadoAjuste, salvarTemplate } from "./actions";
import { formatar, type Modelo } from "./Mensagens";

type Edicao = { id: string | null; nome: string; texto: string; categoria: string };

/** Modelos de mensagem: cartões com prévia e categoria; criar e editar em janela com prévia ao vivo. */
export function Modelos({ modelos }: { modelos: Modelo[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Edicao | null>(null);
  const [comIA, setComIA] = useState(false);
  const grade = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => entrar(grade.current?.children ?? [], { y: 12, scale: 0.98 }, { stagger: 0.04, duration: 0.5 }), []);
  return (
    <>
      <div className="crm-modelos" ref={grade}>
        {modelos.map((m) => (
          <article key={m.id} className="crm-modelo" onClick={() => setEdit({ ...m })}>
            <header>
              <span className="crm-modelo-ic"><MessageSquareText aria-hidden /></span>
              <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <b className="crm-trunc">{m.nome}</b>
                <small className="crm-modelo-meta"><span className="mdl-cat">{m.categoria}</span>{m.usos > 0 ? `usado ${m.usos}×` : "nunca usado"}</small>
              </span>
              <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); setEdit({ ...m }); }} aria-label={`Editar ${m.nome}`}><Pencil aria-hidden /></button>
              <button className="btn btn-ghost btn-xs" aria-label={`Apagar ${m.nome}`} onClick={async (e) => {
                e.stopPropagation();
                if (!(await confirmar(`Apagar o modelo “${m.nome}”?`))) return;
                const r = await apagarTemplate(m.id);
                if (!r.ok) toast.err(r.error); else router.refresh();
              }}><Trash2 aria-hidden /></button>
            </header>
            <p>{formatar(preencherModelo(m.texto, EXEMPLO))}</p>
          </article>
        ))}
        <button className="crm-modelo crm-modelo-novo crm-modelo-ia" onClick={() => { setComIA(true); setEdit({ id: null, nome: "", texto: "", categoria: "Geral" }); }}><Sparkles aria-hidden /> Criar com IA</button>
        <button className="crm-modelo crm-modelo-novo" onClick={() => { setComIA(false); setEdit({ id: null, nome: "", texto: "", categoria: "Geral" }); }}><Plus aria-hidden /> Novo modelo</button>
      </div>
      {!modelos.length && <p className="subtle small" style={{ margin: 0 }}>Modelos aceitam {Object.keys(VARIAVEIS_MODELO).join(", ")}, trocados pelos dados do contato na hora de usar.</p>}
      {edit && <EditarModelo inicial={edit} focoIA={comIA} categorias={[...new Set([...CATEGORIAS_MODELO, ...modelos.map((m) => m.categoria)])]} fechar={() => setEdit(null)} />}
    </>
  );
}

const EXEMPLO = { nome: "Maria Souza", numero: "5531999999999", site: "seu site" };

const IDEIAS = ["Boas-vindas para quem veio do site", "Follow-up depois de mandar orçamento", "Lembrete de pagamento gentil", "Pedir avaliação no Google", "Reativar cliente sumido"];
const AJUSTES = ["Mais curta", "Mais próxima e informal", "Mais profissional", "Corrigir o português", "Com uma pergunta no fim"];

function EditarModelo({ inicial, categorias, fechar, focoIA }: { inicial: Edicao; categorias: string[]; fechar: () => void; focoIA?: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const campo = useRef<HTMLTextAreaElement>(null);
  const mudar = (d: Partial<Edicao>) => { setEdit((e) => ({ ...e, ...d })); setErro(null); };
  // IA: escreve do zero (texto vazio) ou ajusta o texto atual; roda na vaga rápida do worker, acompanha até ~2 min
  const [pedido, setPedido] = useState("");
  const [escrevendo, setEscrevendo] = useState(false);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);
  const comIA = async (p: string) => {
    if (escrevendo) return;
    setEscrevendo(true); setErro(null);
    const r = await gerarModeloIA({ texto: edit.texto, pedido: p, categoria: edit.categoria });
    if (!r.ok) { setEscrevendo(false); setErro(r.error); return; }
    for (let i = 0; i < 80 && vivo.current; i++) {
      await new Promise((ok) => setTimeout(ok, 1500));
      const s = await resultadoAjuste(r.data);
      if (!s.ok) { setErro(s.error); break; }
      if (s.data.status === "COMPLETED" && s.data.texto) {
        const nome = s.data.nome;
        setEdit((e) => ({ ...e, texto: s.data.texto!, nome: e.nome.trim() || nome || e.nome }));
        setPedido("");
        toast.ok("Modelo escrito pela IA: revise e salve");
        break;
      }
      if (s.data.status === "FAILED" || s.data.status === "CANCELLED") { setErro(s.data.erro ?? "A IA não conseguiu escrever o modelo"); break; }
      if (i === 79) setErro("A IA demorou demais. Tente de novo.");
    }
    if (vivo.current) setEscrevendo(false);
  };
  const temTexto = !!edit.texto.trim();
  const salvar = () => start(async () => {
    const v = templateSchema.safeParse(edit);
    if (!v.success) return setErro(v.error.issues[0]?.message ?? "Dados inválidos");
    const r = await salvarTemplate({ ...v.data, id: edit.id });
    if (!r.ok) return setErro(r.error);
    toast.ok("Modelo salvo");
    fechar();
    router.refresh();
  });
  const inserir = (v: string) => {
    const el = campo.current;
    if (!el) return;
    mudar({ texto: edit.texto.slice(0, el.selectionStart) + v + edit.texto.slice(el.selectionEnd) });
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = el.selectionStart + v.length; });
  };
  return (
    <Dialog open onClose={fechar} title={edit.id ? "Editar modelo" : "Novo modelo"} largo>
      <form className="mdl" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <div className="mdl-editor">
          <section className="mdl-ia" aria-busy={escrevendo}>
            <header><span className="mdl-ia-ico">{escrevendo ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 aria-hidden />}</span>
              <span className="stack" style={{ gap: 1 }}><b>{temTexto ? "Ajustar com IA" : "Criar com IA"}</b>
                <small>{escrevendo ? "A IA está escrevendo o modelo…" : temTexto ? "Reescreve o texto abaixo do jeito que você pedir" : "Descreva o modelo; a IA escreve com as variáveis prontas"}</small></span></header>
            <div className="cluster" style={{ gap: 4, flexWrap: "wrap" }}>
              {(temTexto ? AJUSTES : IDEIAS).map((a) => <button key={a} type="button" className="chip" style={{ height: 26, fontSize: 11.5 }} disabled={escrevendo} onClick={() => void comIA(a)}>{a}</button>)}
            </div>
            <div className="mdl-ia-campo">
              <input className="input" value={pedido} maxLength={400} disabled={escrevendo} autoFocus={focoIA} aria-label="Pedido para a IA"
                placeholder={temTexto ? "Ex.: cite o desconto de 10% até sexta" : "Ex.: follow-up 3 dias depois do orçamento, perguntando se ficou alguma dúvida"}
                onChange={(e) => setPedido(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void comIA(pedido); } }} />
              <button type="button" className="btn btn-primary btn-sm" disabled={escrevendo || (!temTexto && !pedido.trim())} onClick={() => void comIA(pedido)}>
                {escrevendo ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}{temTexto ? "Ajustar" : "Escrever"}
              </button>
            </div>
          </section>
          <div className="cluster" style={{ gap: 10, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 2, minWidth: 180 }}>
              <label className="label" htmlFor="md-nome">Nome do modelo *</label>
              <input id="md-nome" className="input" value={edit.nome} maxLength={60} onChange={(e) => mudar({ nome: e.target.value })} autoFocus={!focoIA} placeholder="Ex.: Boas-vindas, Proposta enviada" />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label className="label" htmlFor="md-cat">Categoria</label>
              <input id="md-cat" className="input" list="md-cats" value={edit.categoria} maxLength={30} onChange={(e) => mudar({ categoria: e.target.value })} />
              <datalist id="md-cats">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="md-texto">Texto *</label>
            <textarea ref={campo} id="md-texto" className="input" rows={10} style={{ height: "auto", paddingBlock: 12, resize: "vertical" }} maxLength={MAX_TEXTO_WA}
              value={edit.texto} disabled={escrevendo} onChange={(e) => mudar({ texto: e.target.value })} placeholder="Olá {primeiro_nome}, tudo bem? …" />
            <span className="cluster" style={{ gap: 6 }}>
              <span className="subtle caption">Inserir:</span>
              {Object.entries(VARIAVEIS_MODELO).map(([v, d]) => <button key={v} type="button" className="mdl-var" title={d} onClick={() => inserir(v)}>{v}</button>)}
              <span className="subtle caption" style={{ marginLeft: "auto" }}>{edit.texto.length}/{MAX_TEXTO_WA}</span>
            </span>
          </div>
          {erro && <p className="error-text" role="alert">{erro}</p>}
          <div className="cluster" style={{ justifyContent: "flex-end", gap: 8, marginTop: "auto" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={fechar}>Cancelar</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={pend}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <><MessageSquareText aria-hidden /> Salvar modelo</>}</button>
          </div>
        </div>
        <section className="mdl-previa">
          <header className="mdl-previa-topo"><span className="stack" style={{ gap: 2 }}><b>Prévia</b><small className="subtle">Como “{EXEMPLO.nome}” vai receber</small></span></header>
          <div className="mdl-tela">
            {edit.texto.trim()
              ? <div className="wa-bolha mdl-bolha" data-lado="out"><p>{formatar(preencherModelo(edit.texto, EXEMPLO))}</p></div>
              : <span className="subtle small" style={{ margin: "auto" }}>Escreva o texto para ver a prévia</span>}
          </div>
          {temLink(edit.texto) && <p className="mdl-alerta"><ShieldCheck aria-hidden /> Com link, só dá para mandar depois que a pessoa responder (anti-spam).</p>}
        </section>
      </form>
    </Dialog>
  );
}

/** As travas contra ban, para o usuário saber por que um envio foi barrado. */
export function Travas() {
  const itens = [
    ["Primeiro contato sem link", "Link na primeira mensagem é o que mais vira denúncia de spam."],
    [`Até ${FRIO.porConversa} mensagens sem resposta`, "Depois disso, só quando a pessoa responder."],
    [`${FRIO.porHora} conversas novas por hora, ${FRIO.porDia} por dia`, "Nada de disparo em massa para quem nunca falou com você."],
    [`Intervalo de ${FRIO.intervalo[0]} a ${FRIO.intervalo[1]} s entre envios`, "Uma mensagem por vez, com “digitando…” antes, como uma pessoa."],
    ["Formulário com consentimento", "Só entra lead que marcou que aceita contato pelo WhatsApp."],
  ];
  return (
    <ul className="crm-travas">
      {itens.map(([t, d]) => <li key={t}><ShieldCheck size={16} aria-hidden /><span><b>{t}</b><small>{d}</small></span></li>)}
    </ul>
  );
}
