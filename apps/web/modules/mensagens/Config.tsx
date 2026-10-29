"use client";

import { FRIO, MAX_TEXTO_WA, preencherModelo, templateSchema, VARIAVEIS_MODELO } from "@domus-ads/core/mensagens";
import { Loader2, MessageSquareText, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { confirmar } from "../shell/confirmar";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { apagarTemplate, salvarTemplate } from "./actions";
import { formatar, type Modelo } from "./Mensagens";

/** Modelos de mensagem (lista + edição em janela). */
export function Modelos({ modelos }: { modelos: Modelo[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ id: string | null; nome: string; texto: string } | null>(null);
  return (
    <>
      <div className="crm-modelos">
        {modelos.map((m) => (
          <article key={m.id} className="crm-modelo">
            <header><b className="crm-trunc">{m.nome}</b>
              <button className="btn btn-ghost btn-xs" onClick={() => setEdit({ ...m })} aria-label={`Editar ${m.nome}`}><Pencil aria-hidden /></button>
              <button className="btn btn-ghost btn-xs" aria-label={`Apagar ${m.nome}`} onClick={async () => {
                if (!(await confirmar(`Apagar o modelo “${m.nome}”?`))) return;
                const r = await apagarTemplate(m.id);
                if (!r.ok) toast.err(r.error); else router.refresh();
              }}><Trash2 aria-hidden /></button>
            </header>
            <p>{formatar(m.texto)}</p>
          </article>
        ))}
        <button className="crm-modelo crm-modelo-novo" onClick={() => setEdit({ id: null, nome: "", texto: "" })}><Plus aria-hidden /> Novo modelo</button>
      </div>
      {!modelos.length && <p className="subtle small" style={{ margin: 0 }}>Modelos aceitam {Object.keys(VARIAVEIS_MODELO).join(", ")}, trocados pelos dados do contato na hora de usar.</p>}
      {edit && <EditarModelo inicial={edit} fechar={() => setEdit(null)} />}
    </>
  );
}

function EditarModelo({ inicial, fechar }: { inicial: { id: string | null; nome: string; texto: string }; fechar: () => void }) {
  const router = useRouter();
  const [edit, setEdit] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const campo = useRef<HTMLTextAreaElement>(null);
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
    setEdit({ ...edit, texto: edit.texto.slice(0, el.selectionStart) + v + edit.texto.slice(el.selectionEnd) });
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = el.selectionStart + v.length; });
  };
  return (
    <Dialog open onClose={fechar} title={edit.id ? "Editar modelo" : "Novo modelo"} largo>
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
          <div className="wa-previa-modelo"><span className="subtle caption">Prévia com “Maria Souza”:</span><p>{formatar(preencherModelo(edit.texto, { nome: "Maria Souza", numero: "5531999999999", site: "seu site" }))}</p></div>
        )}
        {erro && <p className="error-text" role="alert">{erro}</p>}
        <div className="cluster" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={fechar}>Cancelar</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pend}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <><MessageSquareText aria-hidden /> Salvar modelo</>}</button>
        </div>
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
