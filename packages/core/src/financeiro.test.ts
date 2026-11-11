import { describe, expect, it } from "vitest";
import { analisar, corrigirParcelasSemFatura, decidirNatureza, detectarAssinaturas, normalizar, padrao, parcelados, parearTransferencias, receitas, resumo, resumoReceitas, type PluggyTransacao, type TxBase } from "./financeiro";

const tx = (o: Partial<TxBase>): TxBase => ({
  id: Math.random().toString(36), contaId: "c1", pessoa: "PF", descricao: "X", valor: 1000, tipo: "debito", data: "2026-10-10", competencia: "2026-10-01",
  natureza: "gasto", categoria: null, categoriaId: null, merchant: null, encargo: false, parcela: null, totalParcelas: null, compraEm: null, etiquetas: [], assinaturaId: null, cartao: true, ...o,
});
const pluggy = (o: Partial<PluggyTransacao>): PluggyTransacao => ({
  id: "t", description: "COMPRA", descriptionRaw: null, amount: -12.34, date: "2026-08-28T00:00:00.000Z", category: null, status: "POSTED", type: "DEBIT",
  accountId: "a", merchant: null, operationType: null, creditCardMetadata: null, ...o,
});

describe("financeiro", () => {
  it("natureza: fatura, transferência própria, estorno no cartão, renda na conta", () => {
    expect(decidirNatureza({ category: "Credit card payment", description: "x", type: "DEBIT" }, false)).toBe("fatura");
    expect(decidirNatureza({ category: null, description: "PAGAMENTO DE FATURA", type: "DEBIT" }, false)).toBe("fatura");
    expect(decidirNatureza({ category: "Same person transfer", description: "pix", type: "CREDIT" }, false)).toBe("transferencia");
    expect(decidirNatureza({ category: null, description: "x", type: "CREDIT" }, true)).toBe("estorno");
    expect(decidirNatureza({ category: null, description: "x", type: "CREDIT" }, false)).toBe("renda");
  });

  it("normalizar: centavos positivos e mês da fatura no cartão", () => {
    const n = normalizar(pluggy({ amount: -12.34, creditCardMetadata: { billForecastDate: "2026-09" } }), true);
    expect(n.valor).toBe(1234);
    expect(n.competencia).toBe("2026-09-01");
    expect(normalizar(pluggy({ creditCardMetadata: { billForecastDate: "0001-01" } }), true).competencia).toBe("2026-08-01");
  });

  it("parcela sem fatura usa a parcela irmã", () => {
    const base = { descricao: "AIRBNB", compraEm: "2026-06-30", totalParcelas: 3 };
    const linhas = [
      { ...normalizar(pluggy({ id: "1", creditCardMetadata: { billForecastDate: "2026-07", installmentNumber: 1, totalInstallments: 3, purchaseDate: "2026-06-30" } }), true), ...base },
      { ...normalizar(pluggy({ id: "3", creditCardMetadata: { billForecastDate: "0001-01", installmentNumber: 3, totalInstallments: 3, purchaseDate: "2026-06-30" } }), true), ...base },
    ];
    expect(corrigirParcelasSemFatura(linhas)).toBe(1);
    expect(linhas[1]!.competencia).toBe("2026-09-01");
  });

  it("padrão ignora números e acentos", () => {
    expect(padrao("NETFLIX.COM 0423")).toBe(padrao("Netflix.com 0523"));
    expect(padrao("Pão de Açúcar 12")).toBe("PAO DE ACUCAR");
  });

  it("transferência entre contas: PJ → PF vira renda na PF", () => {
    const r = parearTransferencias([
      { id: "s", contaId: "pj", pessoa: "PJ", tipo: "debito", valor: 500000, data: "2026-10-05", natureza: "gasto", manual: false, cartao: false },
      { id: "e", contaId: "pf", pessoa: "PF", tipo: "credito", valor: 500000, data: "2026-10-06", natureza: "renda", manual: false, cartao: false },
    ]);
    expect(r).toEqual([{ id: "s", natureza: "transferencia" }, { id: "e", natureza: "renda", categoria: "Retirada da PJ" }]);
  });

  it("assinatura: 3 meses com valor parecido; parcelado e avulso não entram", () => {
    const txs = ["08", "09", "10"].flatMap((m) => [
      tx({ descricao: `ACADEMIA FORTE ${m}`, valor: 9990, data: `2026-${m}-05` }),
      tx({ descricao: "LOJA X", valor: 5000, data: `2026-${m}-07`, parcela: 1, totalParcelas: 3 }),
    ]);
    txs.push(tx({ descricao: "NETFLIX.COM", valor: 5590, data: "2026-10-10" }));
    const s = detectarAssinaturas(txs);
    expect(s.map((x) => x.padrao).sort()).toEqual(["ACADEMIA FORTE", "NETFLIX COM"]);
  });

  it("parcelados: pagas e restantes pelo mês atual", () => {
    const p = parcelados([tx({ descricao: "TV 2/10", valor: 30000, parcela: 2, totalParcelas: 10, competencia: "2026-10-01", compraEm: "2026-08-20" })], "2026-11-01");
    expect(p[0]).toMatchObject({ total: 10, pagas: 3, restantes: 7, valorRestante: 210000, inicio: "2026-09-01", fim: "2027-06-01" });
  });

  it("resumo e análise: estorno abate gasto; categoria acima da média gera alerta", () => {
    const txs = [
      ...["07", "08", "09"].map((m) => tx({ categoria: "Delivery", valor: 20000, data: `2026-${m}-03`, competencia: `2026-${m}-01` })),
      tx({ categoria: "Delivery", valor: 60000 }),
      tx({ natureza: "estorno", tipo: "credito", valor: 5000, categoria: "Delivery" }),
      tx({ natureza: "renda", tipo: "credito", valor: 500000, cartao: false }),
    ];
    const r = resumo(txs, "2026-10-01");
    expect(r.gastos).toBe(55000);
    expect(r.renda).toBe(500000);
    const ids = analisar({ pessoa: "PF", mes: "2026-10-01", hoje: "2026-11-11", txs, assinaturas: [], cartoes: [], orcamentos: [], parcelados: [] }).map((i) => i.id);
    expect(ids).toContain("cat-Delivery");
  });

  it("natureza: liberação de venda no Mercado Pago é renda; Pix devolvido abate a renda", () => {
    expect(decidirNatureza({ category: "Investments", description: "Liberação de dinheiro Venda com Pix", type: "CREDIT" }, false)).toBe("renda");
    expect(decidirNatureza({ category: "Bookstore", description: "Pix recebido devolvido - Editora", type: "DEBIT" }, false)).toBe("renda");
    expect(decidirNatureza({ category: null, description: "PIX DEVOLVIDO   Juliana", type: "CREDIT" }, false)).toBe("estorno");
    const r = resumo([tx({ tipo: "credito", natureza: "renda", valor: 298333, cartao: false }), tx({ tipo: "debito", natureza: "renda", valor: 30000, cartao: false })], "2026-10-01");
    expect(r.renda).toBe(268333);
  });

  it("receitas: venda do site + crédito no banco contam uma vez; retirada da PJ e teste interno não contam", () => {
    const b = { cartao: false, tipo: "credito" as const, natureza: "renda" as const, competencia: "2026-11-01" };
    const txs = [
      tx({ ...b, id: "mp", pessoa: "PJ", valor: 1980, data: "2026-11-02", categoria: "SIAPLUS" }),
      tx({ ...b, id: "teste", pessoa: "PJ", valor: 95, data: "2026-09-24", competencia: "2026-09-01", categoria: "SIAPLUS" }),
      tx({ ...b, id: "sal", pessoa: "PJ", valor: 350000, data: "2026-11-06", categoria: "Salário PJ" }),
      tx({ ...b, id: "ret", pessoa: "PF", valor: 350000, data: "2026-11-09", categoria: "Retirada da PJ" }),
    ];
    const vendas = [
      { id: "1", sistema: "SIAPLUS", cliente: "Maria", plano: "Bimestral", bruto: 2000, liquido: 1980, metodo: "pix", data: "2026-11-02", interno: false },
      { id: "2", sistema: "SIAPLUS", cliente: "Ester", plano: "Bimestral", bruto: 2000, liquido: 1980, metodo: "pix", data: "2026-11-11", interno: false },
      { id: "0", sistema: "SIAPLUS", cliente: "Teste", plano: "Interno", bruto: 100, liquido: null, metodo: "pix", data: "2026-09-24", interno: true },
    ];
    const rs = receitas(txs, vendas);
    expect(rs.map((r) => r.id).sort()).toEqual(["sal", "venda:1", "venda:2"]);
    expect(rs.find((r) => r.id === "venda:1")).toMatchObject({ origem: "conciliada", valor: 1980, taxa: 20, pessoa: "PJ" });
    expect(rs.find((r) => r.id === "venda:2")).toMatchObject({ origem: "site", valor: 1980 });
    const m = resumoReceitas(rs, "2026-11-01");
    expect(m.total).toBe(350000 + 1980 * 2);
    expect(m.aLiberar).toBe(1980);
    expect(m.porFonte[0]).toEqual({ nome: "Salário PJ", valor: 350000 });
  });
});
