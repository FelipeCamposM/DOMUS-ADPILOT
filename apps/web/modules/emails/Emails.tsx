"use client";

import { ArrowLeft, Inbox, Loader2, Mail, Plus, RefreshCw, Search, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ago } from "@/lib/format";
import type { Mensagem, Resumo } from "@/lib/gmail";
import { toast } from "../shell/toast";
import { responderEmail } from "./actions";

type Conta = { id: string; email: string; nome: string | null; foto: string | null; status: string };

const nomeDe = (de: string) => de.replace(/\s*<[^>]+>\s*$/, "").replace(/^"|"$/g, "") || de;
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Corpo HTML isolado: sem scripts (sandbox), links abrem em nova aba, altura acompanha o conteúdo. */
function CorpoHtml({ html }: { html: string }) {
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;padding:16px;font:14px/1.5 system-ui,sans-serif;color:#111;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
  return (
    <iframe className="em-html" title="Conteúdo do e-mail" srcDoc={doc} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={(e) => { const d = e.currentTarget.contentDocument; if (d) e.currentTarget.style.height = `${d.documentElement.scrollHeight + 4}px`; }} />
  );
}

/** CRM → E-mails: contas Gmail conectadas (várias), caixa de entrada, leitura e resposta. Lido direto do Gmail. */
export function Emails({ contas, conta, q, conversas, thread, aberta, falha }: {
  contas: Conta[]; conta: string | null; q: string; conversas: Resumo[]; thread: string | null; aberta: Mensagem[] | null; falha: string | null;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [pend, start] = useTransition();
  const [indo, ir] = useTransition();
  const atual = contas.find((c) => c.id === conta) ?? null;
  const url = (p: Record<string, string | null>) => {
    const s = new URLSearchParams({ ...(conta ? { conta } : {}), ...(q ? { q } : {}) });
    for (const [k, v] of Object.entries(p)) v ? s.set(k, v) : s.delete(k);
    return `/crm/emails?${s}`;
  };
  const navegar = (h: string) => ir(() => router.push(h));

  useEffect(() => setTexto(""), [thread]);

  const enviar = () => start(async () => {
    if (!conta || !thread) return;
    const r = await responderEmail({ conta, thread, texto });
    if (!r.ok) return toast.err(r.error);
    toast.ok("Resposta enviada");
    setTexto("");
    router.refresh();
  });

  return (
    <div className="page em-page">
      <div className="page-head">
        <div>
          <div className="eyebrow" data-enter>CRM</div>
          <h1 className="page-title" data-enter>E-mails</h1>
          <p className="page-sub" data-enter>Suas caixas do Gmail dentro do AdPilot: ler, buscar e responder. As contas são conectadas em Conexões.</p>
        </div>
        <Link href="/connections" className="btn btn-secondary btn-sm"><Plus aria-hidden /> Contas em Conexões</Link>
      </div>

      {!contas.length ? (
        <div className="panel empty" data-enter style={{ padding: 40 }}>
          <Mail aria-hidden />
          <b>Nenhum Gmail conectado</b>
          <span className="muted small">Conecte uma ou mais contas. Os e-mails continuam no Gmail; o AdPilot só lê e responde por você.</span>
          <Link href="/connections" className="btn btn-secondary btn-sm">Conectar em Conexões</Link>
        </div>
      ) : (
        <>
          <div className="em-contas" data-enter>
            {contas.map((c) => (
              <span key={c.id} className="em-conta" data-ativa={c.id === conta} data-status={c.status}>
                <Link href={`/crm/emails?conta=${c.id}`} className="em-conta-link">
                  {c.foto ? <img src={c.foto} alt="" width={22} height={22} referrerPolicy="no-referrer" /> : <Mail size={16} aria-hidden />}
                  <span>{c.email}</span>
                </Link>
                {c.status === "EXPIRADA" && <a href={`/api/connections/gmail/start?email=${encodeURIComponent(c.email)}`} className="em-reconectar"><RefreshCw size={12} aria-hidden /> Reconectar</a>}
              </span>
            ))}
          </div>

          {atual?.status === "EXPIRADA" ? (
            <div className="panel em-expirada" data-enter>
              <b>A autorização de {atual.email} expirou</b>
              <span className="muted small">O Google pede para confirmar o acesso de novo (enquanto o app estiver em modo de teste, isso acontece a cada 7 dias).</span>
              <a href={`/api/connections/gmail/start?email=${encodeURIComponent(atual.email)}`} className="btn btn-primary btn-sm"><RefreshCw aria-hidden /> Reconectar</a>
            </div>
          ) : (
            <div className="em" data-aberta={!!thread} aria-busy={indo}>
              <section className="panel em-lista">
                <form className="em-busca" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("q") as string; navegar(`/crm/emails?${new URLSearchParams({ ...(conta ? { conta } : {}), ...(v.trim() ? { q: v.trim() } : {}) })}`); }}>
                  <Search size={15} aria-hidden />
                  <input name="q" defaultValue={q} placeholder="Buscar (ex.: from:cliente@ is:unread)" aria-label="Buscar e-mails" />
                  {indo && <Loader2 size={15} className="animate-spin" aria-hidden />}
                </form>
                {falha && <div className="em-falha">{falha}</div>}
                {!conversas.length && !falha && <div className="empty" style={{ padding: 32 }}><Inbox aria-hidden /> {q ? "Nada encontrado." : "Caixa de entrada vazia."}</div>}
                <div className="em-itens">
                  {conversas.map((c) => (
                    <button key={c.id} type="button" className="em-item" data-nova={c.naoLida} data-ativa={c.id === thread} onClick={() => navegar(url({ t: c.id }))}>
                      <span className="em-item-topo"><b>{c.de}</b>{c.n > 1 && <em>{c.n}</em>}<small suppressHydrationWarning>{ago(c.quando)}</small></span>
                      <span className="em-assunto">{c.assunto}</span>
                      <span className="em-trecho">{c.trecho}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel em-leitor">
                {!aberta ? (
                  <div className="empty" style={{ padding: 48 }}><Mail aria-hidden /> Escolha um e-mail para ler.</div>
                ) : (
                  <>
                    <header className="em-leitor-topo">
                      <button type="button" className="btn btn-ghost btn-xs em-voltar" onClick={() => navegar(url({ t: null }))} aria-label="Voltar para a lista"><ArrowLeft aria-hidden /></button>
                      <h2>{aberta[0]?.assunto || "(sem assunto)"}</h2>
                    </header>
                    <div className="em-msgs">
                      {aberta.map((m) => (
                        <article key={m.id} className="em-msg">
                          <div className="em-msg-topo"><b>{nomeDe(m.de)}</b><small>{quando(m.quando)}</small></div>
                          <div className="em-msg-para subtle">para {m.para}</div>
                          {m.html ? <CorpoHtml html={m.html} /> : <div className="em-texto">{m.texto}</div>}
                        </article>
                      ))}
                    </div>
                    <footer className="em-responder">
                      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`Responder como ${atual?.email ?? ""}`} rows={3} maxLength={20_000}
                        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(); }} />
                      <button type="button" className="btn btn-primary btn-sm" disabled={pend || !texto.trim()} onClick={enviar}>
                        {pend ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Enviar
                      </button>
                    </footer>
                  </>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
