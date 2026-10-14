import { brandSchema, briefSchema, tempoLeitura, violacoes, type Storyboard } from "@domus-ads/core";
import { expect, test } from "vitest";
import { blocosLegenda, montarComposicao } from "./kit/cenas";

const cena = (o: Partial<Storyboard["scenes"][number]>) => ({ start: 0, end: 4, headline: "Seu ROAS é sorte?", subtext: "", narration: "", animation: "fade-up", visual: "", ...o });

test("tempo de leitura cresce com o texto e tem mínimo", () => {
  expect(tempoLeitura({ headline: "Oi" })).toBeGreaterThanOrEqual(2.8);
  expect(tempoLeitura({ headline: "Uma frase bem mais longa para ler com calma", subtext: "e ainda um apoio com várias palavras aqui" })).toBeGreaterThan(5);
});

test("legenda em blocos curtos, cada um com tempo para ler", () => {
  const b = blocosLegenda(cena({ end: 6, fala: 4, narration: "A inteligência artificial lê todas as suas campanhas por você todos os dias." }));
  expect(b.length).toBeGreaterThan(1);
  for (const x of b) { expect(x.txt.length).toBeLessThanOrEqual(7); expect(x.e - x.s).toBeGreaterThanOrEqual(0.5); }
  expect(b[0]!.s).toBeCloseTo(0.25, 2);
});

test("composição de cenas prontas passa na barreira de segurança, nos 3 estilos", () => {
  const sb: Storyboard = { title: "t", duration: 8, fps: 30, sfx: [], music: null, scenes: [
    cena({ tipo: "abertura", start: 0, end: 4, narration: "Olá <script>x</script>" }),
    cena({ tipo: "cta", start: 4, end: 8, headline: 'Teste "agora" & já' }),
  ] };
  for (const estiloVisual of ["hud", "clay", "editorial"] as const) {
    const html = montarComposicao({ sb, brief: briefSchema.parse({ produto: "Produto X", objetivo: "vender mais", duracao: 10, formato: "9:16", estiloVisual }), brand: brandSchema.parse({}), w: 1080, h: 1920, assets: [], rotulo: "X" });
    expect(violacoes(html)).toEqual([]);
    expect(html).not.toContain("<script>x</script>"); // texto do roteiro é escapado
  }
});

test("marca escura com 3 cores: só cores da marca e contraste certo no clay", () => {
  const brand = brandSchema.parse({ cores: [{ hex: "#0A0A0E", nome: "Fundo" }, { hex: "#D1FE17", nome: "Verde" }, { hex: "#FAFAFC", nome: "Texto" }] });
  const sb: Storyboard = { title: "t", duration: 4, fps: 30, sfx: [], music: null, scenes: [cena({ tipo: "cta" })] };
  const html = montarComposicao({ sb, brief: briefSchema.parse({ produto: "SIAPLUS", objetivo: "vender", duracao: 10, formato: "9:16", estiloVisual: "clay" }), brand, w: 1080, h: 1920, assets: [], rotulo: "X" });
  expect(html).toContain("--a2:#D1FE17"); // cor que falta repete o destaque da marca, não o rosa do estilo
  expect(html).toContain("--on:#0A0A0E"); // texto escuro sobre o verde claro
  expect(html).not.toMatch(/#FF9EC4|#7DD3FC|#8B5CF6/);
});
