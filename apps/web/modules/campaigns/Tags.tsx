import { STATUS_LABEL } from "@/lib/format";

export function ProviderTag({ p }: { p: string }) {
  return p === "META"
    ? <span className="provider meta"><i aria-hidden>M</i>Meta</span>
    : <span className="provider google"><i aria-hidden>G</i>Google</span>;
}

export function StatusTag({ s }: { s: string }) {
  const cls = s === "ACTIVE" ? "on" : s === "ERROR" ? "err" : s === "PAUSED" ? "warn" : "";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><span className={`dot ${cls}`} aria-hidden />{STATUS_LABEL[s] ?? s}</span>;
}
