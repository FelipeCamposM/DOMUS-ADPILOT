"use client";

import { ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ago } from "@/lib/format";
import { ProviderTag } from "../campaigns/Tags";
import { Dialog } from "../shell/Dialog";
import { toast } from "../shell/toast";
import { conectarMeta, removerConexao, sincronizarConexao } from "./actions";

export interface Conexao {
  id: string; provider: string; label: string; status: string; last_error: string | null; last_synced_at: string | null;
  contas: { id: string; name: string; external_id: string; currency: string; campanhas: number }[];
}

export function Connections({ conexoes, podeAdmin, googleConfigurado }: { conexoes: Conexao[]; podeAdmin: boolean; googleConfigurado: boolean }) {
  const router = useRouter();
  const [meta, setMeta] = useState(false);
  const [google, setGoogle] = useState(false);
  const [pend, start] = useTransition();
  const [alvo, setAlvo] = useState<string | null>(null);

  const acao = (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setAlvo(id);
    start(async () => {
      const r = await fn();
      setAlvo(null);
      if (r.ok) toast.ok(msg); else toast.err(r.error ?? "Erro");
      router.refresh();
    });
  };

  return (
    <>
      {podeAdmin && (
        <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          <button className="panel spotlight" data-enter="scale" onClick={() => setMeta(true)} style={{ padding: 18, textAlign: "left", cursor: "pointer", display: "flex", gap: 14, alignItems: "center" }}>
            <span className="provider meta"><i style={{ width: 40, height: 40, borderRadius: 12, fontSize: 18 }}>M</i></span>
            <span style={{ flex: 1 }}><b style={{ fontWeight: 650 }}>Conectar Meta Ads</b><br /><span className="muted small">Token de System User do Business Manager</span></span>
            <Plus aria-hidden />
          </button>
          <button className="panel spotlight" data-enter="scale" onClick={() => setGoogle(true)} style={{ padding: 18, textAlign: "left", cursor: "pointer", display: "flex", gap: 14, alignItems: "center" }}>
            <span className="provider google"><i style={{ width: 40, height: 40, borderRadius: 12, fontSize: 18 }}>G</i></span>
            <span style={{ flex: 1 }}><b style={{ fontWeight: 650 }}>Conectar Google Ads</b><br /><span className="muted small">Login com Google (OAuth)</span></span>
            <Plus aria-hidden />
          </button>
        </div>
      )}

      {conexoes.length === 0 && <div className="panel" data-enter><div className="empty">Nenhuma conexão ainda.</div></div>}

      {conexoes.map((k) => (
        <div key={k.id} className="panel" data-enter>
          <div className="panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <ProviderTag p={k.provider} />
              <b style={{ fontWeight: 650 }}>{k.label}</b>
              <span className={`badge ${k.status === "ACTIVE" ? "badge-brand" : "badge-error"}`}>{k.status === "ACTIVE" ? "Ativa" : "Com erro"}</span>
              <span className="subtle caption" suppressHydrationWarning>sincronizada {ago(k.last_synced_at)}</span>
            </div>
            <div className="cluster" style={{ gap: 6 }}>
              <button className="btn btn-secondary btn-xs" disabled={pend && alvo === k.id} onClick={() => acao(k.id, () => sincronizarConexao(k.id), "Sincronização na fila do worker")}>
                {pend && alvo === k.id ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Sincronizar
              </button>
              {podeAdmin && (
                <button className="btn btn-danger btn-xs" onClick={() => confirm(`Remover “${k.label}”? Campanhas e métricas sincronizadas dela saem da plataforma (nada muda na ${k.provider === "META" ? "Meta" : "Google"}).`) && acao(k.id, () => removerConexao(k.id), "Conexão removida")}>
                  <Trash2 aria-hidden /> Remover
                </button>
              )}
            </div>
          </div>
          {k.last_error && <p className="error-text" style={{ padding: "10px 18px 0" }}>{k.last_error}</p>}
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Conta de anúncios</th><th>ID</th><th>Moeda</th><th className="num">Campanhas</th></tr></thead>
              <tbody>
                {k.contas.length === 0 && <tr><td colSpan={4} className="subtle">Contas aparecem depois da primeira sincronização.</td></tr>}
                {k.contas.map((a) => (
                  <tr key={a.id}><td>{a.name}</td><td className="mono subtle">{a.external_id}</td><td>{a.currency}</td><td className="num">{a.campanhas}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <MetaDialog open={meta} onClose={() => setMeta(false)} />
      <Dialog open={google} onClose={() => setGoogle(false)} title="Conectar Google Ads">
        {googleConfigurado ? (
          <form action="/api/connections/google/start" method="get" className="stack">
            <div className="field">
              <label className="label" htmlFor="glabel">Nome da conexão</label>
              <input id="glabel" name="label" className="input" defaultValue="Google Ads" maxLength={80} required />
            </div>
            <p className="muted small">Você vai entrar com a conta Google que tem acesso ao Google Ads. Guardamos só o token de atualização, cifrado.</p>
            <button className="btn btn-primary" type="submit">Continuar com Google <ExternalLink aria-hidden /></button>
          </form>
        ) : (
          <p className="muted small">
            O Google Ads ainda não está configurado no servidor. Defina <code>GOOGLE_ADS_CLIENT_ID</code>, <code>GOOGLE_ADS_CLIENT_SECRET</code> e{" "}
            <code>GOOGLE_ADS_DEVELOPER_TOKEN</code> (passo a passo no MANUAL.md, seção “Google Ads”).
          </p>
        )}
      </Dialog>
    </>
  );
}

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
      <div className="field">
        <label className="label" htmlFor="mlabel">Nome da conexão</label>
        <input id="mlabel" className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
      </div>
      <div className="field">
        <label className="label" htmlFor="mtoken">Token de acesso (System User)</label>
        <input id="mtoken" className="input mono" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAG…" />
        <span className="help">Business Manager → Usuários do sistema → Gerar token, com <code>ads_management</code> e <code>ads_read</code>. O token é validado agora e salvo cifrado; ele nunca volta para o navegador.</span>
      </div>
      {erro && <p className="error-text" role="alert">{erro}</p>}
      <div className="cluster" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary btn-sm" onClick={salvar} disabled={pend || token.length < 20}>{pend ? <><Loader2 className="animate-spin" aria-hidden /> Validando…</> : "Conectar"}</button>
      </div>
    </Dialog>
  );
}
