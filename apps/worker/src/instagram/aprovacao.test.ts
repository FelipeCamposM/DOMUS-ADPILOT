import { expect, test } from "vitest";
import { lerResposta } from "./calendario";

test("resposta do WhatsApp: sim, não e pedido de mudança", () => {
  for (const t of ["Sim", "sim!", "SIM.", "s", "ok", "Pode postar", "aprovado", "👍", "👍🏽", "✅"]) expect(lerResposta(t), t).toEqual({ tipo: "sim" });
  for (const t of ["não", "Nao", "N", "não!", "👎"]) expect(lerResposta(t), t).toEqual({ tipo: "nao" });
  expect(lerResposta("Não, muda o título pra algo mais curto")).toEqual({ tipo: "pedido", pedido: "muda o título pra algo mais curto" });
  expect(lerResposta("sim, mas troca a cor do fundo")).toEqual({ tipo: "pedido", pedido: "sim, mas troca a cor do fundo" });
  expect(lerResposta("nada de emoji na legenda")).toEqual({ tipo: "pedido", pedido: "nada de emoji na legenda" });
});
