/** Mascote do Claude (o caranguejinho de pixel do Claude Code), redesenhado em pixels. Corpo em currentColor. */
export function Mascote({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 13 7" width={size} height={(size * 7) / 13} shapeRendering="crispEdges" aria-hidden className={`cx-mascote ${className ?? ""}`}>
      <path fill="currentColor" d="M2 0h9v5H2zM0 2h2v2H0zM11 2h2v2h-2z" />
      <g fill="currentColor">
        <rect className="cx-leg" x="3" y="5" width="1" height="2" />
        <rect className="cx-leg" x="5" y="5" width="1" height="2" />
        <rect className="cx-leg" x="7" y="5" width="1" height="2" />
        <rect className="cx-leg" x="9" y="5" width="1" height="2" />
      </g>
      <g className="cx-eyes" fill="rgb(var(--c-brand-deep))">
        <rect x="4" y="1" width="1" height="2" />
        <rect x="8" y="1" width="1" height="2" />
      </g>
    </svg>
  );
}
