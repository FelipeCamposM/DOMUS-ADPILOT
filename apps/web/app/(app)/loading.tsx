export default function Loading() {
  return (
    <div className="page" aria-busy="true" aria-label="Carregando">
      <div className="skeleton" style={{ height: 14, width: 120 }} />
      <div className="skeleton" style={{ height: 34, width: 280 }} />
      <div className="kpis">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 92, borderRadius: 14 }} />)}</div>
      <div className="skeleton" style={{ height: 300, borderRadius: 14 }} />
    </div>
  );
}
