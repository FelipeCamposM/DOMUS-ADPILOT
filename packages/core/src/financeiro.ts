/**
 * Financeiro (Open Finance pela Pluggy): regras puras, sem banco e sem rede. O worker usa para converter o que a
 * Pluggy devolve; a web usa para os resumos, as análises automáticas, as assinaturas e os parcelados.
 * Dinheiro aqui é sempre em centavos inteiros (number): nunca soma float de reais.
 */

export type Pessoa = "PF" | "PJ";
export type Natureza = "gasto" | "renda" | "estorno" | "transferencia" | "fatura" | "investimento" | "ignorado";
export const NATUREZAS: readonly Natureza[] = ["gasto", "renda", "estorno", "transferencia", "fatura", "investimento", "ignorado"];
export const NATUREZA_ROTULO: Record<Natureza, string> = {
  gasto: "Gasto", renda: "Renda", estorno: "Estorno", transferencia: "Transferência entre contas", fatura: "Pagamento de fatura",
  investimento: "Investimento", ignorado: "Ignorado",
};

/* ── Pluggy ──────────────────────────────────────────────────────────────── */

export interface PluggyConta {
  id: string; type: "BANK" | "CREDIT"; subtype: string; name: string; marketingName: string | null; number: string | null;
  balance: number; currencyCode: string; taxNumber?: string | null;
  creditData: { brand: string | null; creditLimit: number | null; availableCreditLimit: number | null; balanceDueDate: string | null; balanceCloseDate: string | null } | null;
}
export interface PluggyTransacao {
  id: string; description: string; descriptionRaw: string | null; amount: number; date: string; category: string | null;
  status: "PENDING" | "POSTED"; type: "DEBIT" | "CREDIT"; accountId: string;
  merchant: { name?: string; businessName?: string } | null; operationType: string | null;
  creditCardMetadata: { billForecastDate?: string | null; purchaseDate?: string | null; installmentNumber?: number | null; totalInstallments?: number | null; billId?: string | null } | null;
}

/** Linha pronta para gravar em ads.fin_transacoes (sem conta/pessoa, que vêm de fora). */
export interface TxNormalizada {
  id: string; descricao: string; descricaoRaw: string | null; valor: number; tipo: "debito" | "credito"; data: string;
  competencia: string; competenciaConfiavel: boolean; categoriaPluggy: string | null; merchant: string | null;
  status: "pendente" | "confirmada"; natureza: Natureza; encargo: boolean; compraEm: string | null;
  parcela: number | null; totalParcelas: number | null; faturaId: string | null;
}

const PADRAO_FATURA = /\b(pagamento|pagto|pag)\s+(de\s+)?fatura\b/i;
const PADRAO_ENCARGO = /\b(iof|juros|multa|mora|anuidade|encargo|tarifa|taxa\s+de\s+atraso)\b/i;
const CAT_FATURA = new Set(["Credit card payment"]);
const CAT_PROPRIA = new Set(["Same person transfer", "Transfer between own accounts"]);
const ehInvestimento = (c: string | null) => !!c && /invest|fixed income|mutual fund|stocks|pension|savings/i.test(c);
/** Mercado Pago: dinheiro de venda liberado na conta (a Pluggy marca como "Investments"). */
const LIBERACAO_VENDA = /libera[cç][aã]o de dinheiro/i;
/** Pix que você mandou e voltou: devolve o gasto (estorno), não é renda. */
const PIX_VOLTOU = /\bdevolvid[oa]\b|devolu[cç][aã]o/i;
/** Pix que você recebeu e devolveu: abate a renda (natureza renda num débito = renda negativa). */
const PIX_DEVOLVIDO = /recebido\s+devolvido|devolu[cç][aã]o\s+(de\s+)?pix\s+recebido/i;

/** Gasto, renda, fatura, transferência…: o que essa linha É, antes de qualquer ajuste manual. */
export function decidirNatureza(t: Pick<PluggyTransacao, "category" | "description" | "type">, cartao: boolean): Natureza {
  if (t.category && CAT_FATURA.has(t.category)) return "fatura";
  if (PADRAO_FATURA.test(t.description)) return "fatura";
  if (t.category && CAT_PROPRIA.has(t.category)) return "transferencia";
  if (!cartao && t.type === "CREDIT" && LIBERACAO_VENDA.test(t.description)) return "renda";
  if (!cartao && t.type === "DEBIT" && PIX_DEVOLVIDO.test(t.description)) return "renda";
  if (!cartao && t.type === "CREDIT" && PIX_VOLTOU.test(t.description) && !/recebid/i.test(t.description)) return "estorno";
  if (ehInvestimento(t.category)) return "investimento";
  if (t.type === "DEBIT") return "gasto";
  // entrada no cartão que não é pagamento de fatura = estorno de compra
  return cartao ? "estorno" : "renda";
}

export const competenciaValida = (bill: string | null | undefined): bill is string => {
  if (!bill || !/^\d{4}-\d{2}$/.test(bill)) return false;
  const ano = Number(bill.slice(0, 4));
  return ano >= 2000 && ano <= 2999;
};

/** Soma meses a 'YYYY-MM-01'. */
export function somarMeses(mes: string, n: number): string {
  const d = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
export const mesDe = (data: string) => `${data.slice(0, 7)}-01`;

/** Converte uma transação da Pluggy. No cartão o mês é o da fatura (uma compra de 28/08 pode cair na de setembro). */
export function normalizar(t: PluggyTransacao, cartao: boolean): TxNormalizada {
  const cc = t.creditCardMetadata;
  const bill = cc?.billForecastDate;
  return {
    id: t.id,
    descricao: t.description.trim().slice(0, 255),
    descricaoRaw: t.descriptionRaw,
    valor: Math.round(Math.abs(t.amount) * 100), // o sinal muda entre conta e cartão: quem manda é o type
    tipo: t.type === "DEBIT" ? "debito" : "credito",
    data: t.date.slice(0, 10),
    competencia: competenciaValida(bill) ? `${bill}-01` : mesDe(t.date),
    competenciaConfiavel: competenciaValida(bill),
    categoriaPluggy: t.category,
    merchant: (t.merchant?.businessName || t.merchant?.name || null)?.slice(0, 150) ?? null,
    status: t.status === "POSTED" ? "confirmada" : "pendente",
    natureza: decidirNatureza(t, cartao),
    encargo: PADRAO_ENCARGO.test(t.description),
    compraEm: cc?.purchaseDate?.slice(0, 10) ?? null,
    parcela: cc?.installmentNumber ?? null,
    totalParcelas: cc?.totalInstallments ?? null,
    faturaId: cc?.billId ?? null,
  };
}

/**
 * Parcela cuja fatura ainda não existe vem com a fatura '0001-01'; o mês da data erra (é a data da compra).
 * A referência é uma parcela irmã da mesma compra com fatura válida: a distância entre parcelas é sempre de um mês.
 */
export function corrigirParcelasSemFatura(linhas: TxNormalizada[]): number {
  const chave = (l: TxNormalizada) => `${l.descricao}|${l.compraEm}|${l.totalParcelas}`;
  const ref = new Map<string, { competencia: string; parcela: number }>();
  for (const l of linhas) if (l.competenciaConfiavel && l.compraEm && l.parcela && !ref.has(chave(l))) ref.set(chave(l), { competencia: l.competencia, parcela: l.parcela });
  let n = 0;
  for (const l of linhas) {
    if (l.competenciaConfiavel || !l.parcela) continue;
    const r = ref.get(chave(l));
    if (!r) continue;
    l.competencia = somarMeses(r.competencia, l.parcela - r.parcela);
    l.competenciaConfiavel = true;
    n++;
  }
  return n;
}

/** "NETFLIX.COM 0423 SAO PAULO" e "Netflix.com 0523" viram o mesmo padrão: sem números, acentos e símbolos. */
export function padrao(descricao: string): string {
  return descricao
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[0-9]+/g, " ")
    .replace(/[^A-Z ]+/g, " ")
    .replace(/\b(PARC|PARCELA|COMPRA|PAG|PAGAMENTO|PIX|DEBITO|CREDITO|ELO|VISA|MASTERCARD|BR|SAO PAULO|SP|RJ)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Categoria da Pluggy (em inglês) → nossa categoria (pelo nome). null = "Outros gastos". */
const MAPA_GASTO: [RegExp, string][] = [
  [/groceries|supermarket/i, "Mercado"],
  [/food delivery|delivery/i, "Delivery"],
  [/eating out|restaurant|bars|coffee|bakery|food and drinks/i, "Restaurantes"],
  [/gas station|fuel/i, "Combustível"],
  [/taxi|ride|public transport|parking|toll|transport|vehicle|car rental|automotive/i, "Transporte"],
  [/rent|housing|mortgage|condominium/i, "Moradia"],
  [/electricity|water|utilities|internet|telecom|mobile|phone|cable|gas$/i, "Contas da casa"],
  [/pharmacy|health|hospital|dentist|clinic|optometry|laborator|medical/i, "Saúde"],
  [/gym|fitness|sport/i, "Academia e esporte"],
  [/streaming|digital service|software|apps|subscriptions/i, "Streaming e apps"],
  [/leisure|entertainment|ticket|cinema|game|music|events/i, "Lazer"],
  [/clothing|beauty|cosmetic|apparel|shoes/i, "Roupas e beleza"],
  [/electronic/i, "Eletrônicos"],
  [/education|school|universit|course|book/i, "Educação"],
  [/travel|airport|airline|accommodation|hotel|lodging|mileage/i, "Viagem"],
  [/tax/i, "Impostos"],
  [/bank fee|interest|late payment|fine|fees/i, "Tarifas e juros"],
  [/insurance/i, "Seguros"],
  [/pet/i, "Pets"],
  [/donation|gift|charity/i, "Presentes e doações"],
  [/shopping|online shopping|department|marketplace|houseware|home/i, "Compras"],
];
const MAPA_RENDA: [RegExp, string][] = [
  [/interest|investment income|proceeds|dividend|yield/i, "Rendimentos"],
  [/reimburse|refund|cashback/i, "Reembolsos"],
];
export function categoriaSugerida(t: { categoriaPluggy: string | null; descricao: string; natureza: Natureza }): string | null {
  const alvo = t.categoriaPluggy ?? "";
  if (t.natureza === "renda") {
    for (const [re, nome] of MAPA_RENDA) if (re.test(alvo)) return nome;
    return null;
  }
  if (t.natureza !== "gasto") return null;
  if (/\b(DAS|SIMPLES NACIONAL|RECEITA FED|DARF|GPS|INSS|IPVA|IPTU)\b/i.test(t.descricao)) return "Impostos";
  if (/\b(IFOOD|RAPPI|ZE DELIVERY|AIQFOME)\b/i.test(t.descricao)) return "Delivery";
  if (/\b(UBER|99APP|99 POP|99 TECNOLOGIA|CABIFY)\b/i.test(t.descricao) && !/EATS/i.test(t.descricao)) return "Transporte";
  if (/\b(NETFLIX|SPOTIFY|YOUTUBE|DISNEY|HBO|MAX|PRIME VIDEO|GLOBOPLAY|DEEZER|APPLE\.COM|ICLOUD|GOOGLE ONE|CHATGPT|OPENAI|ANTHROPIC|CLAUDE)\b/i.test(t.descricao)) return "Streaming e apps";
  for (const [re, nome] of MAPA_GASTO) if (re.test(alvo)) return nome;
  return null;
}

/** Comerciantes que quase sempre são assinatura: viram sugestão já na 1ª cobrança. */
const ASSINATURA_CONHECIDA = /\b(NETFLIX|SPOTIFY|YOUTUBE|DISNEY|HBO|MAX|PRIME|AMAZON PRIME|GLOBOPLAY|DEEZER|APPLE|ICLOUD|GOOGLE ONE|GOOGLE STORAGE|CHATGPT|OPENAI|ANTHROPIC|CLAUDE|CURSOR|GITHUB|VERCEL|NOTION|CANVA|ADOBE|MICROSOFT|OFFICE|XBOX|PLAYSTATION|PSN|STEAM|UBER ONE|IFOOD CLUBE|SMART FIT|SMARTFIT|BLUEFIT|TOTALPASS|GYMPASS|WELLHUB|DUOLINGO|AUDIBLE|KINDLE|PARAMOUNT|CRUNCHYROLL|TWITCH|DISCORD|ZOOM|DROPBOX|LINKEDIN|MIDJOURNEY|ELEVENLABS|SUNO|CAPCUT)\b/;

/* ── Transferências entre contas suas ───────────────────────────────────── */

export interface TxPar { id: string; contaId: string; pessoa: Pessoa; tipo: "debito" | "credito"; valor: number; data: string; natureza: Natureza; manual: boolean; cartao: boolean }
export interface Pareamento { id: string; natureza: Natureza; categoria?: string }

/**
 * Saída numa conta sua + entrada do mesmo valor em outra conta sua em até 1 dia = transferência, não gasto nem renda.
 * Exceção: PJ → PF é a sua retirada da empresa; na PF ela conta como renda ("Retirada da PJ"), na PJ como transferência.
 */
export function parearTransferencias(txs: TxPar[]): Pareamento[] {
  const livres = txs.filter((t) => !t.manual && !t.cartao && (t.natureza === "gasto" || t.natureza === "renda" || t.natureza === "transferencia") && !(t.natureza === "renda" && t.tipo === "debito"));
  const entradas = livres.filter((t) => t.tipo === "credito");
  const usadas = new Set<string>();
  const out: Pareamento[] = [];
  const dia = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86_400_000;
  for (const s of livres) {
    if (s.tipo !== "debito") continue;
    const e = entradas.find((x) => !usadas.has(x.id) && x.contaId !== s.contaId && x.valor === s.valor && Math.abs(dia(x.data) - dia(s.data)) <= 1);
    if (!e) continue;
    usadas.add(e.id);
    out.push({ id: s.id, natureza: "transferencia" });
    out.push(s.pessoa === "PJ" && e.pessoa === "PF" ? { id: e.id, natureza: "renda", categoria: "Retirada da PJ" } : { id: e.id, natureza: "transferencia" });
  }
  return out;
}

/* ── Receitas: bancos PF + PJ + vendas dos sites, cada real uma vez ─────── */

/** Venda paga num sistema seu (ex.: SIAPLUS). Centavos; data no fuso de São Paulo. */
export interface VendaSite { id: string; sistema: string; cliente: string; plano: string; bruto: number; liquido: number | null; metodo: string; data: string; interno: boolean }
export interface Receita {
  id: string; data: string; mes: string; valor: number; fonte: string; descricao: string; pessoa: Pessoa | null;
  /** banco = só no extrato · site = venda ainda sem o crédito no banco · conciliada = venda + crédito do banco (contada uma vez) */
  origem: "banco" | "site" | "conciliada"; bruto?: number; taxa?: number; contaId?: string;
}

const RETIRADA = "Retirada da PJ";
const JANELA_LIBERACAO = 40; // dias entre a venda e o dinheiro cair (Pix: na hora; cartão: até 30)

/**
 * Receitas sem contar duas vezes:
 * - renda dos bancos PF e PJ; "Retirada da PJ" fica de fora (é o dinheiro que já entrou na PJ passando para a PF);
 * - Pix recebido devolvido (renda num débito) abate;
 * - venda do site + crédito no banco do valor líquido (ou bruto) em até 40 dias = uma receita só, com o valor que caiu;
 * - venda sem crédito ainda = receita do site pelo líquido; venda interna/teste não conta, e o crédito dela também não.
 * ponytail: casa 1 venda com 1 crédito; venda parcelada pelo Mercado Pago (vários créditos) não casa — somar créditos se aparecer.
 */
export function receitas(txs: TxBase[], vendas: VendaSite[]): Receita[] {
  const banco = txs.filter((t) => t.natureza === "renda" && !t.cartao && t.categoria !== RETIRADA);
  const dia = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86_400_000;
  const usadas = new Set<string>();
  const out: Receita[] = [];
  for (const v of [...vendas].sort((a, b) => a.data.localeCompare(b.data))) {
    // líquido desconhecido (vendas antigas): aceita até 10% de taxa
    const casa = (x: number) => x === v.bruto || x === v.liquido || (v.liquido == null && x <= v.bruto && x >= v.bruto * 0.9);
    const t = banco
      .filter((b) => b.tipo === "credito" && !usadas.has(b.id) && casa(b.valor) && dia(b.data) - dia(v.data) >= -1 && dia(b.data) - dia(v.data) <= JANELA_LIBERACAO)
      .sort((a, b) => Number(b.categoria === v.sistema) - Number(a.categoria === v.sistema) || Math.abs(dia(a.data) - dia(v.data)) - Math.abs(dia(b.data) - dia(v.data)))[0];
    if (t) usadas.add(t.id);
    if (v.interno) continue;
    const valor = t?.valor ?? v.liquido ?? v.bruto;
    out.push({ id: `venda:${v.id}`, data: v.data, mes: mesDe(v.data), valor, fonte: v.sistema, descricao: `${v.cliente} · ${v.plano}`, pessoa: t?.pessoa ?? null,
      origem: t ? "conciliada" : "site", bruto: v.bruto, taxa: v.bruto - valor, contaId: t?.contaId });
  }
  for (const t of banco) {
    if (usadas.has(t.id)) continue;
    out.push({ id: t.id, data: t.data, mes: t.competencia, valor: valorRenda(t), fonte: t.categoria ?? "Outras rendas", descricao: t.merchant || t.descricao, pessoa: t.pessoa, origem: "banco", contaId: t.contaId });
  }
  return out.sort((a, b) => b.data.localeCompare(a.data) || b.valor - a.valor);
}

/** Receitas por dia, semana (segunda a domingo) ou mês. */
export type PeriodoRec = "dia" | "semana" | "mes";
const somaDias = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Primeiro dia do período que contém a data (AAAA-MM-DD). */
export function inicioPeriodo(p: PeriodoRec, data: string): string {
  if (p === "dia") return data.slice(0, 10);
  if (p === "mes") return mesDe(data);
  return somaDias(data, -((new Date(`${data.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7));
}
/** Início do período n passos depois (n negativo = antes). */
export const andarPeriodo = (p: PeriodoRec, inicio: string, n: number) => (p === "dia" ? somaDias(inicio, n) : p === "semana" ? somaDias(inicio, 7 * n) : somarMeses(inicio, n));
export const fimPeriodo = (p: PeriodoRec, inicio: string) => somaDias(andarPeriodo(p, inicio, 1), -1);
export const PONTOS_SERIE: Record<PeriodoRec, number> = { dia: 14, semana: 12, mes: 12 };
// no mês vale a competência (igual às telas PF/PJ); no dia e na semana, a data
const chavePeriodo = (p: PeriodoRec, r: Receita) => (p === "mes" ? r.mes : inicioPeriodo(p, r.data));

export interface ResumoReceitas {
  periodo: PeriodoRec; inicio: string; fim: string; total: number; pf: number; pj: number; site: number; aLiberar: number; vendas: number; maior: Receita | null;
  porFonte: { nome: string; valor: number }[]; serie: { inicio: string; valor: number }[]; entradas: Receita[];
}
export function resumoReceitas(rs: Receita[], p: PeriodoRec, data: string, n = PONTOS_SERIE[p]): ResumoReceitas {
  const inicio = inicioPeriodo(p, data);
  const doPeriodo = rs.filter((r) => chavePeriodo(p, r) === inicio);
  const soma = (xs: Receita[]) => xs.reduce((a, r) => a + r.valor, 0);
  const porChave = new Map<string, number>();
  for (const r of rs) { const k = chavePeriodo(p, r); porChave.set(k, (porChave.get(k) ?? 0) + r.valor); }
  const fontes = new Map<string, number>();
  for (const r of doPeriodo) fontes.set(r.fonte, (fontes.get(r.fonte) ?? 0) + r.valor);
  return {
    periodo: p, inicio, fim: fimPeriodo(p, inicio),
    total: soma(doPeriodo), pf: soma(doPeriodo.filter((r) => r.pessoa === "PF")), pj: soma(doPeriodo.filter((r) => r.pessoa !== "PF")),
    site: soma(doPeriodo.filter((r) => r.origem !== "banco")), aLiberar: soma(doPeriodo.filter((r) => r.origem === "site")), vendas: doPeriodo.filter((r) => r.origem !== "banco").length,
    maior: doPeriodo.reduce<Receita | null>((m, r) => (!m || r.valor > m.valor ? r : m), null),
    porFonte: [...fontes].map(([nome, valor]) => ({ nome, valor })).filter((f) => f.valor > 0).sort((a, b) => b.valor - a.valor),
    serie: Array.from({ length: n }, (_, i) => { const k = andarPeriodo(p, inicio, i - n + 1); return { inicio: k, valor: porChave.get(k) ?? 0 }; }),
    entradas: doPeriodo,
  };
}

/* ── Assinaturas ─────────────────────────────────────────────────────────── */

export interface TxBase {
  id: string; contaId: string; pessoa: Pessoa; descricao: string; valor: number; tipo: "debito" | "credito"; data: string; competencia: string;
  natureza: Natureza; categoria: string | null; categoriaId: number | null; merchant: string | null; encargo: boolean;
  parcela: number | null; totalParcelas: number | null; compraEm: string | null; etiquetas: string[]; assinaturaId: number | null; cartao: boolean;
}
export interface SugestaoAssinatura { padrao: string; nome: string; valorMedio: number; valorUltimo: number; dia: number; ocorrencias: number; primeira: string; ultima: string; contaId: string; pessoa: Pessoa; categoriaId: number | null }

/**
 * Mesma cobrança em 3 meses diferentes, com valor parecido (até 25%: assinatura em dólar oscila no câmbio) = assinatura.
 * Comerciante conhecido (Netflix, Spotify, ChatGPT…) basta 1. Compra parcelada nunca entra (acaba).
 */
export function detectarAssinaturas(txs: TxBase[], minimo = 3, variacao = 0.25): SugestaoAssinatura[] {
  const grupos = new Map<string, TxBase[]>();
  for (const t of txs) {
    if (t.natureza !== "gasto" || (t.totalParcelas ?? 1) > 1 || t.valor <= 0) continue;
    const p = padrao(t.descricao);
    if (p.length < 3) continue;
    (grupos.get(p) ?? grupos.set(p, []).get(p)!).push(t);
  }
  const out: SugestaoAssinatura[] = [];
  for (const [p, g] of grupos) {
    g.sort((a, b) => a.data.localeCompare(b.data));
    const meses = new Set(g.map((t) => t.data.slice(0, 7)));
    const conhecida = ASSINATURA_CONHECIDA.test(p);
    if (meses.size < (conhecida ? 1 : minimo)) continue;
    // um valor por mês (o último): compra avulsa repetida no mesmo mês não é assinatura
    const porMes = [...meses].map((m) => g.filter((t) => t.data.startsWith(m)).at(-1)!);
    if (!conhecida && porMes.length < g.length * 0.7) continue;
    const valores = porMes.map((t) => t.valor);
    const min = Math.min(...valores), max = Math.max(...valores);
    if (max > min * (1 + variacao)) continue;
    const ult = porMes.at(-1)!;
    out.push({
      padrao: p, nome: ult.merchant || ult.descricao, valorMedio: Math.round(valores.reduce((a, b) => a + b, 0) / valores.length), valorUltimo: ult.valor,
      dia: Number(ult.data.slice(8, 10)), ocorrencias: meses.size, primeira: porMes[0]!.data, ultima: ult.data, contaId: ult.contaId, pessoa: ult.pessoa, categoriaId: ult.categoriaId,
    });
  }
  return out;
}

/* ── Parcelados ──────────────────────────────────────────────────────────── */

export interface Parcelado {
  chave: string; descricao: string; contaId: string; valorParcela: number; total: number; pagas: number; restantes: number;
  valorRestante: number; valorTotal: number; inicio: string; fim: string; compraEm: string | null; categoria: string | null; etiquetas: string[];
}

/** Agrupa as parcelas da mesma compra. "Pagas" = parcelas cuja fatura já é deste mês ou anterior. */
export function parcelados(txs: TxBase[], mesAtual: string): Parcelado[] {
  const g = new Map<string, TxBase[]>();
  for (const t of txs) {
    if (!t.totalParcelas || t.totalParcelas < 2 || !t.parcela || t.natureza !== "gasto") continue;
    const k = `${padrao(t.descricao)}|${t.compraEm ?? ""}|${t.totalParcelas}|${t.contaId}`;
    (g.get(k) ?? g.set(k, []).get(k)!).push(t);
  }
  const out: Parcelado[] = [];
  for (const [chave, ps] of g) {
    ps.sort((a, b) => a.parcela! - b.parcela!);
    const ref = ps[0]!;
    const total = ref.totalParcelas!;
    const valorParcela = ps.at(-1)!.valor;
    const inicio = somarMeses(ref.competencia, 1 - ref.parcela!);
    const fim = somarMeses(inicio, total - 1);
    const pagas = Math.max(0, Math.min(total, mesesEntre(inicio, mesAtual) + 1));
    const restantes = total - pagas;
    out.push({
      chave, descricao: ref.descricao.replace(/\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/, "").trim(), contaId: ref.contaId, valorParcela, total, pagas, restantes,
      valorRestante: restantes * valorParcela, valorTotal: total * valorParcela, inicio, fim, compraEm: ref.compraEm, categoria: ref.categoria,
      etiquetas: [...new Set(ps.flatMap((p) => p.etiquetas))],
    });
  }
  return out.sort((a, b) => b.valorRestante - a.valorRestante);
}
export const mesesEntre = (de: string, ate: string) => (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + Number(ate.slice(5, 7)) - Number(de.slice(5, 7));

/** Quanto das próximas faturas já está comprometido com parcelas (mês → centavos). */
export function comprometidoFuturo(ps: Parcelado[], mesAtual: string, meses = 12): { mes: string; valor: number }[] {
  return Array.from({ length: meses }, (_, i) => {
    const mes = somarMeses(mesAtual, i + 1);
    return { mes, valor: ps.filter((p) => p.inicio <= mes && p.fim >= mes).reduce((a, p) => a + p.valorParcela, 0) };
  });
}

/* ── Resumo do mês ───────────────────────────────────────────────────────── */

export interface Resumo {
  mes: string; renda: number; gastos: number; estornos: number; saldo: number; poupanca: number | null; encargos: number;
  porCategoria: { nome: string; valor: number }[]; porEtiqueta: { nome: string; valor: number }[]; porConta: { contaId: string; valor: number }[];
  porDia: number[]; rendaPorCategoria: { nome: string; valor: number }[]; topComerciantes: { nome: string; valor: number; vezes: number }[];
  maior: TxBase | null; transacoes: number;
}

/** Renda num débito (Pix recebido devolvido) entra negativa. */
const valorRenda = (t: Pick<TxBase, "natureza" | "tipo" | "valor">) => (t.natureza === "renda" && t.tipo === "debito" ? -t.valor : t.valor);

const somaPor = <K extends string>(txs: TxBase[], chave: (t: TxBase) => K | K[] | null) => {
  const m = new Map<K, number>();
  for (const t of txs) {
    const k = chave(t);
    for (const x of Array.isArray(k) ? k : k == null ? [] : [k]) m.set(x, (m.get(x) ?? 0) + (t.natureza === "estorno" ? -t.valor : valorRenda(t)));
  }
  return [...m].map(([nome, valor]) => ({ nome, valor })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor);
};
const diasNoMes = (mes: string) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();

export function resumo(txs: TxBase[], mes: string): Resumo {
  const doMes = txs.filter((t) => t.competencia === mes);
  const gastosTx = doMes.filter((t) => t.natureza === "gasto" || t.natureza === "estorno");
  const g = doMes.filter((t) => t.natureza === "gasto").reduce((a, t) => a + t.valor, 0);
  const estornos = doMes.filter((t) => t.natureza === "estorno").reduce((a, t) => a + t.valor, 0);
  const renda = doMes.filter((t) => t.natureza === "renda").reduce((a, t) => a + valorRenda(t), 0);
  const gastos = g - estornos;
  const porDia = Array.from({ length: diasNoMes(mes) }, () => 0);
  for (const t of doMes) if (t.natureza === "gasto") { const d = Number(t.data.slice(8, 10)); if (t.data.startsWith(mes.slice(0, 7))) porDia[d - 1]! += t.valor; }
  const comerciantes = new Map<string, { valor: number; vezes: number }>();
  for (const t of doMes) {
    if (t.natureza !== "gasto") continue;
    const k = t.merchant || padrao(t.descricao) || t.descricao;
    const c = comerciantes.get(k) ?? { valor: 0, vezes: 0 };
    c.valor += t.valor; c.vezes++;
    comerciantes.set(k, c);
  }
  const soGastos = doMes.filter((t) => t.natureza === "gasto");
  return {
    mes, renda, gastos, estornos, saldo: renda - gastos, poupanca: renda > 0 ? (renda - gastos) / renda : null,
    encargos: doMes.filter((t) => t.encargo && t.natureza === "gasto").reduce((a, t) => a + t.valor, 0),
    porCategoria: somaPor(gastosTx, (t) => t.categoria ?? "Sem categoria"),
    porEtiqueta: somaPor(gastosTx, (t) => t.etiquetas),
    porConta: somaPor(gastosTx, (t) => t.contaId).map((x) => ({ contaId: x.nome, valor: x.valor })),
    porDia,
    rendaPorCategoria: somaPor(doMes.filter((t) => t.natureza === "renda"), (t) => t.categoria ?? "Outras rendas"),
    topComerciantes: [...comerciantes].map(([nome, c]) => ({ nome, ...c })).sort((a, b) => b.valor - a.valor).slice(0, 8),
    maior: soGastos.reduce<TxBase | null>((m, t) => (!m || t.valor > m.valor ? t : m), null),
    transacoes: doMes.length,
  };
}

/** Série dos últimos `n` meses até `mes` (inclusive): renda, gastos e saldo por mês. */
export function serie(txs: TxBase[], mes: string, n = 12) {
  return Array.from({ length: n }, (_, i) => {
    const r = resumo(txs, somarMeses(mes, i - n + 1));
    return { mes: r.mes, renda: r.renda, gastos: r.gastos, saldo: r.saldo };
  });
}

/* ── Análises automáticas ────────────────────────────────────────────────── */

export type Nivel = "alerta" | "atencao" | "info" | "bom";
export interface Insight { id: string; nivel: Nivel; titulo: string; texto: string; valor?: number }
export interface ContextoAnalise {
  pessoa: Pessoa; mes: string; hoje: string; txs: TxBase[];
  assinaturas: { nome: string; valorMedio: number; valorUltimo: number; status: string }[];
  cartoes: { nome: string; limite: number | null; usado: number | null }[];
  orcamentos: { nome: string; orcamento: number }[];
  parcelados: Parcelado[];
}

export const brl = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pctTxt = (x: number) => `${Math.round(x * 100)}%`;
const NOME_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeMes = (mes: string) => NOME_MES[Number(mes.slice(5, 7)) - 1]!;

/** Lista de achados, do mais grave ao melhor. Tudo calculado por código: rápido, sem IA, roda a cada visita. */
export function analisar(c: ContextoAnalise): Insight[] {
  const out: Insight[] = [];
  const atual = resumo(c.txs, c.mes);
  const anteriores = [1, 2, 3].map((i) => resumo(c.txs, somarMeses(c.mes, -i))).filter((r) => r.transacoes > 0);
  const mediaGastos = anteriores.length ? anteriores.reduce((a, r) => a + r.gastos, 0) / anteriores.length : null;
  const mesCorrente = c.hoje.slice(0, 7) === c.mes.slice(0, 7);
  const pj = c.pessoa === "PJ";

  // projeção do mês em curso
  if (mesCorrente && mediaGastos && !pj) {
    const dia = Number(c.hoje.slice(8, 10));
    const total = diasNoMes(c.mes);
    if (dia >= 5) {
      const projecao = Math.round((atual.gastos / dia) * total);
      if (projecao > mediaGastos * 1.15) out.push({ id: "projecao", nivel: "alerta", titulo: "Ritmo acima do normal", texto: `No ritmo atual, o mês fecha em ${brl(projecao)} de gastos, ${pctTxt(projecao / mediaGastos - 1)} acima da sua média dos últimos meses (${brl(Math.round(mediaGastos))}).`, valor: projecao });
      else if (projecao < mediaGastos * 0.9) out.push({ id: "projecao", nivel: "bom", titulo: "Mês mais econômico", texto: `No ritmo atual, o mês fecha em ${brl(projecao)}, abaixo da sua média (${brl(Math.round(mediaGastos))}).`, valor: projecao });
    }
  }

  // poupança / margem
  if (atual.renda > 0) {
    const p = atual.poupanca!;
    if (p < 0) out.push({ id: "poupanca", nivel: "alerta", titulo: pj ? "A empresa saiu mais do que entrou" : "Gastou mais do que ganhou", texto: `${pj ? "Saídas" : "Gastos"} de ${brl(atual.gastos)} contra ${brl(atual.renda)} de ${pj ? "receita" : "renda"}: faltaram ${brl(-atual.saldo)}.`, valor: atual.saldo });
    else if (p < 0.1 && !pj) out.push({ id: "poupanca", nivel: "atencao", titulo: "Sobrou pouco", texto: `Você guardou ${pctTxt(p)} da renda (${brl(atual.saldo)}). O ideal é pelo menos 20%.`, valor: atual.saldo });
    else if (p >= 0.3) out.push({ id: "poupanca", nivel: "bom", titulo: pj ? "Margem saudável" : "Ótima taxa de poupança", texto: `${pj ? "Sobraram" : "Você guardou"} ${pctTxt(p)} ${pj ? "da receita" : "da renda"}: ${brl(atual.saldo)}.`, valor: atual.saldo });
  }

  // categorias acima da média
  for (const cat of atual.porCategoria) {
    const hist = anteriores.map((r) => r.porCategoria.find((x) => x.nome === cat.nome)?.valor ?? 0);
    if (hist.length < 2) continue;
    const media = hist.reduce((a, b) => a + b, 0) / hist.length;
    if (cat.valor > media * 1.3 && cat.valor - media > 8000) {
      out.push({ id: `cat-${cat.nome}`, nivel: cat.valor > media * 1.8 ? "alerta" : "atencao", titulo: `${cat.nome} disparou`, texto: `${brl(cat.valor)} este mês contra ${brl(Math.round(media))} de média: ${brl(Math.round(cat.valor - media))} a mais.`, valor: cat.valor });
    }
  }

  // orçamentos
  for (const o of c.orcamentos) {
    const gasto = atual.porCategoria.find((x) => x.nome === o.nome)?.valor ?? 0;
    if (gasto > o.orcamento) out.push({ id: `orc-${o.nome}`, nivel: "alerta", titulo: `Orçamento de ${o.nome} estourado`, texto: `${brl(gasto)} de ${brl(o.orcamento)} (${pctTxt(gasto / o.orcamento)}).`, valor: gasto });
    else if (gasto > o.orcamento * 0.8) out.push({ id: `orc-${o.nome}`, nivel: "atencao", titulo: `${o.nome} perto do limite`, texto: `Já foram ${pctTxt(gasto / o.orcamento)} do orçamento: restam ${brl(o.orcamento - gasto)}.`, valor: gasto });
  }

  // juros, IOF, multa
  if (atual.encargos > 0) out.push({ id: "encargos", nivel: "alerta", titulo: "Dinheiro jogado fora em encargos", texto: `${brl(atual.encargos)} em juros, IOF, multas e tarifas este mês.`, valor: atual.encargos });

  // cobrança duplicada
  const gastosMes = c.txs.filter((t) => t.competencia === c.mes && t.natureza === "gasto" && (t.totalParcelas ?? 1) <= 1);
  const vistos = new Map<string, TxBase>();
  for (const t of [...gastosMes].sort((a, b) => a.data.localeCompare(b.data))) {
    const k = `${padrao(t.descricao)}|${t.valor}`;
    const ant = vistos.get(k);
    if (ant && Math.abs(Date.parse(t.data) - Date.parse(ant.data)) <= 3 * 86_400_000 && t.valor >= 1000) {
      out.push({ id: `dup-${t.id}`, nivel: "atencao", titulo: "Possível cobrança em dobro", texto: `${t.descricao}: ${brl(t.valor)} cobrado duas vezes (${ant.data.slice(8, 10)}/${ant.data.slice(5, 7)} e ${t.data.slice(8, 10)}/${t.data.slice(5, 7)}).`, valor: t.valor });
    }
    vistos.set(k, t);
  }

  // cartões
  for (const k of c.cartoes) {
    if (!k.limite || k.usado == null) continue;
    const uso = k.usado / k.limite;
    if (uso >= 0.8) out.push({ id: `cartao-${k.nome}`, nivel: uso >= 0.95 ? "alerta" : "atencao", titulo: `Limite do ${k.nome} quase no fim`, texto: `${pctTxt(uso)} do limite usado (${brl(k.usado)} de ${brl(k.limite)}).`, valor: k.usado });
  }

  // assinaturas
  const ativas = c.assinaturas.filter((a) => a.status !== "ignorada");
  if (ativas.length) {
    const mensal = ativas.reduce((a, s) => a + s.valorUltimo, 0);
    out.push({ id: "assinaturas", nivel: atual.renda && mensal > atual.renda * 0.1 ? "atencao" : "info", titulo: `${ativas.length} assinatura${ativas.length > 1 ? "s" : ""}: ${brl(mensal)}/mês`, texto: `${brl(mensal * 12)} por ano${atual.renda ? `, ${pctTxt(mensal / atual.renda)} da ${pj ? "receita" : "renda"}` : ""}.`, valor: mensal });
    for (const s of ativas) if (s.valorUltimo > s.valorMedio * 1.08 && s.valorUltimo - s.valorMedio > 300) {
      out.push({ id: `aumento-${s.nome}`, nivel: "atencao", titulo: `${s.nome} ficou mais cara`, texto: `Última cobrança ${brl(s.valorUltimo)} contra ${brl(s.valorMedio)} de média.`, valor: s.valorUltimo });
    }
    const novas = c.assinaturas.filter((a) => a.status === "sugerida").length;
    if (novas) out.push({ id: "assinaturas-novas", nivel: "info", titulo: `${novas} cobrança${novas > 1 ? "s" : ""} com cara de assinatura`, texto: "Confirme ou ignore na aba Assinaturas para o total ficar certo." });
  }

  // parcelas
  const proximo = comprometidoFuturo(c.parcelados, c.mes, 1)[0];
  if (proximo && proximo.valor > 0) {
    const acabando = c.parcelados.filter((p) => p.restantes === 1);
    out.push({ id: "parcelas", nivel: "info", titulo: `${brl(proximo.valor)} já comprometidos em ${nomeMes(proximo.mes)}`, texto: `Em parcelas de ${c.parcelados.filter((p) => p.restantes > 0).length} compras.${acabando.length ? ` ${acabando.length} acaba${acabando.length > 1 ? "m" : ""} na próxima fatura e libera${acabando.length > 1 ? "m" : ""} ${brl(acabando.reduce((a, p) => a + p.valorParcela, 0))}.` : ""}`, valor: proximo.valor });
  }

  if (!pj) {
    // comida fora de casa
    const fora = atual.porCategoria.filter((x) => x.nome === "Delivery" || x.nome === "Restaurantes").reduce((a, x) => a + x.valor, 0);
    if (atual.gastos > 0 && fora > atual.gastos * 0.25) out.push({ id: "comida", nivel: "atencao", titulo: "Comer fora pesa no mês", texto: `${brl(fora)} em delivery e restaurantes: ${pctTxt(fora / atual.gastos)} de tudo que você gastou.`, valor: fora });
    // comerciante campeão
    const top = atual.topComerciantes[0];
    if (top && top.vezes >= 5) out.push({ id: "campeao", nivel: "info", titulo: `${top.nome}: ${top.vezes} vezes no mês`, texto: `${brl(top.valor)} no total, média de ${brl(Math.round(top.valor / top.vezes))} por compra.`, valor: top.valor });
    // etiquetas (ex.: Juju)
    for (const e of atual.porEtiqueta) {
      const ant = anteriores[0]?.porEtiqueta.find((x) => x.nome === e.nome)?.valor ?? 0;
      out.push({ id: `etq-${e.nome}`, nivel: "info", titulo: `${e.nome}: ${brl(e.valor)} no mês`, texto: ant ? `${e.valor > ant ? "Mais" : "Menos"} que no mês passado (${brl(ant)}).` : `${pctTxt(atual.gastos ? e.valor / atual.gastos : 0)} dos seus gastos.`, valor: e.valor });
    }
    // fim de semana
    const fds = gastosMes.filter((t) => [0, 6].includes(new Date(`${t.data}T12:00:00Z`).getUTCDay())).reduce((a, t) => a + t.valor, 0);
    if (atual.gastos > 0 && fds > atual.gastos * 0.45) out.push({ id: "fds", nivel: "info", titulo: "O fim de semana manda", texto: `${pctTxt(fds / atual.gastos)} dos gastos caíram em sábados e domingos.`, valor: fds });
  } else {
    // PJ: impostos, concentração de receita, retiradas
    const impostos = atual.porCategoria.find((x) => x.nome === "Impostos")?.valor ?? 0;
    if (atual.renda > 0 && impostos > 0) out.push({ id: "impostos", nivel: "info", titulo: `Impostos: ${pctTxt(impostos / atual.renda)} da receita`, texto: `${brl(impostos)} pagos este mês sobre ${brl(atual.renda)} de receita.`, valor: impostos });
    const fonte = atual.rendaPorCategoria[0];
    if (fonte && atual.renda > 0 && fonte.valor / atual.renda >= 0.8 && atual.rendaPorCategoria.length >= 1) out.push({ id: "concentracao", nivel: "atencao", titulo: "Receita concentrada", texto: `${pctTxt(fonte.valor / atual.renda)} da receita veio de ${fonte.nome}. Se essa fonte parar, a empresa para junto.`, valor: fonte.valor });
    const retiradas = c.txs.filter((t) => t.competencia === c.mes && t.natureza === "transferencia" && t.tipo === "debito").reduce((a, t) => a + t.valor, 0);
    if (retiradas > 0) out.push({ id: "retiradas", nivel: "info", titulo: `${brl(retiradas)} transferidos para fora da PJ`, texto: "Retiradas e transferências para as suas contas no mês (não contam como gasto da empresa).", valor: retiradas });
    if (mediaGastos && atual.renda > 0) {
      const mediaRenda = anteriores.reduce((a, r) => a + r.renda, 0) / anteriores.length;
      if (mediaRenda > 0 && atual.renda < mediaRenda * 0.8 && !mesCorrente) out.push({ id: "receita", nivel: "atencao", titulo: "Receita abaixo da média", texto: `${brl(atual.renda)} contra ${brl(Math.round(mediaRenda))} de média.`, valor: atual.renda });
    }
  }

  // sem categoria
  const sem = c.txs.filter((t) => t.competencia === c.mes && t.natureza === "gasto" && !t.categoria).length;
  if (sem >= 3) out.push({ id: "sem-categoria", nivel: "info", titulo: `${sem} gastos sem categoria`, texto: "Classifique na aba Gastos: com “aplicar a parecidas” os próximos já chegam certos." });

  const ordem: Record<Nivel, number> = { alerta: 0, atencao: 1, info: 2, bom: 3 };
  return out.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}

/** Texto compacto para a IA (sem nomes de banco nem números de conta): o que ela precisa para analisar o mês. */
export function dadosParaIA(c: ContextoAnalise, insights: Insight[]): string {
  const r = resumo(c.txs, c.mes);
  const s = serie(c.txs, c.mes, 6);
  const linhas = [
    `Perfil: ${c.pessoa === "PF" ? "pessoa física" : "pessoa jurídica (empresa do usuário)"}. Mês analisado: ${nomeMes(c.mes)} de ${c.mes.slice(0, 4)}. Hoje: ${c.hoje}.`,
    `${c.pessoa === "PJ" ? "Receita" : "Renda"}: ${brl(r.renda)} · Gastos: ${brl(r.gastos)} · Saldo: ${brl(r.saldo)} · Encargos: ${brl(r.encargos)}`,
    `Últimos 6 meses (renda / gastos): ${s.map((x) => `${nomeMes(x.mes).slice(0, 3)} ${brl(x.renda)} / ${brl(x.gastos)}`).join("; ")}`,
    `Gastos por categoria: ${r.porCategoria.map((x) => `${x.nome} ${brl(x.valor)}`).join("; ") || "nenhum"}`,
    `Renda por fonte: ${r.rendaPorCategoria.map((x) => `${x.nome} ${brl(x.valor)}`).join("; ") || "nenhuma"}`,
    `Etiquetas: ${r.porEtiqueta.map((x) => `${x.nome} ${brl(x.valor)}`).join("; ") || "nenhuma"}`,
    `Maiores comerciantes: ${r.topComerciantes.map((x) => `${x.nome} ${brl(x.valor)} (${x.vezes}x)`).join("; ")}`,
    `Assinaturas: ${c.assinaturas.filter((a) => a.status !== "ignorada").map((a) => `${a.nome} ${brl(a.valorUltimo)}`).join("; ") || "nenhuma"}`,
    `Parcelados em aberto: ${c.parcelados.filter((p) => p.restantes > 0).map((p) => `${p.descricao} ${brl(p.valorParcela)} x ${p.restantes} restantes`).join("; ") || "nenhum"}`,
    `Cartões: ${c.cartoes.map((k) => `${k.nome} ${k.usado != null ? brl(k.usado) : "?"} de ${k.limite != null ? brl(k.limite) : "?"}`).join("; ") || "nenhum"}`,
    `Achados automáticos: ${insights.map((i) => `[${i.nivel}] ${i.titulo}: ${i.texto}`).join(" | ") || "nenhum"}`,
    `Gastos do mês (até 150, maiores primeiro): ${c.txs.filter((t) => t.competencia === c.mes && t.natureza === "gasto").sort((a, b) => b.valor - a.valor).slice(0, 150).map((t) => `${t.data.slice(8, 10)}/${t.data.slice(5, 7)} ${t.descricao} ${brl(t.valor)}${t.categoria ? ` [${t.categoria}]` : ""}${t.etiquetas.length ? ` #${t.etiquetas.join(" #")}` : ""}${t.totalParcelas && t.totalParcelas > 1 ? ` (${t.parcela}/${t.totalParcelas})` : ""}`).join("; ")}`,
  ];
  return linhas.join("\n");
}

export const FIN_SISTEMA = `Você é um planejador financeiro pessoal brasileiro, direto e prático, analisando os dados reais de Open Finance do usuário.
Regras: responda em português do Brasil, em Markdown curto (títulos ###, listas, negrito nos números). Use só os números fornecidos; nunca invente.
Seja específico: cite comerciantes, categorias e valores. Priorize ações concretas com economia estimada em R$/mês.
Estrutura: ### Resumo em 3 linhas · ### O que chamou atenção · ### Onde cortar (com R$ estimado) · ### Próximo mês (plano em 3 passos).
Se o usuário fez uma pergunta, responda a pergunta primeiro, usando os dados.`;
