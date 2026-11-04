import { describe, expect, it } from "vitest";
import { linksInternos, textoDaPagina } from "./marca-conhecimento";

describe("base de conhecimento", () => {
  it("texto com títulos e listas, sem script", () => {
    const t = textoDaPagina(`<h1>Planos</h1><script>x()</script><p>Teste grátis &amp; sem cartão</p><ul><li>PDV</li><li>NF-e</li></ul>`);
    expect(t).toBe("## Planos\nTeste grátis & sem cartão\n- PDV\n- NF-e");
  });
  it("só links do mesmo site, sem arquivo nem âncora", () => {
    const l = linksInternos(`<a href="/planos?x=1#a">p</a><a href="https://www.site.com/sobre/">s</a><a href="https://outro.com">o</a><a href="/doc.pdf">d</a><a href="#topo">t</a>`, new URL("https://site.com/"));
    expect(l).toEqual(["https://site.com/planos", "https://www.site.com/sobre"]);
  });
});
