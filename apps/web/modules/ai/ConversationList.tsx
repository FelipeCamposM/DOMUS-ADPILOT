"use client";

import { MessageSquarePlus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ago } from "@/lib/format";
import { toast } from "../shell/toast";
import { apagarConversa } from "./actions";

interface Item { id: string; title: string; status: string; updated_at: string; pendentes: number }

/** Histórico de conversas do workspace, com busca local e indicador de resposta em andamento / ações pendentes. */
export function ConversationList({ itens }: { itens: Item[] }) {
  const { id } = useParams<{ id?: string }>();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [, start] = useTransition();
  const t = q.trim().toLowerCase();
  const filtrados = t ? itens.filter((c) => c.title.toLowerCase().includes(t)) : itens;

  const apagar = (c: Item) => {
    if (!confirm(`Apagar a conversa “${c.title}”? O histórico some para todos do workspace.`)) return;
    start(async () => {
      const r = await apagarConversa(c.id);
      if (!r.ok) return toast.err(r.error);
      if (c.id === id) router.push("/ai");
      router.refresh();
    });
  };

  return (
    <aside style={{ borderRight: "1px solid rgb(var(--c-border))", display: "flex", flexDirection: "column", minHeight: 0, background: "rgb(var(--c-bg-surface) / 0.35)" }}>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <Link href="/ai" className="btn btn-secondary btn-sm" style={{ width: "100%" }}><MessageSquarePlus aria-hidden /> Nova conversa</Link>
        <label style={{ position: "relative" }}>
          <Search size={14} aria-hidden style={{ position: "absolute", left: 10, top: 10, color: "rgb(var(--c-text-tertiary))" }} />
          <input className="input-sm" style={{ width: "100%", paddingLeft: 30 }} placeholder="Buscar no histórico" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar conversas" />
        </label>
      </div>
      <nav style={{ overflowY: "auto", padding: "0 8px 12px", flex: 1 }} aria-label="Conversas">
        {filtrados.length === 0 && <p className="subtle small" style={{ padding: 12 }}>{t ? "Nada encontrado." : "Nenhuma conversa ainda."}</p>}
        {filtrados.map((c) => (
          <div key={c.id} className="conv-item" data-active={c.id === id}>
            <Link href={`/ai/${c.id}`} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {c.status === "RUNNING" && <span className="dot on" aria-label="Respondendo" />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 550 }}>{c.title}</span>
              </div>
              <div className="subtle" style={{ fontSize: 11 }} suppressHydrationWarning>
                {ago(c.updated_at)}{c.pendentes > 0 && <span style={{ color: "rgb(var(--c-brand))" }}> · {c.pendentes} para aprovar</span>}
              </div>
            </Link>
            <button className="conv-del" onClick={() => apagar(c)} aria-label={`Apagar ${c.title}`}><Trash2 size={13} aria-hidden /></button>
          </div>
        ))}
      </nav>
    </aside>
  );
}
