"use client";

import { AlertCircle, ArrowLeft, BellRing, CheckCheck, MessageCircle, Search, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface Envio { id: string; created_at: string; para: string; texto: string; status: string; erro: string | null }

const fone = (n: string) => n.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, "+$1 ($2) $3-$4");
const hora = (d: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(d));
const dia = (d: string) => new Date(d).toDateString();
function rotuloDia(d: string) {
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  if (dia(d) === new Date().toDateString()) return "Hoje";
  if (dia(d) === ontem.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(d));
}
/** Na lista: hora se for hoje, "Ontem", ou a data curta. */
const quando = (d: string) => {
  const r = rotuloDia(d);
  return r === "Hoje" ? hora(d) : r === "Ontem" ? r : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(d));
};

/** Histórico dos avisos mandados pelo WhatsApp, no formato do WhatsApp Web: conversas à esquerda, mensagens à direita. */
export function Mensagens({ envios, avisos }: { envios: Envio[]; avisos: string | null }) {
  const conversas = useMemo(() => {
    const m = new Map<string, Envio[]>();
    for (const e of envios) m.set(e.para, [...(m.get(e.para) ?? []), e]);
    return [...m.entries()].map(([para, msgs]) => ({ para, msgs, ultima: msgs[msgs.length - 1]! }))
      .sort((a, b) => b.ultima.created_at.localeCompare(a.ultima.created_at));
  }, [envios]);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false); // celular: mostra a lista ou a conversa
  const atual = conversas.find((c) => c.para === sel) ?? conversas[0];
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [atual?.para, atual?.msgs.length]);

  const q = busca.trim().toLowerCase();
  const digitos = q.replace(/\D/g, "");
  const lista = q ? conversas.filter((c) => (digitos && c.para.includes(digitos)) || c.msgs.some((m) => m.texto.toLowerCase().includes(q))) : conversas;
  const nome = (para: string) => (para === avisos ? "Avisos da plataforma" : fone(para));
  const Avatar = ({ para }: { para: string }) => <span className="wa-avatar">{para === avisos ? <BellRing size={18} aria-hidden /> : <User size={18} aria-hidden />}</span>;

  return (
    <div className="wa" data-aberta={aberta}>
      <aside className="wa-lado">
        <header className="wa-topo"><b>Mensagens</b><span className="subtle small">{envios.length} enviada(s)</span></header>
        <label className="wa-busca"><Search size={15} aria-hidden /><input placeholder="Pesquisar número ou mensagem" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <ul className="wa-lista">
          {lista.map((c) => (
            <li key={c.para}>
              <button aria-current={c.para === atual?.para} onClick={() => { setSel(c.para); setAberta(true); }}>
                <Avatar para={c.para} />
                <span className="wa-resumo">
                  <span className="wa-linha"><b>{nome(c.para)}</b><small suppressHydrationWarning>{quando(c.ultima.created_at)}</small></span>
                  <span className="wa-linha wa-previa">
                    {c.ultima.status === "ENVIADO" ? <CheckCheck size={15} className="wa-ok" aria-label="Enviada" /> : <AlertCircle size={15} className="wa-erro" aria-label="Falhou" />}
                    <span>{c.ultima.texto.split("\n")[0]}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
          {!lista.length && <li className="subtle small" style={{ padding: 20, textAlign: "center" }}>{envios.length ? "Nada encontrado" : "Nenhuma mensagem enviada ainda"}</li>}
        </ul>
      </aside>

      <section className="wa-chat">
        {atual ? (
          <>
            <header className="wa-topo">
              <button className="btn btn-ghost btn-xs wa-voltar" onClick={() => setAberta(false)} aria-label="Voltar para as conversas"><ArrowLeft aria-hidden /></button>
              <Avatar para={atual.para} />
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <b>{nome(atual.para)}</b>
                <small className="subtle">{atual.para === avisos ? fone(atual.para) : "Avisos automáticos"}</small>
              </span>
            </header>
            <div className="wa-corpo">
              {atual.msgs.map((m, i) => (
                <div key={m.id} style={{ display: "contents" }}>
                  {(i === 0 || dia(atual.msgs[i - 1]!.created_at) !== dia(m.created_at)) && <div className="wa-dia" suppressHydrationWarning>{rotuloDia(m.created_at)}</div>}
                  <div className="wa-bolha" data-erro={m.status !== "ENVIADO"}>
                    <p>{m.texto}</p>
                    {m.erro && <p className="wa-motivo"><AlertCircle size={13} aria-hidden /> Não enviada: {m.erro}</p>}
                    <span className="wa-meta" suppressHydrationWarning>
                      {hora(m.created_at)}
                      {m.status === "ENVIADO" ? <CheckCheck size={15} className="wa-ok" aria-label="Enviada" /> : <AlertCircle size={13} className="wa-erro" aria-label="Falhou" />}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={fim} />
            </div>
            <footer className="wa-rodape subtle small">Mensagens automáticas da plataforma. Só leitura.</footer>
          </>
        ) : (
          <div className="wa-vazio"><MessageCircle size={42} aria-hidden /><b>Nenhuma mensagem ainda</b><span className="subtle small">Os avisos mandados pelo WhatsApp aparecem aqui.</span></div>
        )}
      </section>
    </div>
  );
}
