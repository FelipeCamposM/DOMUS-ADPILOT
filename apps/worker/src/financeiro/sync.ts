import { db } from "@domus-ads/core";
import { aplicarRegras, categorias, transacoes as txsDaPessoa } from "@domus-ads/core/financeiro-db";
import { categoriaSugerida, corrigirParcelasSemFatura, detectarAssinaturas, normalizar, padrao, parearTransferencias, somarMeses, type Pessoa, type TxPar } from "@domus-ads/core/financeiro";
import * as pluggy from "./pluggy";

const reais = (c: number | null) => (c == null ? null : (c / 100).toFixed(2));
const dia = (iso: string | null | undefined) => (iso ? Number(iso.slice(8, 10)) || null : null);
const hojeISO = () => new Date().toISOString().slice(0, 10);

const MEU_PLUGGY = /meu\s*pluggy/i;
const CORES: [RegExp, string][] = [[/inter/i, "#ff7a00"], [/santander/i, "#ec0000"], [/mercado\s*pago/i, "#00b1ea"], [/nubank|nu pagamentos/i, "#820ad1"],
  [/ita[uú]/i, "#ec7000"], [/bradesco/i, "#cc092f"], [/caixa/i, "#0070af"], [/brasil/i, "#f8d117"], [/picpay/i, "#21c25e"]];

/** Conexão pelo MeuPluggy (Open Finance): o conector é sempre "MeuPluggy"; o banco de verdade está no nome da conta. */
function bancoDe(conector: string, contas: { type: string; name: string }[]) {
  if (!MEU_PLUGGY.test(conector)) return conector;
  const c = contas.find((x) => x.type === "BANK") ?? contas[0];
  const nome = (c?.name ?? "").replace(/\(.*?\)/g, "").replace(/^\s*banco\s+/i, "").trim().toLowerCase().replace(/(^|\s)\p{L}/gu, (l) => l.toUpperCase());
  return nome || conector;
}
/** CNPJ (14 dígitos) no titular de alguma conta = pessoa jurídica. */
const ehPJ = (contas: { taxNumber?: string | null }[]) => contas.some((c) => String(c.taxNumber ?? "").replace(/\D/g, "").length === 14);

/**
 * Financeiro → Sincronizar (e a cada 6h): lê cada conexão da Pluggy, grava contas e transações, pareia transferências
 * entre contas suas, aplica as regras e detecta assinaturas. O que foi classificado à mão nunca é sobrescrito.
 */
export async function runFinSync(p: { itemId?: string }, o: { signal: AbortSignal; log: (m: string) => Promise<void> }) {
  const sql = db();
  const itens = await sql<{ item_id: string; pessoa: Pessoa; banco: string | null; ultima_sync: Date | null }[]>`
    select item_id, pessoa, banco, ultima_sync from ads.fin_conexoes where ${p.itemId ?? null}::uuid is null or item_id = ${p.itemId ?? null}::uuid`;
  const cats = await categorias(sql);
  const catId = (nome: string | null) => (nome ? cats.find((c) => c.nome === nome)?.id ?? null : null);
  const novas: string[] = [];
  let erros = 0;

  for (const k of itens) {
    if (o.signal.aborted) break;
    try {
      const it = await pluggy.item(k.item_id);
      const lista = await pluggy.contas(k.item_id);
      const meuPluggy = MEU_PLUGGY.test(it.connector.name);
      const nome = bancoDe(it.connector.name, lista);
      // 1ª vez (ou ainda com o nome genérico "MeuPluggy"): CNPJ no titular ou "Empresas" no nome = PJ. Depois vale o que você escolher.
      const primeira = k.banco == null || MEU_PLUGGY.test(k.banco);
      const pessoa: Pessoa = primeira ? (ehPJ(lista) || /empresa|\bpj\b|business/i.test(it.connector.name) ? "PJ" : "PF") : k.pessoa;
      const banco = !primeira ? k.banco! : pessoa === "PJ" && meuPluggy ? `${nome} PJ` : nome;
      const cor = meuPluggy ? CORES.find(([re]) => re.test(nome))?.[1] ?? null : it.connector.primaryColor ? `#${it.connector.primaryColor.replace("#", "")}` : null;
      await sql`update ads.fin_conexoes set banco = ${banco}, banco_logo = ${meuPluggy ? null : it.connector.imageUrl ?? null}, banco_cor = ${cor},
        pessoa = ${pessoa}, status = ${it.status}, erro = ${it.error?.message ?? null}, atualizado_no_banco = ${it.lastUpdatedAt ?? it.updatedAt ?? null} where item_id = ${k.item_id}`;
      // receita guessada: Inter PJ = Salário PJ, Mercado Pago PJ = SIAPLUS
      const renda = pessoa === "PJ" ? (/inter/i.test(nome) ? "Salário PJ" : /mercado\s*pago/i.test(nome) ? "SIAPLUS" : null) : null;
      if (primeira) {
        // contas já gravadas com o palpite errado: acerta pessoa, categoria das entradas e o histórico
        await sql`update ads.fin_contas set pessoa = ${pessoa}, categoria_renda_id = coalesce(categoria_renda_id, case when tipo = 'BANK' then ${catId(renda)}::int end) where item_id = ${k.item_id}`;
        await sql`update ads.fin_transacoes t set pessoa = c.pessoa,
            categoria_id = case when t.natureza = 'renda' and not t.categoria_manual and c.categoria_renda_id is not null then c.categoria_renda_id else t.categoria_id end
          from ads.fin_contas c where c.id = t.conta_id and c.item_id = ${k.item_id}`;
        await sql`update ads.fin_assinaturas a set pessoa = ${pessoa} from ads.fin_contas c where c.id = a.conta_id and c.item_id = ${k.item_id}`;
      }
      await o.log(`${banco} (${pessoa}): ${it.status}`);

      for (const c of lista) {
        const cd = c.creditData;
        const usado = cd?.creditLimit != null && cd.availableCreditLimit != null ? Math.round((cd.creditLimit - cd.availableCreditLimit) * 100) : null;
        const [conta] = await sql<{ pessoa: Pessoa; categoria_renda_id: number | null }[]>`
          insert into ads.fin_contas (id, item_id, tipo, subtipo, nome, numero, pessoa, saldo, moeda, limite, limite_usado, dia_fechamento, dia_vencimento, bandeira, categoria_renda_id)
          values (${c.id}, ${k.item_id}, ${c.type}, ${c.subtype}, ${c.marketingName || c.name}, ${c.number}, ${pessoa}, ${c.balance}, ${c.currencyCode || "BRL"},
                  ${cd?.creditLimit ?? null}, ${reais(usado)}, ${dia(cd?.balanceCloseDate)}, ${dia(cd?.balanceDueDate)}, ${cd?.brand ?? null}, ${c.type === "BANK" ? catId(renda) : null})
          on conflict (id) do update set tipo = excluded.tipo, subtipo = excluded.subtipo, nome = excluded.nome, numero = excluded.numero, saldo = excluded.saldo,
            limite = excluded.limite, limite_usado = excluded.limite_usado, dia_fechamento = coalesce(excluded.dia_fechamento, ads.fin_contas.dia_fechamento),
            dia_vencimento = coalesce(excluded.dia_vencimento, ads.fin_contas.dia_vencimento), bandeira = excluded.bandeira, updated_at = now()
          returning pessoa, categoria_renda_id`;
        const cartao = c.type === "CREDIT";
        // incremental com 7 dias de folga (lançamentos pendentes viram confirmados); 1ª vez puxa o histórico todo
        const desde = k.ultima_sync ? new Date(k.ultima_sync.getTime() - 7 * 86400_000).toISOString().slice(0, 10) : undefined;
        const brutas = await pluggy.transacoes(c.id, desde);
        const linhas = brutas.map((t) => normalizar(t, cartao));
        corrigirParcelasSemFatura(linhas);
        for (const t of linhas) {
          const categoria = t.natureza === "renda" && conta!.categoria_renda_id ? conta!.categoria_renda_id : catId(categoriaSugerida(t));
          await sql`
            insert into ads.fin_transacoes (id, conta_id, pessoa, descricao, descricao_raw, padrao, valor, tipo, data, competencia, categoria_pluggy, categoria_id, merchant,
              status, natureza, encargo, compra_em, parcela, total_parcelas, fatura_id)
            values (${t.id}, ${c.id}, ${conta!.pessoa}, ${t.descricao}, ${t.descricaoRaw}, ${padrao(t.descricao)}, ${reais(t.valor)}, ${t.tipo}, ${t.data}, ${t.competencia},
              ${t.categoriaPluggy}, ${categoria}, ${t.merchant}, ${t.status}, ${t.natureza}, ${t.encargo}, ${t.compraEm}, ${t.parcela}, ${t.totalParcelas}, ${t.faturaId})
            on conflict (id) do update set descricao = excluded.descricao, descricao_raw = excluded.descricao_raw, padrao = excluded.padrao, valor = excluded.valor,
              tipo = excluded.tipo, data = excluded.data, competencia = excluded.competencia, categoria_pluggy = excluded.categoria_pluggy, merchant = excluded.merchant,
              status = excluded.status, encargo = excluded.encargo, compra_em = excluded.compra_em, parcela = excluded.parcela, total_parcelas = excluded.total_parcelas,
              fatura_id = excluded.fatura_id,
              categoria_id = case when ads.fin_transacoes.categoria_manual then ads.fin_transacoes.categoria_id else excluded.categoria_id end,
              natureza = case when ads.fin_transacoes.natureza_manual then ads.fin_transacoes.natureza else excluded.natureza end,
              updated_at = now()`;
          novas.push(t.id);
        }
        await o.log(`${banco} · ${c.marketingName || c.name}: ${linhas.length} transações`);
      }
      await sql`update ads.fin_conexoes set ultima_sync = now(), erro = ${it.error?.message ?? null} where item_id = ${k.item_id}`;
    } catch (e) {
      if (o.signal.aborted) break;
      erros++;
      await sql`update ads.fin_conexoes set erro = ${(e as Error).message.slice(0, 500)} where item_id = ${k.item_id}`;
      await o.log(`erro em ${k.item_id}: ${(e as Error).message}`);
    }
  }

  const pares = await parear(sql, catId);
  const regras = await aplicarRegras(sql, novas);
  const assin = await assinaturas(sql);
  return { conexoes: itens.length, transacoes: novas.length, transferencias: pares, regras, assinaturas: assin, erros };
}

/** Transferências entre contas suas (13 meses): PJ → PF vira "Retirada da PJ" na PF; o resto vira transferência dos dois lados. */
async function parear(sql: ReturnType<typeof db>, catId: (n: string | null) => number | null) {
  const desde = new Date(Date.now() - 400 * 86400_000).toISOString().slice(0, 10);
  const rs = await sql<{ id: string; conta_id: string; pessoa: Pessoa; tipo: "debito" | "credito"; valor: string; data: string; natureza: TxPar["natureza"]; natureza_manual: boolean; cartao: boolean }[]>`
    select t.id, t.conta_id, t.pessoa, t.tipo, t.valor, t.data::text, t.natureza, t.natureza_manual, c.tipo = 'CREDIT' as cartao
    from ads.fin_transacoes t join ads.fin_contas c on c.id = t.conta_id where t.data >= ${desde}::date`;
  const res = parearTransferencias(rs.map((t) => ({ id: t.id, contaId: t.conta_id, pessoa: t.pessoa, tipo: t.tipo, valor: Math.round(Number(t.valor) * 100), data: t.data, natureza: t.natureza, manual: t.natureza_manual, cartao: t.cartao })));
  for (const r of res) {
    await sql`update ads.fin_transacoes set natureza = ${r.natureza}, updated_at = now(),
      categoria_id = case when categoria_manual or ${r.categoria ?? null}::text is null then categoria_id else ${catId(r.categoria ?? null)} end
      where id = ${r.id} and not natureza_manual`;
  }
  return res.length;
}

/** Cobranças recorrentes dos últimos 13 meses viram assinaturas sugeridas (o status que você escolheu é mantido). */
async function assinaturas(sql: ReturnType<typeof db>) {
  let n = 0;
  for (const pessoa of ["PF", "PJ"] as const) {
    const txs = await txsDaPessoa(sql, pessoa, somarMeses(`${hojeISO().slice(0, 7)}-01`, -13));
    for (const s of detectarAssinaturas(txs)) {
      const [a] = await sql<{ id: number; status: string }[]>`
        insert into ads.fin_assinaturas (padrao, nome, valor_medio, valor_ultimo, dia_cobranca, categoria_id, conta_id, pessoa, ocorrencias, primeira, ultima)
        values (${s.padrao}, ${s.nome}, ${reais(s.valorMedio)}, ${reais(s.valorUltimo)}, ${s.dia}, ${s.categoriaId}, ${s.contaId}, ${s.pessoa}, ${s.ocorrencias}, ${s.primeira}, ${s.ultima})
        on conflict (padrao) do update set valor_medio = excluded.valor_medio, valor_ultimo = excluded.valor_ultimo, dia_cobranca = excluded.dia_cobranca,
          conta_id = excluded.conta_id, ocorrencias = excluded.ocorrencias, primeira = excluded.primeira, ultima = excluded.ultima,
          categoria_id = coalesce(ads.fin_assinaturas.categoria_id, excluded.categoria_id), updated_at = now()
        returning id, status`;
      n++;
      await sql`update ads.fin_transacoes set assinatura_id = ${a!.status === "ignorada" ? null : a!.id}
        where padrao = ${s.padrao} and pessoa = ${pessoa} and natureza = 'gasto' and coalesce(total_parcelas, 1) <= 1`;
    }
  }
  return n;
}
