import { isPlatformAdmin, requireCtx } from "@/lib/ctx";
import { workerOnline } from "@/lib/queries";
import { consumoSistemas } from "@/lib/sistemas";
import { Sistemas } from "@/modules/sistemas/Sistemas";

export const metadata = { title: "Sistemas" };

/** Outros apps do dono que usam as contas de IA daqui (pela API /api/externo/v1) e quanto cada um consumiu. */
export default async function SistemasPage() {
  const ctx = await requireCtx();
  if (!isPlatformAdmin(ctx)) return <div className="page"><div className="empty">Só o admin da plataforma vê os sistemas conectados.</div></div>;
  const [dados, w] = await Promise.all([consumoSistemas(), workerOnline()]);
  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow" data-enter>Central de IA da empresa</div>
          <h1 className="page-title" data-enter>Sistemas</h1>
        </div>
        <span className="chip" data-enter><span className={`dot ${w.online ? "on" : "err"}`} aria-hidden />Worker {w.online ? "online" : "offline: os pedidos esperam na fila"}</span>
      </div>
      <Sistemas {...dados} />
    </div>
  );
}
