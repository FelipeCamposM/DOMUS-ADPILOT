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
