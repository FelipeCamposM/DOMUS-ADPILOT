import { describe, expect, it } from "vitest";
import { completeLead, exportarMarkdown, lerMarkdown, parseInsight, whatsappNumber, type LeadCampaign } from "./prospeccao";

const campanha: LeadCampaign = {
  id: "c1", name: "dentistas — Setor Bueno", niches: ["dentistas"], locationLabel: "Setor Bueno, Goiânia - GO", centerLat: -16.7, centerLng: -49.27,
  radiusKm: 3, maxLeads: 60, pace: "balanced", auditWebsites: true, opportunityFocus: "no_site_first", status: "completed",
  foundCount: 1, auditedCount: 1, blocked: false, error: null, progress: 100, step: "", toAudit: 0, createdAt: 1, updatedAt: 2,
};

describe("prospecção", () => {
  it("null do Python vira undefined (não derruba a tela)", () => {
    const l = completeLead({ name: "Acme", rating: null, reviewCount: null, latitude: null, longitude: null }, "c1");
    expect(l.rating).toBeUndefined();
    expect(l.latitude).toBeUndefined();
    expect(l.websiteStatus).toBe("unknown");
  });

  it(".md exporta e importa de volta, com a tabela escapada", () => {
    const lead = completeLead({ id: "x1", name: "Clínica | Sorriso", phone: "(62) 99999-0000", websiteStatus: "no_site", score: 72,
      aiInsight: { resumo: "r", dores: ["d"], oferta: "o", whatsapp: "w", emailAssunto: "a", emailCorpo: "c", generatedAt: 5 } }, "c1");
    const md = exportarMarkdown(campanha, [lead]);
    expect(md).toContain("| 72 | Clínica \\| Sorriso | no_site |");
    const lido = lerMarkdown(md);
    expect(lido.campaign.id).toBe("c1");
    expect(lido.leads[0]).toMatchObject({ id: "x1", name: "Clínica | Sorriso", score: 72, aiInsight: { resumo: "r" } });
    expect(() => lerMarkdown("# qualquer")).toThrow(/não foi gerado/);
  });

  it("lê a resposta da IA mesmo cercada de texto", () => {
    expect(parseInsight('ok:\n```json\n{"resumo":"a","whatsapp":"b","dores":["1","2","3","4"]}\n```')).toMatchObject({ resumo: "a", whatsapp: "b", dores: ["1", "2", "3"] });
    expect(parseInsight("sem json")).toBeNull();
  });

  it("número do wa.me ganha 55", () => {
    expect(whatsappNumber({ whatsapp: "", phone: "(62) 3333-4444" })).toBe("556233334444");
    expect(whatsappNumber({ whatsapp: "", phone: "123" })).toBeUndefined();
  });
});
