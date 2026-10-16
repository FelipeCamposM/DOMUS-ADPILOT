"use client";

import { BellRing, Loader2, LogOut, QrCode } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "../shell/toast";
import { whatsappAcao } from "./ai-accounts";
import { salvarWhatsappAvisos } from "./actions";

export interface EstadoWhatsapp { state: "open" | "connecting" | "close" | "off"; numero?: string | null; nome?: string | null; erro?: string }

const fone = (n: string) => n.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, "+$1 ($2) $3-$4");
/** Máscara enquanto digita: (62) 98179-3568 ou (62) 3201-1234 (sem o 55). */
const mascara = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const corte = d.length === 11 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, corte)}${d.length > corte ? `-${d.slice(corte)}` : ""}`;
};

/** WhatsApp dos avisos (Wuzapi no PC do worker): status, QR para conectar e desconectar. */
export function Whatsapp({ estado, qr, erro, avisos, podeAdmin, workerOnline }: { estado: EstadoWhatsapp | null; qr: string | null; erro: string | null; avisos: string | null; podeAdmin: boolean; workerOnline: boolean }) {
  const inicial = mascara(avisos?.replace(/^55/, "") ?? "");
  const [num, setNum] = useState(inicial);
  const router = useRouter();
  const [pend, start] = useTransition();
  const [aguardando, setAguardando] = useState(!!qr);
  const conectado = estado?.state === "open";

  // enquanto espera o QR ser lido, recarrega a cada 2,5 s (o worker troca o QR e avisa quando conectar)
  useEffect(() => {
    if (aguardando && erro) { setAguardando(false); toast.err(erro); return; }
    if (!aguardando || conectado) { if (conectado && aguardando) { setAguardando(false); toast.ok("WhatsApp conectado"); } return; }
    const t = setInterval(() => router.refresh(), 2500);
    const fim = setTimeout(() => setAguardando(false), 150_000);
    return () => { clearInterval(t); clearTimeout(fim); };
  }, [aguardando, conectado, erro, router]);

  const acao = (a: "conectar" | "desconectar") => start(async () => {
    const r = await whatsappAcao(a);
    if (!r.ok) { toast.err(r.error ?? "Erro"); return; }
    if (a === "conectar") setAguardando(true); else toast.ok("Pedido enviado: o número vai ser desconectado");
    router.refresh();
  });

  const salvar = () => start(async () => {
    const r = await salvarWhatsappAvisos(num);
    if (r.ok) toast.ok("Número dos avisos salvo"); else toast.err(r.error ?? "Erro");
    router.refresh();
  });

  return (
    <>
      {podeAdmin && (
        <div className="cluster" style={{ alignItems: "flex-end" }}>
          <div className="field">
            <label className="label" htmlFor="wa-avisos"><BellRing size={13} aria-hidden style={{ verticalAlign: -2 }} /> Número que recebe os avisos</label>
            <div className="cluster" style={{ gap: 6 }}>
              <span className="chip" aria-hidden>🇧🇷 +55</span>
              <input id="wa-avisos" className="input-sm tabular" style={{ width: 170 }} inputMode="tel" autoComplete="tel-national" placeholder="(62) 98179-3568"
                value={num} onChange={(e) => setNum(mascara(e.target.value))} onKeyDown={(e) => e.key === "Enter" && num !== inicial && salvar()} />
            </div>
          </div>
          <button className="btn btn-secondary btn-xs" disabled={pend || num === inicial || num.replace(/\D/g, "").length < 10} onClick={salvar}>Salvar número</button>
        </div>
      )}
      <div className="cluster">
        <span className="chip"><span className={`dot ${conectado ? "on" : estado?.state === "off" ? "err" : ""}`} aria-hidden />
          {!estado ? "Wuzapi não configurada no worker" : conectado ? ["Conectado", estado.nome, estado.numero && fone(estado.numero)].filter(Boolean).join(" · ") : estado.state === "off" ? estado.erro : "Desconectado"}
        </span>
        <span style={{ flex: 1 }} />
        {podeAdmin && estado && estado.state !== "off" && (conectado ? (
          <button className="btn btn-ghost btn-xs" disabled={pend || !workerOnline} onClick={() => confirm("Desconectar este número? Os avisos param até conectar de novo.") && acao("desconectar")}><LogOut aria-hidden /> Desconectar</button>
        ) : (
          <button className="btn btn-primary btn-xs" disabled={pend || aguardando || !workerOnline} onClick={() => acao("conectar")}>
            {pend || (aguardando && !qr) ? <Loader2 className="animate-spin" aria-hidden /> : <QrCode aria-hidden />} Conectar com QR code
          </button>
        ))}
      </div>
      {!workerOnline && <p className="subtle small">O worker está offline: ligue o PC para conectar.</p>}
      {aguardando && !conectado && (
        <div className="cluster" style={{ alignItems: "center", gap: 20 }}>
          <div style={{ width: 232, height: 232, borderRadius: 16, background: "#fff", padding: 8, display: "grid", placeItems: "center", flex: "none" }}>
            {qr ? <img src={qr} alt="QR code para conectar o WhatsApp" width={216} height={216} /> : <Loader2 className="animate-spin" size={28} color="#555" aria-label="Gerando QR code" />}
          </div>
          <ol className="small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, maxWidth: 360 }}>
            <li>No celular do chip, abra o <b>WhatsApp</b>.</li>
            <li>Toque em <b>⋮ → Aparelhos conectados → Conectar um aparelho</b>.</li>
            <li>Aponte a câmera para o QR. Ele se renova sozinho a cada ~20 s.</li>
          </ol>
        </div>
      )}
    </>
  );
}
