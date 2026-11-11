import { describe, expect, it } from "vitest";
import { analisar, corrigirParcelasSemFatura, decidirNatureza, detectarAssinaturas, normalizar, padrao, parcelados, parearTransferencias, resumo, type PluggyTransacao, type TxBase } from "./financeiro";

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
});
