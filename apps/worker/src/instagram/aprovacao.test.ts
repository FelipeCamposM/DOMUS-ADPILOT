import { expect, test } from "vitest";
import { lerResposta, querMotion3D } from "./calendario";

test("resposta do WhatsApp: sim, não e pedido de mudança", () => {
  for (const t of ["Sim", "sim!", "SIM.", "s", "ok", "Pode postar", "aprovado", "👍", "👍🏽", "✅"]) expect(lerResposta(t), t).toEqual({ tipo: "sim" });
  for (const t of ["não", "Nao", "N", "não!", "👎"]) expect(lerResposta(t), t).toEqual({ tipo: "nao" });
  expect(lerResposta("Não, muda o título pra algo mais curto")).toEqual({ tipo: "pedido", pedido: "muda o título pra algo mais curto" });
  expect(lerResposta("sim, mas troca a cor do fundo")).toEqual({ tipo: "pedido", pedido: "sim, mas troca a cor do fundo" });
  expect(lerResposta("nada de emoji na legenda")).toEqual({ tipo: "pedido", pedido: "nada de emoji na legenda" });
});

test("pedido pelo WhatsApp liga o motion 3D (Three.js); a última menção vale", () => {
  for (const t of ["faz em 3D", "usa three.js", "anima com Threejs", "- troca a cor\n- quero em 3 d"]) expect(querMotion3D(t), t).toBe(true);
  for (const t of ["", "troca a cor", "faz em 2D com gsap", "- faz em 3D\n- melhor em 2D", "3Dimensional", "R$ 30d"]) expect(querMotion3D(t), t).toBe(false);
});
