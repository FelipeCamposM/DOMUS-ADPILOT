"use client";

import { gsap } from "gsap";
import { Clapperboard, ImageIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Escolha } from "../motion/Escolha";
import { NewImageForm } from "./NewImageForm";
import { NewVideoForm } from "./NewVideoForm";

type Aba = "video" | "imagem";

/**
 * "Novo" do Studio com as duas abas montadas: trocar não recarrega a página nem perde o que foi digitado.
 * A aba que sai some rápido; a que entra sobe painel a painel. A URL acompanha (?tipo=imagem) sem navegação.
 */
export function StudioNovo({ inicial, video, imagem }: { inicial: Aba; video: ComponentProps<typeof NewVideoForm>; imagem: ComponentProps<typeof NewImageForm> }) {
  const [aba, setAba] = useState<Aba>(inicial);
  const [visivel, setVisivel] = useState<Aba>(inicial);
  const caixas = { video: useRef<HTMLDivElement>(null), imagem: useRef<HTMLDivElement>(null) };
  const titulo = useRef<HTMLHeadingElement>(null);
  const montou = useRef(false);

  const trocar = (nova: Aba) => {
    if (nova === aba) return;
    setAba(nova);
    history.replaceState(null, "", nova === "imagem" ? "/studio/novo?tipo=imagem" : "/studio/novo");
    const sai = caixas[visivel].current;
    if (!sai || matchMedia("(prefers-reduced-motion: reduce)").matches) return setVisivel(nova);
    gsap.to(sai.querySelectorAll(":scope > * > .panel, :scope > * > .stack > *, :scope > * > .studio-anexos"), {
      opacity: 0, y: -10, filter: "blur(4px)", duration: 0.22, ease: "power2.in", stagger: 0.02, onComplete: () => setVisivel(nova),
    });
  };

  // a aba que entra: painéis sobem em cascata
  useLayoutEffect(() => {
    const entra = caixas[visivel].current;
    if (!montou.current) { montou.current = true; return; } // a 1ª entrada é a da página (Motion)
    if (!entra || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const alvos = entra.querySelectorAll(":scope > * > .panel, :scope > * > .stack > *, :scope > * > .studio-anexos");
    gsap.fromTo(alvos, { opacity: 0, y: 18, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, ease: "expo.out", stagger: 0.05, clearProps: "opacity,transform,filter" });
    if (titulo.current) gsap.fromTo(titulo.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out", clearProps: "opacity,transform" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" data-enter>Studio</div>
          <h1 ref={titulo} className="page-title" data-enter>{visivel === "imagem" ? "Nova imagem" : "Novo vídeo"}</h1>
        </div>
        <Escolha valor={aba} raio={999} variante="pilula" className="cluster" style={{ gap: 4, padding: 3, borderRadius: 12, border: "1px solid rgb(var(--c-border))", background: "rgb(var(--c-bg-surface))" }}>
          {([["video", "Vídeo", Clapperboard], ["imagem", "Imagem", ImageIcon]] as const).map(([v, l, I]) => (
            <button key={v} data-opt={v} type="button" role="tab" aria-selected={aba === v} className="chip" data-active={aba === v} onClick={() => trocar(v)} style={{ height: 32, border: 0 }}>
              <I aria-hidden /> {l}
            </button>
          ))}
        </Escolha>
      </div>
      <div ref={caixas.video} className="studio-aba" hidden={visivel !== "video"}><NewVideoForm {...video} /></div>
      <div ref={caixas.imagem} className="studio-aba" hidden={visivel !== "imagem"}><NewImageForm {...imagem} /></div>
    </>
  );
}
