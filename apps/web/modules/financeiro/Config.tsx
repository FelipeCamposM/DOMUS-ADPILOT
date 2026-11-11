"use client";

import type { Categoria, Conexao, Conta, Etiqueta } from "@domus-ads/core/financeiro-db";
import { brl, NATUREZA_ROTULO, type Natureza } from "@domus-ads/core/financeiro";
import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { removerCategoria, removerConexao, removerEtiqueta, removerRegra, salvarCategoria, salvarConexao, salvarConta, salvarEtiqueta } from "./actions";

export interface Regra { id: number; padrao: string; categoria: string | null; etiqueta: string | null; natureza: Natureza | null }

type R = { ok: true } | { ok: false; error: string };
function useAcao() {
  const [indo, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const rodar = (fn: () => Promise<R | { ok: boolean; error?: string }>, ok?: string) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? ok ?? null : (r as { error: string }).error);
  });
  return { indo, msg, rodar };
}

export function Conexoes({ conexoes }: { conexoes: Conexao[] }) {
  const [itemId, setItemId] = useState("");
  const [pessoa, setPessoa] = useState<"PF" | "PJ">("PF");
  const [apelido, setApelido] = useState("");
  const { indo, msg, rodar } = useAcao();
  return (
    <div className="stack" style={{ gap: 14 }}>
      <ol className="fin-passos caption">
        <li>Entre no painel da Pluggy (dashboard.pluggy.ai) → sua aplicação → <b>Ir para Demo</b>.</li>
        <li>Em cada conexão (banco), clique em <b>⋮ → Copiar Item ID</b> e cole aqui.</li>
        <li>Escolha se é pessoa física ou jurídica. O worker sincroniza na hora e depois a cada 6 horas.</li>
      </ol>
      <form className="fin-form-linha" onSubmit={(e) => { e.preventDefault(); rodar(async () => { const r = await salvarConexao({ itemId, pessoa, apelido: apelido || undefined }); if (r.ok) { setItemId(""); setApelido(""); } return r; }, "Conectado. Sincronizando…"); }}>
        <input className="input-sm" required placeholder="Item ID (ex.: 3f2c…-…)" value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Item ID da Pluggy" style={{ flex: "2 1 280px" }} />
        <input className="input-sm" placeholder="Apelido (opcional)" value={apelido} maxLength={60} onChange={(e) => setApelido(e.target.value)} aria-label="Apelido" />
        <select className="select" value={pessoa} onChange={(e) => setPessoa(e.target.value as "PF" | "PJ")} aria-label="Pessoa"><option value="PF">Pessoa física</option><option value="PJ">Pessoa jurídica</option></select>
        <button className="btn btn-primary btn-sm" disabled={indo}><Plus aria-hidden />Conectar</button>
      </form>
      {msg && <p className="caption subtle" role="status">{msg}</p>}
      <ul className="fin-contas">
        {conexoes.map((c) => (
          <li key={c.item_id} style={{ "--cc": c.banco_cor ?? "#7420e0" } as React.CSSProperties}>
            {c.banco_logo ? <img src={c.banco_logo} alt="" width={34} height={34} /> : <span className="fin-contas-logo" aria-hidden>?</span>}
            <span><b>{c.apelido || c.banco || "Aguardando 1ª sincronização"}</b>
              <small>{c.pessoa} · {c.status ?? "—"} · {c.ultima_sync ? `sincronizado ${new Date(c.ultima_sync).toLocaleString("pt-BR")}` : "nunca sincronizado"}{c.erro ? ` · erro: ${c.erro}` : ""}</small></span>
            <button className="btn btn-ghost btn-sm" disabled={indo} aria-label="Remover conexão"
              onClick={() => { if (confirm("Remover este banco e todo o histórico dele daqui? (Na Pluggy continua conectado.)")) rodar(() => removerConexao(c.item_id)); }}><Trash2 aria-hidden /></button>
          </li>
        ))}
        {!conexoes.length && <li className="subtle">Nenhum banco conectado.</li>}
      </ul>
    </div>
  );
}

export function Contas({ contas, categorias }: { contas: Conta[]; categorias: Categoria[] }) {
  const { indo, msg, rodar } = useAcao();
  const rendas = categorias.filter((c) => c.tipo === "renda");
  const salvar = (c: Conta, o: Partial<{ pessoa: "PF" | "PJ"; apelido: string | null; categoriaRendaId: number | null; oculta: boolean }>) =>
    rodar(() => salvarConta({ id: c.id, pessoa: c.pessoa, apelido: c.apelido, categoriaRendaId: c.categoria_renda_id, oculta: c.oculta, ...o }), "Salvo.");
  if (!contas.length) return <p className="subtle caption">As contas aparecem aqui depois da 1ª sincronização.</p>;
  return (
    <div className="fin-tabela-wrap">
      {msg && <p className="caption subtle" role="status">{msg}</p>}
      <table className="fin-tabela">
        <thead><tr><th>Conta</th><th>Apelido</th><th>Pessoa</th><th>Entradas viram</th><th>Saldo</th><th>Ocultar</th></tr></thead>
        <tbody>
          {contas.map((c) => (
            <tr key={c.id} data-oculta={c.oculta || undefined}>
              <td><b>{c.banco}</b><small>{c.tipo === "CREDIT" ? "Cartão" : "Conta"} · {c.nome}</small></td>
              <td><input className="input-sm" defaultValue={c.apelido ?? ""} maxLength={60} placeholder={c.nome} disabled={indo}
                onBlur={(e) => { if ((e.target.value || null) !== c.apelido) salvar(c, { apelido: e.target.value || null }); }} aria-label="Apelido da conta" /></td>
              <td><select className="select" value={c.pessoa} disabled={indo} onChange={(e) => salvar(c, { pessoa: e.target.value as "PF" | "PJ" })} aria-label="Pessoa"><option value="PF">PF</option><option value="PJ">PJ</option></select></td>
              <td>{c.tipo === "BANK" ? (
                <select className="select" value={c.categoria_renda_id ?? ""} disabled={indo} onChange={(e) => salvar(c, { categoriaRendaId: e.target.value ? Number(e.target.value) : null })} aria-label="Categoria das entradas">
                  <option value="">Automático</option>{rendas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>) : <span className="subtle">—</span>}</td>
              <td className="tabular">{c.saldo != null ? brl(c.saldo) : "—"}</td>
              <td><input type="checkbox" checked={c.oculta} disabled={indo} onChange={(e) => salvar(c, { oculta: e.target.checked })} aria-label="Ocultar conta" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Etiquetas({ etiquetas }: { etiquetas: Etiqueta[] }) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#e879f9");
  const [emoji, setEmoji] = useState("");
  const { indo, msg, rodar } = useAcao();
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="caption subtle">Etiquetas cruzam categorias: “Juju” pode estar num restaurante, num presente ou numa viagem. Os totais aparecem na visão geral.</p>
      <div className="fin-editor-etq">
        {etiquetas.map((e) => (
          <span key={e.id} className="fin-etq" aria-pressed="true" style={{ "--etq": e.cor } as React.CSSProperties}>
            {e.emoji} {e.nome}
            <button className="fin-x" aria-label={`Apagar ${e.nome}`} disabled={indo} onClick={() => { if (confirm(`Apagar a etiqueta ${e.nome}?`)) rodar(() => removerEtiqueta(e.id)); }}>×</button>
          </span>
        ))}
      </div>
      <form className="fin-form-linha" onSubmit={(ev) => { ev.preventDefault(); rodar(async () => { const r = await salvarEtiqueta({ nome, cor, emoji: emoji || null }); if (r.ok) { setNome(""); setEmoji(""); } return r; }); }}>
        <input className="input-sm" style={{ width: 70 }} placeholder="💜" value={emoji} maxLength={8} onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" />
        <input className="input-sm" required placeholder="Nova etiqueta (ex.: Viagem com a Juju)" value={nome} maxLength={30} onChange={(e) => setNome(e.target.value)} aria-label="Nome da etiqueta" />
        <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} aria-label="Cor" className="fin-cor" />
        <button className="btn btn-secondary btn-sm" disabled={indo}><Plus aria-hidden />Criar</button>
      </form>
      {msg && <p className="caption subtle" role="status">{msg}</p>}
    </div>
  );
}

export function Categorias({ categorias }: { categorias: Categoria[] }) {
  const { indo, msg, rodar } = useAcao();
  const [nova, setNova] = useState({ nome: "", tipo: "gasto" as "gasto" | "renda", cor: "#a855ff" });
  const salvar = (c: Categoria, orc: string) => {
    const v = orc.trim() ? Number(orc.replace(/\./g, "").replace(",", ".")) : null;
    if (v != null && !Number.isFinite(v)) return;
    if ((v == null ? null : Math.round(v * 100)) === c.orcamento) return;
    rodar(() => salvarCategoria({ id: c.id, nome: c.nome, tipo: c.tipo, cor: c.cor, orcamento: v }), "Orçamento salvo.");
  };
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="caption subtle">Orçamento mensal por categoria (opcional): passar dele vira alerta na análise.</p>
      <div className="fin-cat-grade">
        {categorias.map((c) => (
          <div key={c.id} className="fin-cat-item">
            <i style={{ background: c.cor }} />
            <span>{c.nome}<small>{c.tipo}</small></span>
            {c.tipo === "gasto" && <input className="input-sm tabular" inputMode="decimal" placeholder="Sem orçamento" defaultValue={c.orcamento != null ? (c.orcamento / 100).toFixed(2).replace(".", ",") : ""}
              onBlur={(e) => salvar(c, e.target.value)} aria-label={`Orçamento de ${c.nome}`} disabled={indo} />}
            <button className="btn btn-ghost btn-sm" aria-label={`Apagar ${c.nome}`} disabled={indo} onClick={() => { if (confirm(`Apagar a categoria ${c.nome}? Os lançamentos ficam sem categoria.`)) rodar(() => removerCategoria(c.id)); }}><Trash2 aria-hidden /></button>
          </div>
        ))}
      </div>
      <form className="fin-form-linha" onSubmit={(e) => { e.preventDefault(); rodar(async () => { const r = await salvarCategoria({ ...nova, orcamento: null }); if (r.ok) setNova({ ...nova, nome: "" }); return r; }); }}>
        <input className="input-sm" required placeholder="Nova categoria" value={nova.nome} maxLength={40} onChange={(e) => setNova({ ...nova, nome: e.target.value })} aria-label="Nome da categoria" />
        <select className="select" value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as "gasto" | "renda" })} aria-label="Tipo"><option value="gasto">Gasto</option><option value="renda">Renda</option></select>
        <input type="color" className="fin-cor" value={nova.cor} onChange={(e) => setNova({ ...nova, cor: e.target.value })} aria-label="Cor" />
        <button className="btn btn-secondary btn-sm" disabled={indo}><Plus aria-hidden />Criar</button>
      </form>
      {msg && <p className="caption subtle" role="status">{msg}</p>}
    </div>
  );
}

export function Regras({ regras }: { regras: Regra[] }) {
  const { indo, rodar } = useAcao();
  if (!regras.length) return <p className="caption subtle">Nenhuma regra. Ao classificar um lançamento com “Aplicar às parecidas”, a regra aparece aqui.</p>;
  return (
    <ul className="fin-regras">
      {regras.map((r) => (
        <li key={r.id}>
          <code>{r.padrao}</code>
          <span>→ {[r.categoria, r.etiqueta && `#${r.etiqueta}`, r.natureza && NATUREZA_ROTULO[r.natureza]].filter(Boolean).join(" · ")}</span>
          <button className="btn btn-ghost btn-sm" aria-label="Apagar regra" disabled={indo} onClick={() => rodar(() => removerRegra(r.id))}><Trash2 aria-hidden /></button>
        </li>
      ))}
    </ul>
  );
}
