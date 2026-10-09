import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <div className="auth">
      <div className="empty">
        <h1 className="h2">Página não encontrada</h1>
        <Link href="/" className="btn btn-secondary">Voltar para a visão geral</Link>
      </div>
    </div>
  );
}
