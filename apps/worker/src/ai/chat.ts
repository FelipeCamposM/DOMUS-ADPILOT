import { db, iaPreferencias, parseActionBlocks, resumoPostConsultor, toDecimal, type GoogleSearchSpec, type Json } from "@domus-ads/core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONV_DIR } from "../env";
import { runCli, type AiProvider } from "./cli";
import { resolveConfigDir } from "./login";
import { contextoPagina, instrucoes, snapshot, snapshotMarketing } from "./context";
import { blockedUntil, type Usage } from "./limits";

interface Conta { id: string; provider: AiProvider; name: string; config_dir: string; priority: number }
interface Msg { id: number; role: string; content: string; status: string; meta: { pagina?: unknown } }

const brl = (v: string, moeda: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(Number(v));
const MAX_HIST = 60_000;

/**
 * Uma rodada de conversa: responde a última mensagem do usuário com a melhor conta disponível.
 * Se a conta bater o limite (5 h/semana), marca até quando ela fica fora e continua NA MESMA rodada na próxima conta
 * (Claude ou Codex, conforme a preferência da conversa), mandando o histórico que a nova sessão ainda não viu.
 */
export async function runChatTurn(conversationId: string, signal: AbortSignal, log: (m: string) => Promise<void>) {
  const sql = db();
  const [conv] = await sql<{ id: string; workspace_id: string; title: string; provider_pref: string; tipo: string }[]>`
    select id, workspace_id, title, provider_pref, tipo from ads.ai_conversations where id = ${conversationId}`;
  if (!conv) throw new Error("Conversa não encontrada");
  const msgs = await sql<Msg[]>`select id::int as id, role, content, status, meta from ads.ai_messages where conversation_id = ${conv.id} order by id`;
  const pergunta = [...msgs].reverse().find((m) => m.role === "user");
  if (!pergunta) throw new Error("Nada para responder");

  const pasta = join(CONV_DIR, conv.id);
  mkdirSync(pasta, { recursive: true });
  const sysFile = join(pasta, "instrucoes.md");
  writeFileSync(sysFile, instrucoes(conv.tipo), "utf8");

  // Resposta em construção: a web faz polling e mostra o texto chegando.
  const [resp] = await sql<{ id: number }[]>`
    insert into ads.ai_messages (conversation_id, role, content, status) values (${conv.id}, 'assistant', '', 'STREAMING') returning id::int as id`;
  let texto = "", ultimoFlush = 0, gravando: Promise<unknown> = Promise.resolve();
  const flush = (forcar = false) => {
    if (!forcar && Date.now() - ultimoFlush < 300) return;
    ultimoFlush = Date.now();
    const t = texto;
    gravando = gravando.then(() => sql`update ads.ai_messages set content = ${t} where id = ${resp!.id}`);
  };

  const tentadas = new Set<string>();
  const avisos: string[] = [];
  try {
    for (;;) {
      if (signal.aborted) throw new Error("Cancelado");
      const conta = await proximaConta(conv.id, conv.provider_pref, tentadas);
      if (!conta) {
        const prox = await sql<{ name: string; limited_until: Date }[]>`
          select name, limited_until from ads.ai_accounts where status = 'ACTIVE' and limited_until > now() order by limited_until limit 1`;
        const quando = prox[0] ? ` A primeira a liberar é “${prox[0].name}”, às ${prox[0].limited_until.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.` : "";
        throw new Error(tentadas.size
          ? `Todas as contas de IA disponíveis falharam ou estão no limite.${quando}`
          : `Nenhuma conta de IA ativa${conv.provider_pref !== "auto" ? ` do ${conv.provider_pref}` : ""}. Conecte uma em Configurações → Contas de IA.${quando}`);
      }
      tentadas.add(conta.id);
      await log(`usando ${conta.provider} · ${conta.name}`);

      const [sess] = await sql<{ session_id: string; last_message_id: number }[]>`
        select session_id, last_message_id::int as last_message_id from ads.ai_sessions where conversation_id = ${conv.id} and ai_account_id = ${conta.id}`;
      const naoVistas = msgs.filter((m) => m.id !== pergunta.id && m.status === "DONE" && (m.role === "user" || m.role === "assistant") && (!sess || m.id > sess.last_message_id));
      const prompt = [
        conv.tipo === "marketing" ? await snapshotMarketing(conv.workspace_id) : await snapshot(conv.workspace_id),
        conv.tipo !== "analista" ? await contextoPagina(conv.workspace_id, pergunta.meta?.pagina) : "",
        naoVistas.length ? `<historico${sess ? "_que_voce_nao_viu" : ""}>\n${historico(naoVistas)}\n</historico${sess ? "_que_voce_nao_viu" : ""}>` : "",
        `<mensagem_do_usuario>\n${pergunta.content}\n</mensagem_do_usuario>`,
      ].filter(Boolean).join("\n\n");

      texto = "";
      flush(true);
      const configDir = resolveConfigDir(conta.config_dir);
      const r = await runCli({
        provider: conta.provider, configDir, cwd: pasta, prompt, systemPromptFile: sysFile, sessionId: sess?.session_id ?? null, signal,
        onText: (t) => { texto = t; flush(); },
        onUsage: (u) => void salvarUso(conta.id, u),
      });
      await sql`
        insert into ads.ai_usage (ai_account_id, workspace_id, conversation_id, provider, model, input_tokens, output_tokens, cost_usd, duration_ms, ok)
        values (${conta.id}, ${conv.workspace_id}, ${conv.id}, ${conta.provider}, ${r.model}, ${r.inputTokens}, ${r.outputTokens}, ${r.costUsd}, ${r.durationMs}, ${r.ok})`;

      if (r.ok) {
        texto = r.text;
        await sql`update ads.ai_accounts set last_used_at = now(), last_error = null where id = ${conta.id}`;
        if (r.sessionId) {
          await sql`
            insert into ads.ai_sessions (conversation_id, ai_account_id, session_id, last_message_id) values (${conv.id}, ${conta.id}, ${r.sessionId}, ${resp!.id})
            on conflict (conversation_id, ai_account_id) do update set session_id = excluded.session_id, last_message_id = excluded.last_message_id`;
        }
        const { n: acoes, erros } = await registrarAcoes(conv.workspace_id, conv.id, resp!.id, texto);
        // proposta fora do formato: avisa na própria resposta em vez de sumir calada
        if (erros.length) texto += `\n\n> ⚠️ Uma proposta veio com erro e foi descartada (${erros.slice(0, 3).join("; ")}). Peça de novo que eu refaço.`;
        await gravando;
        await sql`
          update ads.ai_messages set content = ${texto}, status = 'DONE', provider = ${conta.provider}, ai_account_id = ${conta.id},
            meta = ${sql.json({ account: conta.name, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, durationMs: r.durationMs, switches: avisos, actions: acoes } as Json)}
          where id = ${resp!.id}`;
        await log(`resposta pronta (${r.outputTokens} tokens, ${acoes} proposta(s))`);
        return { account: conta.name, provider: conta.provider, actions: acoes };
      }

      if (signal.aborted) throw new Error("Cancelado");
      if (r.limit) {
        const ate = blockedUntil(null, r.limit.resetsAt);
        await sql`update ads.ai_accounts set limited_until = ${ate}, last_error = 'Limite de uso atingido' where id = ${conta.id}`;
        avisos.push(`“${conta.name}” (${conta.provider}) atingiu o limite; volta ${ate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
      } else {
        await sql`update ads.ai_accounts set last_error = ${(r.authError ? "Login expirado: use “Refazer login” em Configurações → Contas de IA. " : "") + (r.error ?? "")} where id = ${conta.id}`;
        avisos.push(`“${conta.name}” (${conta.provider}) falhou: ${r.authError ? "login expirado" : r.error?.slice(0, 160)}`);
      }
      await log(avisos.at(-1)!);
      // aviso vai na própria resposta (a web mostra acima do texto, ao vivo), não numa mensagem que ficaria depois dela
      await gravando;
      await sql`update ads.ai_messages set meta = ${sql.json({ switches: avisos } as Json)} where id = ${resp!.id}`;
    }
  } catch (e) {
    await gravando;
    await sql`update ads.ai_messages set status = 'ERROR', content = ${texto}, meta = ${sql.json({ error: (e as Error).message, switches: avisos } as Json)} where id = ${resp!.id}`;
    throw e;
  } finally {
    await sql`
      update ads.ai_conversations set status = 'IDLE', updated_at = now(),
        title = case when title = 'Nova conversa' then ${pergunta.content.replace(/\s+/g, " ").slice(0, 70)} else title end
      where id = ${conv.id}`;
  }
}

/** Próxima conta: a que já tem sessão nesta conversa primeiro (retoma barato), depois prioridade. */
async function proximaConta(conversationId: string, pref: string, tentadas: Set<string>): Promise<Conta | null> {
  const contas = await db()<(Conta & { tem_sessao: boolean })[]>`
    select a.id, a.provider, a.name, a.config_dir, a.priority,
      exists (select 1 from ads.ai_sessions s where s.conversation_id = ${conversationId} and s.ai_account_id = a.id) as tem_sessao
    from ads.ai_accounts a
    where a.status = 'ACTIVE' and (a.limited_until is null or a.limited_until < now()) and (${pref} = 'auto' or a.provider = ${pref})
    order by a.id is not distinct from ${(await iaPreferencias()).conta}::uuid desc, tem_sessao desc, a.priority, a.created_at`;
  return contas.find((c) => !tentadas.has(c.id)) ?? null;
}

async function salvarUso(accountId: string, u: Usage) {
  await db()`update ads.ai_accounts set usage = ${db().json(u as unknown as Json)} where id = ${accountId}`;
}

function historico(msgs: Msg[]): string {
  let out = msgs.map((m) => `[${m.role === "user" ? "usuário" : "assistente"}]\n${m.content}`).join("\n\n");
  if (out.length > MAX_HIST) out = `(início omitido)\n…${out.slice(-MAX_HIST)}`;
  return out;
}

/** Propostas da IA viram ads.ai_actions PENDING_APPROVAL, só para campanhas deste workspace. Nada executa aqui. */
async function registrarAcoes(workspaceId: string, conversationId: string, messageId: number, texto: string): Promise<{ n: number; erros: string[] }> {
  const sql = db();
  const { actions, erros } = parseActionBlocks(texto);
  let n = 0;
  for (const a of actions) {
    if (a.type === "CRIAR_POST_INSTAGRAM") {
      const [perfil] = await sql<{ username: string }[]>`select username from ads.instagram_accounts where id = ${a.igAccountId} and workspace_id = ${workspaceId}`;
      if (!perfil) { erros.push("perfil do Instagram não encontrado"); continue; }
      if (a.quando !== "agora" && Date.parse(a.quando) < Date.now() - 5 * 60_000) { erros.push("horário já passou"); continue; }
      await sql`
        insert into ads.ai_actions (workspace_id, conversation_id, message_id, type, payload, summary, reason)
        values (${workspaceId}, ${conversationId}, ${messageId}, ${a.type}, ${sql.json(a as unknown as Json)}, ${resumoPostConsultor(a, perfil.username)}, ${a.reason ?? null})`;
      n++;
      continue;
    }
    if (a.type === "UPDATE_DRAFT") {
      const [d] = await sql<{ name: string; status: string; spec: { grupos?: { palavras?: unknown[] }[]; orcamentoDiario?: string } }[]>`
        select name, status, spec from ads.campaign_drafts where id = ${a.draftId} and workspace_id = ${workspaceId}`;
      if (!d || !["DRAFT", "FAILED"].includes(d.status)) { erros.push("rascunho não encontrado ou já publicado"); continue; }
      await sql`
        insert into ads.ai_actions (workspace_id, conversation_id, message_id, type, payload, summary, reason)
        values (${workspaceId}, ${conversationId}, ${messageId}, ${a.type}, ${sql.json(a as unknown as Json)}, ${resumoRascunho(d.name, d.spec, a.spec)}, ${a.reason ?? null})`;
      n++;
      continue;
    }
    const [c] = await sql<{ name: string; daily_budget: string | null; status: string; currency: string }[]>`
      select c.name, c.daily_budget::text, c.status, ac.currency from ads.campaigns c join ads.ad_accounts ac on ac.id = c.ad_account_id
      where c.id = ${a.campaignId} and c.workspace_id = ${workspaceId}`;
    if (!c) continue;
    let summary: string;
    let payload: Record<string, unknown> = a;
    if (a.type === "UPDATE_BUDGET") {
      if (!c.daily_budget) continue;
      const novo = toDecimal(a.dailyBudget);
      if (novo === "0.00" || novo === c.daily_budget) continue;
      payload = { ...a, dailyBudget: novo, previousBudget: c.daily_budget };
      summary = `Orçamento de “${c.name}”: ${brl(c.daily_budget, c.currency)} → ${brl(novo, c.currency)}/dia`;
    } else if (a.type === "PAUSE_CAMPAIGN") {
      if (c.status !== "ACTIVE") continue;
      summary = `Pausar “${c.name}”`;
    } else {
      if (c.status !== "PAUSED") continue;
      summary = `Ativar “${c.name}”`;
    }
    await sql`
      insert into ads.ai_actions (workspace_id, conversation_id, message_id, type, payload, summary, reason)
      values (${workspaceId}, ${conversationId}, ${messageId}, ${a.type}, ${sql.json(payload as Json)}, ${summary}, ${a.reason ?? null})`;
    n++;
  }
  return { n, erros };
}

/** "Ajustar rascunho “X”: 5 → 1 grupo · 52 → 9 palavras-chave · orçamento 50.00 → 5.00/dia" */
function resumoRascunho(nome: string, antes: { grupos?: { palavras?: unknown[] }[]; orcamentoDiario?: string }, depois: GoogleSearchSpec): string {
  const kw = (g?: { palavras?: unknown[] }[]) => (g ?? []).reduce((s, x) => s + (x.palavras?.length ?? 0), 0);
  const partes: string[] = [];
  const ga = antes.grupos?.length ?? 0, gd = depois.grupos.length;
  if (ga !== gd) partes.push(`${ga} → ${gd} grupo(s)`);
  const ka = kw(antes.grupos), kd = kw(depois.grupos);
  if (ka !== kd) partes.push(`${ka} → ${kd} palavras-chave`);
  if (antes.orcamentoDiario && antes.orcamentoDiario !== depois.orcamentoDiario) partes.push(`orçamento ${antes.orcamentoDiario} → ${depois.orcamentoDiario}/dia`);
  return `Ajustar rascunho “${nome}”${partes.length ? `: ${partes.join(" · ")}` : ""}`;
}
