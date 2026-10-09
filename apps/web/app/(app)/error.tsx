"use client";

import { AlertTriangle } from "lucide-react";

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page">
      <div className="panel">
        <div className="empty">
          <span className="icon-tile" style={{ color: "rgb(var(--c-error))", background: "rgb(var(--c-error) / 0.08)", borderColor: "rgb(var(--c-error) / 0.2)" }}><AlertTriangle aria-hidden /></span>
          <h2 className="h3">Algo deu errado ao carregar esta tela</h2>
          <p className="muted small">{error.digest ? `Código: ${error.digest}` : "Tente de novo em instantes."}</p>
          <button className="btn btn-secondary btn-sm" onClick={reset}>Tentar de novo</button>
        </div>
      </div>
    </div>
  );
}
