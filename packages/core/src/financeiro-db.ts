import type { Sql } from "./db";
import { parcelados, somarMeses, type ContextoAnalise, type Natureza, type Pessoa, type TxBase } from "./financeiro";

/** Leitura do Financeiro (ads.fin_*). Só servidor e worker. Dinheiro sai em centavos inteiros. */

const cents = (v: string | null) => (v == null ? null : Math.round(Number(v) * 100));

export interface Conexao { item_id: string; apelido: string | null; banco: string | null; banco_logo: string | null; banco_cor: string | null; pessoa: Pessoa; status: string | null; erro: string | null; ultima_sync: string | null; atualizado_no_banco: string | null }
export interface Conta {
  id: string; item_id: string; tipo: "BANK" | "CREDIT"; nome: string; apelido: string | null; numero: string | null; pessoa: Pessoa; saldo: number | null;
  limite: number | null; limite_usado: number | null; dia_fechamento: number | null; dia_vencimento: number | null; bandeira: string | null;
  categoria_renda_id: number | null; banco: string | null; banco_cor: string | null; banco_logo: string | null; oculta: boolean;
}
export interface Categoria { id: number; nome: string; tipo: "gasto" | "renda"; cor: string; icone: string; orcamento: number | null }
export interface Etiqueta { id: number; nome: string; cor: string; emoji: string | null }
export interface Assinatura {
  id: number; padrao: string; nome: string; valor_medio: number; valor_ultimo: number; dia_cobranca: number | null; categoria_id: number | null;
  conta_id: string | null; pessoa: Pessoa; status: "sugerida" | "confirmada" | "ignorada"; ocorrencias: number; primeira: string | null; ultima: string | null;
}

export async function conexoes(sql: Sql): Promise<Conexao[]> {
  return sql<Conexao[]>`select item_id, apelido, banco, banco_logo, banco_cor, pessoa, status, erro, ultima_sync::text, atualizado_no_banco::text from ads.fin_conexoes order by created_at`;
}

export async function contas(sql: Sql, pessoa?: Pessoa): Promise<Conta[]> {
  const rs = await sql<(Omit<Conta, "saldo" | "limite" | "limite_usado"> & { saldo: string | null; limite: string | null; limite_usado: string | null })[]>`
    select c.id, c.item_id, c.tipo, c.nome, c.apelido, c.numero, c.pessoa, c.saldo, c.limite, c.limite_usado, c.dia_fechamento, c.dia_vencimento, c.bandeira,
           c.categoria_renda_id, k.banco, k.banco_cor, k.banco_logo, c.oculta
    from ads.fin_contas c join ads.fin_conexoes k using (item_id)
    where ${pessoa ?? null}::text is null or c.pessoa = ${pessoa ?? null}
    order by c.pessoa, c.tipo, k.banco, c.nome`;
  return rs.map((c) => ({ ...c, saldo: cents(c.saldo), limite: cents(c.limite), limite_usado: cents(c.limite_usado) }));
}

export async function categorias(sql: Sql): Promise<Categoria[]> {
  const rs = await sql<(Omit<Categoria, "orcamento"> & { orcamento: string | null })[]>`select id, nome, tipo, cor, icone, orcamento from ads.fin_categorias order by tipo, posicao, nome`;
  return rs.map((c) => ({ ...c, orcamento: cents(c.orcamento) }));
}

export async function etiquetas(sql: Sql): Promise<Etiqueta[]> {
  return sql<Etiqueta[]>`select id, nome, cor, emoji from ads.fin_etiquetas order by nome`;
}

export async function assinaturas(sql: Sql, pessoa?: Pessoa): Promise<Assinatura[]> {
  const rs = await sql<(Omit<Assinatura, "valor_medio" | "valor_ultimo"> & { valor_medio: string; valor_ultimo: string | null })[]>`
    select id, padrao, nome, valor_medio, valor_ultimo, dia_cobranca, categoria_id, conta_id, pessoa, status, ocorrencias, primeira::text, ultima::text
    from ads.fin_assinaturas where ${pessoa ?? null}::text is null or pessoa = ${pessoa ?? null}
    order by status = 'ignorada', valor_ultimo desc nulls last`;
  return rs.map((a) => ({ ...a, valor_medio: cents(a.valor_medio)!, valor_ultimo: cents(a.valor_ultimo) ?? cents(a.valor_medio)! }));
}

/** Transações de uma pessoa (PF ou PJ) a partir de `desde` (competência), já com categoria, etiquetas e se é cartão. */
export async function transacoes(sql: Sql, pessoa: Pessoa, desde: string): Promise<(TxBase & { status: string; nota: string | null; categoriaManual: boolean; naturezaManual: boolean })[]> {
  const rs = await sql<{
    id: string; conta_id: string; pessoa: Pessoa; descricao: string; valor: string; tipo: "debito" | "credito"; data: string; competencia: string; natureza: Natureza;
    categoria: string | null; categoria_id: number | null; merchant: string | null; encargo: boolean; parcela: number | null; total_parcelas: number | null;
    compra_em: string | null; etiquetas: string[]; assinatura_id: number | null; cartao: boolean; status: string; nota: string | null; categoria_manual: boolean; natureza_manual: boolean;
  }[]>`
    select t.id, t.conta_id, t.pessoa, t.descricao, t.valor, t.tipo, t.data::text, t.competencia::text, t.natureza, cat.nome as categoria, t.categoria_id,
           t.merchant, t.encargo, t.parcela, t.total_parcelas, t.compra_em::text, t.assinatura_id, c.tipo = 'CREDIT' as cartao, t.status, t.nota,
           t.categoria_manual, t.natureza_manual,
           coalesce((select array_agg(e.nome order by e.nome) from ads.fin_transacao_etiquetas te join ads.fin_etiquetas e on e.id = te.etiqueta_id where te.transacao_id = t.id), '{}') as etiquetas
    from ads.fin_transacoes t
    join ads.fin_contas c on c.id = t.conta_id
    left join ads.fin_categorias cat on cat.id = t.categoria_id
    where t.pessoa = ${pessoa} and t.competencia >= ${desde}::date and not c.oculta
    order by t.data desc, t.created_at desc`;
  return rs.map((t) => ({
    id: t.id, contaId: t.conta_id, pessoa: t.pessoa, descricao: t.descricao, valor: cents(t.valor)!, tipo: t.tipo, data: t.data, competencia: t.competencia,
    natureza: t.natureza, categoria: t.categoria, categoriaId: t.categoria_id, merchant: t.merchant, encargo: t.encargo, parcela: t.parcela, totalParcelas: t.total_parcelas,
    compraEm: t.compra_em, etiquetas: t.etiquetas, assinaturaId: t.assinatura_id, cartao: t.cartao, status: t.status, nota: t.nota,
    categoriaManual: t.categoria_manual, naturezaManual: t.natureza_manual,
  }));
}

/**
 * Regras "aplicar a parecidas": valem para o que não foi mexido à mão. `ids` limita às transações recém-sincronizadas.
 * Etiquetas só somam (nunca tiram uma etiqueta posta à mão).
 */
export async function aplicarRegras(sql: Sql, ids?: string[]) {
  const filtro = ids ?? null;
  const cat = await sql`
    update ads.fin_transacoes t set categoria_id = r.categoria_id, updated_at = now()
    from ads.fin_regras r
    where r.categoria_id is not null and not t.categoria_manual and position(r.padrao in t.padrao) > 0
      and (r.conta_id is null or r.conta_id = t.conta_id) and t.categoria_id is distinct from r.categoria_id
      and (${filtro}::uuid[] is null or t.id = any(${filtro}::uuid[]))`;
  const nat = await sql`
    update ads.fin_transacoes t set natureza = r.natureza, updated_at = now()
    from ads.fin_regras r
    where r.natureza is not null and not t.natureza_manual and position(r.padrao in t.padrao) > 0
      and (r.conta_id is null or r.conta_id = t.conta_id) and t.natureza <> r.natureza
      and (${filtro}::uuid[] is null or t.id = any(${filtro}::uuid[]))`;
  const etq = await sql`
    insert into ads.fin_transacao_etiquetas (transacao_id, etiqueta_id)
    select t.id, r.etiqueta_id from ads.fin_transacoes t join ads.fin_regras r on position(r.padrao in t.padrao) > 0 and (r.conta_id is null or r.conta_id = t.conta_id)
    where r.etiqueta_id is not null and (${filtro}::uuid[] is null or t.id = any(${filtro}::uuid[]))
    on conflict do nothing`;
  return cat.count + nat.count + etq.count;
}

/** Tudo que as análises (código e IA) precisam de uma pessoa num mês: 13 meses de transações + assinaturas, cartões, orçamentos e parcelados. */
export async function contextoAnalise(sql: Sql, pessoa: Pessoa, mes: string, hoje: string) {
  const [txs, ass, cts, cats] = await Promise.all([transacoes(sql, pessoa, somarMeses(mes, -12)), assinaturas(sql, pessoa), contas(sql, pessoa), categorias(sql)]);
  const ps = parcelados(txs, mes);
  const ctx: ContextoAnalise = {
    pessoa, mes, hoje, txs,
    assinaturas: ass.map((a) => ({ nome: a.nome, valorMedio: a.valor_medio, valorUltimo: a.valor_ultimo, status: a.status })),
    cartoes: cts.filter((c) => c.tipo === "CREDIT" && !c.oculta).map((c) => ({ nome: c.apelido || c.nome, limite: c.limite, usado: c.limite_usado })),
    orcamentos: cats.filter((c) => c.tipo === "gasto" && c.orcamento).map((c) => ({ nome: c.nome, orcamento: c.orcamento! })),
    parcelados: ps,
  };
  return { ctx, txs, assinaturas: ass, contas: cts, categorias: cats, parcelados: ps };
}
