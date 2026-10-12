"use client";

import { AlertTriangle, ArrowRight, CalendarClock, Check, KeyRound, Layers, Loader2, Megaphone, Plus, RefreshCw, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ago } from "@/lib/format";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { conectarMeta, removerConexao, sincronizarConexao } from "./actions";
import { GoogleAdsLogo, LogoPlataforma, MetaLogo } from "./Logos";

export interface Conexao {
  id: string; provider: string; label: string; status: string; last_error: string | null; last_synced_at: string | null; created_at: string;
  perfil: { nome?: string | null; email?: string | null; foto?: string | null }; sincronizando: boolean;
  contas: { id: string; name: string; external_id: string; currency: string; timezone: string | null; status: string; campanhas: number; ativas: number }[];
}
type Aviso = { tipo: "erro"; codigo: string; msg: string | null } | { tipo: "ok"; contas: number } | null;

const ERROS: Record<string, string> = {
  "google-env": "O Google Ads não está configurado no servidor (veja o MANUAL.md).",
  "google-state": "A autorização do Google expirou ou não confere. Tente de novo.",
  "google-permissao": "Você precisa ser admin do workspace para conectar contas.",
  "google-token": "O Google não devolveu o token de acesso. Tente de novo.",
  "google-api": "O Google Ads recusou o acesso.",
};
const NOME = { META: "Meta Ads", GOOGLE: "Google Ads" } as Record<string, string>;
const idConta = (p: string, id: string) => (p === "GOOGLE" ? id.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : id.replace(/^act_/, ""));
const fuso = (tz: string | null) => (tz ? tz.split("/").pop()!.replace(/_/g, " ") : null);
const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export function Connections({ conexoes, podeAdmin, podeEditar, googleConfigurado, aviso }: {
  conexoes: Conexao[]; podeAdmin: boolean; podeEditar: boolean; googleConfigurado: boolean; aviso: Aviso;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"meta" | "google" | null>(null);
  const [remover, setRemover] = useState<Conexao | null>(null);
  const [falha, setFalha] = useState<{ titulo: string; msg: string } | null>(null);
  const lido = useRef(false);

  // volta do OAuth (?ok= / ?erro=): vira toast ou modal e some da URL
  useEffect(() => {
    if (!aviso || lido.current) return;
    lido.current = true;
    if (aviso.tipo === "ok") toast.ok(`Google Ads conectado: ${aviso.contas} conta(s). Sincronizando…`);
    else setFalha({ titulo: "Não foi possível conectar o Google Ads", msg: `${ERROS[aviso.codigo] ?? "Erro ao conectar."}${aviso.msg ? `\n\n${aviso.msg}` : ""}` });
    router.replace("/connections", { scroll: false });
  }, [aviso, router]);

  // sincronização em andamento: atualiza sozinho até terminar
  const sincronizando = conexoes.some((k) => k.sincronizando);
  useEffect(() => {
    if (!sincronizando) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [sincronizando, router]);

  const por = (p: string) => conexoes.filter((k) => k.provider === p).length;

  return (
    <>
      {podeAdmin && (
        <section className="cn-plats" data-enter>
          <PlataformaCard logo={<MetaLogo size={30} />} nome="Meta Ads" desc="Facebook e Instagram, pelo token de um usuário do sistema do Business Manager."
            itens={["Campanhas, conjuntos e métricas", "Pausar, ativar e orçamento"]} conectadas={por("META")} onClick={() => setModal("meta")} />
          <PlataformaCard logo={<GoogleAdsLogo size={30} />} nome="Google Ads" desc="Login com a conta Google que acessa a conta de administrador (MCC)."
            itens={["Contas da MCC entram sozinhas", "Criar campanhas de Pesquisa"]} conectadas={por("GOOGLE")} onClick={() => setModal("google")} />
        </section>
      )}

      {conexoes.length === 0 ? (
        <div className="panel cn-vazio" data-enter>
          <div className="cn-vazio-logos"><MetaLogo size={34} /><GoogleAdsLogo size={34} /></div>
          <h2>Nenhuma conexão ainda</h2>
          <p className="muted small">{podeAdmin ? "Conecte a Meta ou o Google Ads acima para trazer campanhas e métricas." : "Peça a um admin do workspace para conectar as contas de anúncio."}</p>
        </div>
      ) : (
        <section className="stack" style={{ gap: 14 }}>
          <div className="cn-secao">Conectadas <span className="subtle">({conexoes.length})</span></div>
          {conexoes.map((k) => <ConexaoCard key={k.id} k={k} podeAdmin={podeAdmin} podeEditar={podeEditar} onRemover={() => setRemover(k)} onReconectar={() => setModal("google")} />)}
        </section>
      )}

      <MetaDialog open={modal === "meta"} onClose={() => setModal(null)} />
      <GoogleDialog open={modal === "google"} onClose={() => setModal(null)} configurado={googleConfigurado} />
      <RemoverDialog k={remover} onClose={() => setRemover(null)} />
      <Dialog open={!!falha} onClose={() => setFalha(null)} title={falha?.titulo ?? ""}>
        <div className="cn-falha"><AlertTriangle aria-hidden /><p style={{ whiteSpace: "pre-wrap" }}>{falha?.msg}</p></div>
        <div className="cluster" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setFalha(null)}>Fechar</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setFalha(null); setModal("google"); }}>Tentar de novo</button>
        </div>
      </Dialog>
    </>
  );
}

function PlataformaCard({ logo, nome, desc, itens, conectadas, onClick }: { logo: React.ReactNode; nome: string; desc: string; itens: string[]; conectadas: number; onClick: () => void }) {
  return (
    <button type="button" className="cn-plat panel spotlight" onClick={onClick}>
      <span className="cn-plat-logo">{logo}</span>
      <span className="cn-plat-txt">
        <span className="cn-plat-nome">{nome}{conectadas > 0 && <span className="cn-pill ok"><Check size={11} aria-hidden /> {conectadas} conectada{conectadas > 1 ? "s" : ""}</span>}</span>
        <span className="cn-plat-desc">{desc}</span>
        <span className="cn-plat-itens">{itens.map((i) => <span key={i}><Check size={12} aria-hidden /> {i}</span>)}</span>
      </span>
      <span className="cn-plat-cta">{conectadas ? "Adicionar" : "Conectar"} <ArrowRight size={14} aria-hidden /></span>
    </button>
  );
}

function Avatar({ k }: { k: Conexao }) {
  const [erro, setErro] = useState(false);
  if (k.perfil.foto && !erro) return <img className="cn-quem-foto" src={k.perfil.foto} alt="" referrerPolicy="no-referrer" onError={() => setErro(true)} />;
  return <span className="cn-quem-foto"><UserRound size={13} aria-hidden /></span>;
}

function ConexaoCard({ k, podeAdmin, podeEditar, onRemover, onReconectar }: { k: Conexao; podeAdmin: boolean; podeEditar: boolean; onRemover: () => void; onReconectar: () => void }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const sincronizar = () => start(async () => {
    const r = await sincronizarConexao(k.id);
    if (r.ok) toast.ok("Sincronização na fila do worker"); else toast.err(r.error);
    router.refresh();
  });
  const campanhas = k.contas.reduce((s, a) => s + a.campanhas, 0);
  const ativas = k.contas.reduce((s, a) => s + a.ativas, 0);
  const erro = k.status !== "ACTIVE" || !!k.last_error;
  const rodando = k.sincronizando || pend;

  return (
    <article className="panel cn-con" data-erro={erro} data-enter>
      <header className="cn-con-head">
        <span className="cn-plat-logo sm"><LogoPlataforma p={k.provider} size={24} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="cn-con-titulo">
            <b>{k.label}</b>
            {rodando ? <span className="cn-pill run"><Loader2 size={11} className="animate-spin" aria-hidden /> Sincronizando</span>
              : erro ? <span className="cn-pill err"><AlertTriangle size={11} aria-hidden /> Com erro</span>
              : <span className="cn-pill ok"><span className="cn-dot" /> Ativa</span>}
          </div>
          <div className="cn-con-sub">
            <span>{NOME[k.provider] ?? k.provider}</span>
            {(k.perfil.email || k.perfil.nome) && <span className="cn-quem"><Avatar k={k} />{k.perfil.email ?? k.perfil.nome}</span>}
            {k.provider === "META" && <span className="cn-quem"><KeyRound size={12} aria-hidden /> Usuário do sistema</span>}
          </div>
        </div>
        <div className="cluster" style={{ gap: 6, flexWrap: "nowrap" }}>
          {podeEditar && (
            <button className="btn btn-secondary btn-xs" onClick={sincronizar} disabled={rodando}>
              <RefreshCw className={rodando ? "animate-spin" : ""} aria-hidden /> {rodando ? "Sincronizando" : "Sincronizar"}
            </button>
          )}
          {podeAdmin && k.provider === "GOOGLE" && <button className="btn btn-ghost btn-xs" onClick={onReconectar} title="Renova a autorização e traz nome e foto de quem conectou">Reconectar</button>}
          {podeAdmin && <button className="btn btn-ghost btn-xs cn-del" onClick={onRemover} aria-label={`Remover ${k.label}`} title="Remover conexão"><Trash2 aria-hidden /></button>}
        </div>
      </header>

      <div className="cn-stats">
        <div><Layers size={14} aria-hidden /><b>{k.contas.length}</b><span>conta{k.contas.length === 1 ? "" : "s"}</span></div>
        <div><Megaphone size={14} aria-hidden /><b>{campanhas}</b><span>campanha{campanhas === 1 ? "" : "s"} · {ativas} ativa{ativas === 1 ? "" : "s"}</span></div>
        <div><RefreshCw size={14} aria-hidden /><b suppressHydrationWarning>{ago(k.last_synced_at)}</b><span>última sincronização</span></div>
        <div><CalendarClock size={14} aria-hidden /><b suppressHydrationWarning>{data(k.created_at)}</b><span>conectada em</span></div>
      </div>

      {k.last_error && <div className="cn-erro"><AlertTriangle size={15} aria-hidden /><span>{k.last_error}</span></div>}

      <div className="cn-contas">
        {k.contas.length === 0 ? (
          <p className="subtle small" style={{ padding: "4px 2px" }}>{rodando ? "Buscando as contas…" : "As contas aparecem depois da primeira sincronização."}</p>
        ) : k.contas.map((a) => (
          <div key={a.id} className="cn-conta">
            <span className="cn-conta-nome">{a.name}{a.status !== "ACTIVE" && <span className="cn-pill err" style={{ marginLeft: 8 }}>{a.status}</span>}</span>
            <span className="cn-conta-meta">
              <span className="mono">{idConta(k.provider, a.external_id)}</span>
              <span>{a.currency}</span>
              {fuso(a.timezone) && <span>{fuso(a.timezone)}</span>}
            </span>
            <span className="cn-conta-camp"><b>{a.campanhas}</b> campanha{a.campanhas === 1 ? "" : "s"}{a.ativas > 0 && <span className="subtle"> · {a.ativas} ativa{a.ativas === 1 ? "" : "s"}</span>}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function GoogleDialog({ open, onClose, configurado }: { open: boolean; onClose: () => void; configurado: boolean }) {
  const [enviando, setEnviando] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title="Conectar Google Ads">
      <div className="cn-modal-hero"><span className="cn-plat-logo"><GoogleAdsLogo size={30} /></span><div><b>Google Ads</b><span className="subtle small">Login seguro com a sua conta Google</span></div></div>
      {configurado ? (
        <form action="/api/connections/google/start" method="get" className="stack" onSubmit={() => setEnviando(true)}>
          <ol className="cn-passos">
            <li>Entre com o e-mail que acessa a <b>conta de administrador (MCC)</b>.</li>
            <li>Autorize o acesso ao Google Ads e ao seu nome e foto.</li>
            <li>As contas da MCC entram sozinhas e a sincronização começa.</li>
          </ol>
          <div className="field">
            <label className="label" htmlFor="glabel">Nome da conexão</label>
            <input id="glabel" name="label" className="input" defaultValue="Google Ads" maxLength={80} required />
          </div>
          <p className="cn-seguro"><ShieldCheck size={14} aria-hidden /> Guardamos só o token de atualização, cifrado. Reconectar a mesma conta atualiza a conexão, sem duplicar.</p>
          <div className="cluster" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
            <button className="cn-google-btn" type="submit" disabled={enviando}>
              {enviando ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <GLogo />} Continuar com Google
            </button>
          </div>
        </form>
      ) : (
        <div className="cn-falha"><AlertTriangle aria-hidden /><p>O Google Ads ainda não está configurado no servidor. Defina <code>GOOGLE_ADS_CLIENT_ID</code> e <code>GOOGLE_ADS_CLIENT_SECRET</code> (MANUAL.md, seção “Google Ads”).</p></div>
      )}
    </Dialog>
  );
}

const GLogo = () => (
  <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" />
    <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.9l7.9-6.2z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.5 2.2-6.3 0-11.6-4.2-13.5-10l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
  </svg>
);

function MetaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [label, setLabel] = useState("Meta Ads");
  const [token, setToken] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const salvar = () => start(async () => {
    setErro(null);
    const r = await conectarMeta({ label, token });
    if (!r.ok) return setErro(r.error);
    toast.ok(`Meta conectada: ${r.data} conta(s) encontrada(s). Sincronizando…`);
    setToken("");
    onClose();
    router.refresh();
  });
  return (
    <Dialog open={open} onClose={onClose} title="Conectar Meta Ads">
      <div className="cn-modal-hero"><span className="cn-plat-logo"><MetaLogo size={30} /></span><div><b>Meta Ads</b><span className="subtle small">Facebook e Instagram</span></div></div>
      <ol className="cn-passos">
        <li>No <b>Business Manager</b>: Configurações do negócio → Usuários do sistema.</li>
        <li>Dê ao usuário acesso às contas de anúncio e clique em <b>Gerar token</b>.</li>
        <li>Marque <code>ads_management</code> e <code>ads_read</code>, sem expiração, e cole abaixo.</li>
      </ol>
      <div className="field">
        <label className="label" htmlFor="mlabel">Nome da conexão</label>
        <input id="mlabel" className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
      </div>
      <div className="field">
        <label className="label" htmlFor="mtoken">Token de acesso</label>
        <input id="mtoken" className="input mono" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAG…" />
      </div>
      <p className="cn-seguro"><ShieldCheck size={14} aria-hidden /> O token é validado agora e salvo cifrado; ele nunca volta para o navegador.</p>
      {erro && <div className="cn-falha" role="alert"><AlertTriangle aria-hidden /><p>{erro}</p></div>}
      <div className="cluster" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary btn-sm" onClick={salvar} disabled={pend || token.trim().length < 20}>{pend ? <><Loader2 className="animate-spin" aria-hidden /> Validando…</> : <><Plus aria-hidden /> Conectar</>}</button>
      </div>
    </Dialog>
  );
}

function RemoverDialog({ k, onClose }: { k: Conexao | null; onClose: () => void }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const campanhas = k?.contas.reduce((s, a) => s + a.campanhas, 0) ?? 0;
  const confirmar = () => k && start(async () => {
    const r = await removerConexao(k.id);
    if (!r.ok) return toast.err(r.error);
    toast.ok("Conexão removida");
    onClose();
    router.refresh();
  });
  return (
    <Dialog open={!!k} onClose={onClose} title="Remover conexão">
      {k && (
        <>
          <div className="cn-modal-hero"><span className="cn-plat-logo"><LogoPlataforma p={k.provider} size={28} /></span><div><b>{k.label}</b><span className="subtle small">{NOME[k.provider]}</span></div></div>
          <div className="cn-falha"><AlertTriangle aria-hidden />
            <p>Saem da plataforma <b>{k.contas.length} conta(s)</b>, <b>{campanhas} campanha(s)</b> e as métricas sincronizadas delas.
              Nada muda na {k.provider === "META" ? "Meta" : "Google"}: as campanhas continuam rodando lá. Dá para conectar de novo depois.</p>
          </div>
          <div className="cluster" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={pend}>Cancelar</button>
            <button className="btn btn-danger btn-sm" onClick={confirmar} disabled={pend}>{pend ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />} Remover conexão</button>
          </div>
        </>
      )}
    </Dialog>
  );
}
