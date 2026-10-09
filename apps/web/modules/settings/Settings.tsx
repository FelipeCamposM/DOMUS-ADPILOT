"use client";

import { AudioLines, KeyRound, Loader2, Palette, Plus, Power, Server, Terminal, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { ago, dateTime, int } from "@/lib/format";
import { toast } from "../shell/toast";
import { adicionarMembro, alterarPapel, criarWorkspace, removerMembro, renomearWorkspace, salvarChaveElevenLabs, trocarSenha } from "./actions";
import { AiAccounts, type ContaIA, type Detectada } from "./AiAccounts";
import { inicializacaoWorker } from "./ai-accounts";
import { BrandEditor, type BrandValor } from "./BrandEditor";

export type { ContaIA };

export interface Membro { user_id: string; email: string; role: string }

const PAPEIS = [["owner", "Owner"], ["admin", "Admin"], ["editor", "Editor"], ["viewer", "Leitura"]] as const;

function useAcao() {
  const router = useRouter();
  const [pend, start] = useTransition();
  const rodar = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, depois?: () => void) => start(async () => {
    const r = await fn();
    if (r.ok) { toast.ok(msg); depois?.(); } else toast.err(r.error ?? "Erro");
    router.refresh();
  });
  return { pend, rodar };
}

function Secao({ id, icon, titulo, desc, children }: { id: string; icon: ReactNode; titulo: string; desc: string; children: ReactNode }) {
  return (
    <section id={id} className="panel" data-enter style={{ scrollMarginTop: 24 }}>
      <div className="panel-head" style={{ justifyContent: "flex-start", gap: 12 }}>
        <span className="icon-tile" style={{ width: 34, height: 34 }}>{icon}</span>
        <div><div className="panel-title">{titulo}</div><div className="subtle caption">{desc}</div></div>
      </div>
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </section>
  );
}

export function Settings(p: {
  ws: { name: string; role: string }; membros: Membro[]; eu: string; contas: ContaIA[]; detectadas: Detectada[]; podeOwnerIA: boolean;
  brand: BrandValor; imagens: { id: string; name: string }[];
  elevenlabs: {
    configurada: boolean; vozes: number | null; erro: string | null;
    creditos: { plano: string; usados: number; limite: number; renovaEm: string | null } | null; erroCreditos: string | null;
  };
  usoVoz: { id: string; created_at: string; voice_name: string | null; characters: number; credits: number; titulo: string | null; video_project_id: string | null }[];
  worker: { online: boolean; lastSeen: string | null; info: Record<string, unknown> };
}) {
  const { pend, rodar } = useAcao();
  const [wsNome, setWsNome] = useState(p.ws.name);
  const [novoWs, setNovoWs] = useState("");
  const [m, setM] = useState({ email: "", role: "editor", senha: "" });
  const [senha, setSenha] = useState("");
  const [chaveEl, setChaveEl] = useState("");
  const admin = p.ws.role === "owner" || p.ws.role === "admin";

  return (
    <>
      <Secao id="workspace" icon={<Users size={16} aria-hidden />} titulo="Workspace" desc="Cada workspace tem as próprias conexões, campanhas, conversas e membros.">
        <div className="cluster">
          <input className="input-sm" style={{ width: 260 }} value={wsNome} onChange={(e) => setWsNome(e.target.value)} disabled={!admin} aria-label="Nome do workspace" />
          {admin && <button className="btn btn-secondary btn-xs" disabled={pend || wsNome === p.ws.name} onClick={() => rodar(() => renomearWorkspace(wsNome), "Workspace renomeado")}>Salvar nome</button>}
          <span style={{ flex: 1 }} />
          <input className="input-sm" style={{ width: 220 }} placeholder="Ex.: Cliente A" value={novoWs} onChange={(e) => setNovoWs(e.target.value)} aria-label="Nome do novo workspace" />
          <button className="btn btn-secondary btn-xs" disabled={pend || novoWs.trim().length < 2} onClick={() => rodar(() => criarWorkspace(novoWs), "Workspace criado", () => setNovoWs(""))}><Plus aria-hidden /> Criar workspace</button>
        </div>
      </Secao>

      <Secao id="marca" icon={<Palette size={16} aria-hidden />} titulo="Identidade visual" desc="Cores, fontes, logo, tom e regras deste workspace. A IA segue isto em todo vídeo e imagem do Studio.">
        <BrandEditor inicial={p.brand} imagens={p.imagens} podeEditar={admin} nome={p.ws.name} />
      </Secao>

      <Secao id="membros" icon={<Users size={16} aria-hidden />} titulo="Membros" desc="Owner e Admin gerenciam conexões e membros · Editor opera campanhas e a IA · Leitura só consulta.">
        <table className="data">
          <thead><tr><th>E-mail</th><th>Papel</th><th aria-label="Ações" /></tr></thead>
          <tbody>
            {p.membros.map((x) => (
              <tr key={x.user_id}>
                <td>{x.email}{x.user_id === p.eu && <span className="subtle"> (você)</span>}</td>
                <td>
                  <select className="select" value={x.role} disabled={!admin || x.user_id === p.eu || pend} onChange={(e) => rodar(() => alterarPapel(x.user_id, e.target.value), "Papel alterado")} aria-label={`Papel de ${x.email}`}>
                    {PAPEIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: "right" }}>
                  {admin && x.user_id !== p.eu && (
                    <button className="btn btn-ghost btn-xs" onClick={() => confirm(`Remover ${x.email} deste workspace?`) && rodar(() => removerMembro(x.user_id), "Membro removido")}><Trash2 aria-hidden /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {admin && (
          <div className="cluster" style={{ alignItems: "flex-end" }}>
            <div className="field"><label className="label" htmlFor="me">E-mail</label><input id="me" className="input-sm" style={{ width: 240 }} value={m.email} onChange={(e) => setM({ ...m, email: e.target.value })} /></div>
            <div className="field"><label className="label" htmlFor="mr">Papel</label>
              <select id="mr" className="select" value={m.role} onChange={(e) => setM({ ...m, role: e.target.value })}>{PAPEIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="field"><label className="label" htmlFor="ms">Senha provisória (só se a pessoa não tiver conta)</label><input id="ms" className="input-sm" type="text" autoComplete="off" style={{ width: 240 }} value={m.senha} onChange={(e) => setM({ ...m, senha: e.target.value })} /></div>
            <button className="btn btn-primary btn-xs" disabled={pend || !m.email} onClick={() => rodar(() => adicionarMembro(m), "Membro adicionado", () => setM({ email: "", role: "editor", senha: "" }))}><Plus aria-hidden /> Adicionar</button>
          </div>
        )}
      </Secao>

      <Secao id="ia" icon={<Terminal size={16} aria-hidden />} titulo="Contas de IA" desc="Assinaturas Claude e ChatGPT (Codex) usadas pela IA. No limite de 5 h ou semanal, a conversa continua sozinha na próxima conta.">
        <AiAccounts contas={p.contas} detectadas={p.detectadas} podeAdmin={p.podeOwnerIA} workerOnline={p.worker.online} />
      </Secao>

      <Secao id="vozes" icon={<AudioLines size={16} aria-hidden />} titulo="Vozes" desc="A voz local (Kokoro) é grátis e já vem pronta. Com uma chave do ElevenLabs, as vozes da sua conta aparecem no Studio, e a legenda segue cada palavra falada.">
        <div className="cluster">
          <span className="chip"><span className={`dot ${p.elevenlabs.configurada && !p.elevenlabs.erro ? "on" : p.elevenlabs.erro ? "err" : ""}`} aria-hidden />
            {!p.elevenlabs.configurada ? "ElevenLabs não configurado" : p.elevenlabs.erro ? `ElevenLabs: ${p.elevenlabs.erro}` : `ElevenLabs conectado · ${p.elevenlabs.vozes} vozes`}</span>
        </div>
        {p.podeOwnerIA ? (
          <div className="cluster">
            <input className="input-sm" type="password" autoComplete="off" placeholder="Chave da API (elevenlabs.io → Developers → API Keys)" value={chaveEl} onChange={(e) => setChaveEl(e.target.value)} style={{ width: 380 }} aria-label="Chave do ElevenLabs" />
            <button className="btn btn-primary btn-xs" disabled={pend || chaveEl.trim().length < 20} onClick={() => rodar(() => salvarChaveElevenLabs(chaveEl), "Chave validada e salva", () => setChaveEl(""))}>Salvar chave</button>
            {p.elevenlabs.configurada && <button className="btn btn-ghost btn-xs" disabled={pend} onClick={() => confirm("Remover a chave do ElevenLabs? Vídeos novos voltam a usar só a voz local.") && rodar(() => salvarChaveElevenLabs(null), "Chave removida")}><Trash2 aria-hidden /> Remover</button>}
          </div>
        ) : <p className="subtle small">Só administradores da plataforma configuram a chave.</p>}
        {p.elevenlabs.creditos ? (() => {
          const c = p.elevenlabs.creditos;
          const uso = c.limite > 0 ? c.usados / c.limite : 0;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 520 }}>
              <div className="cluster" style={{ justifyContent: "space-between" }}>
                <span className="small"><strong>{int(c.limite - c.usados)}</strong> créditos disponíveis · {int(c.usados)} de {int(c.limite)} usados</span>
                <span className="muted small">Plano {c.plano}{c.renovaEm ? ` · renova ${dateTime(c.renovaEm)}` : ""}</span>
              </div>
              <div className={`bar ${uso > 0.9 ? "err" : uso > 0.7 ? "warn" : ""}`}><i style={{ width: `${Math.min(100, uso * 100)}%` }} /></div>
            </div>
          );
        })() : p.elevenlabs.erroCreditos && <p className="subtle small">{p.elevenlabs.erroCreditos}</p>}
        {p.usoVoz.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Data</th><th>Vídeo</th><th>Voz</th><th className="num">Caracteres</th><th className="num">Créditos</th></tr></thead>
              <tbody>
                {p.usoVoz.map((u) => (
                  <tr key={u.id}>
                    <td suppressHydrationWarning>{dateTime(u.created_at)}</td>
                    <td>{u.video_project_id ? <Link href={`/studio/${u.video_project_id}`}>{u.titulo ?? "Vídeo"}</Link> : <span className="muted">removido</span>}</td>
                    <td>{u.voice_name ?? "—"}</td>
                    <td className="num">{int(u.characters)}</td>
                    <td className="num">{int(u.credits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao id="worker" icon={<Server size={16} aria-hidden />} titulo="Worker local" desc="Processo no PC que sincroniza as contas e roda a IA. Não abre nenhuma porta: ele busca o trabalho no banco.">
        <div className="cluster">
          <span className="chip"><span className={`dot ${p.worker.online ? "on" : "err"}`} aria-hidden />{p.worker.online ? "Online" : "Offline"}</span>
          <span className="muted small" suppressHydrationWarning>Último sinal {ago(p.worker.lastSeen)}</span>
          {p.worker.info.host ? <span className="muted small">· {String(p.worker.info.host)} · Node {String(p.worker.info.node)} · {String(p.worker.info.concurrency)} jobs simultâneos · sync a cada {String(p.worker.info.syncIntervalMin)} min</span> : null}
        </div>
        {p.podeOwnerIA && p.worker.info.autostart != null && (
          <div className="cluster">
            <Power size={16} aria-hidden className="text-tertiary" />
            <span className="small" style={{ flex: 1 }}>
              {p.worker.info.autostart ? "Inicia sozinho com o Windows (reinicia se cair)." : "Não inicia com o Windows: se o PC reiniciar, o worker fica parado até alguém abrir."}
            </span>
            <button className={p.worker.info.autostart ? "btn btn-xs btn-secondary" : "btn btn-xs btn-primary"} disabled={pend || !p.worker.online}
              onClick={() => rodar(() => inicializacaoWorker(!p.worker.info.autostart), p.worker.info.autostart ? "Pedido enviado: o worker deixa de iniciar com o Windows" : "Pedido enviado: o worker vai iniciar com o Windows")}>
              {p.worker.info.autostart ? "Desligar início automático" : "Iniciar com o Windows"}
            </button>
          </div>
        )}
      </Secao>

      <Secao id="conta" icon={<KeyRound size={16} aria-hidden />} titulo="Minha conta" desc="Troque a senha (por exemplo, a provisória que recebeu).">
        <div className="cluster">
          <input className="input-sm" type="password" autoComplete="new-password" placeholder="Nova senha (8+ caracteres)" value={senha} onChange={(e) => setSenha(e.target.value)} style={{ width: 260 }} aria-label="Nova senha" />
          <button className="btn btn-secondary btn-xs" disabled={pend || senha.length < 8} onClick={() => rodar(() => trocarSenha(senha), "Senha alterada", () => setSenha(""))}>
            {pend ? <Loader2 className="animate-spin" aria-hidden /> : "Trocar senha"}
          </button>
        </div>
      </Secao>
    </>
  );
}
