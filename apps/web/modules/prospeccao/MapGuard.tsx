"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/** Mapa que falhar (ladrilho, WebGL, Leaflet) não derruba a tela: mostra um aviso no lugar. Fora de Mapas.tsx porque lá o Leaflet precisa do navegador. */
export class MapGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Falha ao renderizar o mapa da prospecção", error, info); }
  render() { return this.state.failed ? <MapPlaceholder message="O mapa não pôde ser carregado, mas os resultados continuam disponíveis." /> : this.props.children; }
}

export function MapPlaceholder({ message }: { message: string }) {
  return <section className="panel pp-mapa-vazio" aria-label="Mapa dos leads"><p>{message}</p></section>;
}
