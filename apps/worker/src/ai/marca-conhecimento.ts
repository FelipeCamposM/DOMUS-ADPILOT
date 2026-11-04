import { db } from "@domus-ads/core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../env";
import { buscarSeguro, decodificar } from "../video/referencias";
import { bloco, perguntarIA } from "./ask";

/**
 * BASE DE CONHECIMENTO DA MARCA: o worker vasculha o site (mesmo domínio, páginas mais úteis primeiro), tira o texto de
 * cada página e a IA organiza em fatos da marca (produtos, público, diferenciais, provas, objeções, linguagem).
 * Fica em ads.brands.conhecimento e entra no contexto de roteiros, legendas, calendário e campanhas.
 */
export interface ConhecimentoPayload { brandId: string; url: string }

const MAX_PAGINAS = 20;
const MAX_POR_PAGINA = 7000;
const MAX_TOTAL = 80_000;
export const MAX_CONHECIMENTO = 30_000;
// páginas que mais dizem sobre a marca vêm primeiro; posts de blog por último
const UTIL = /(sobre|quem-somos|empresa|institucional|servic|produt|solu|plano|preco|pre%c3%a7o|pricing|recurso|funcionalidade|modulo|sistema|faq|duvida|perguntas|contato|cliente|case|depoimento|portfolio|como-funciona|vantage|beneficio)/i;
const ARQUIVO = /\.(pdf|jpe?g|png|gif|webp|svg|ico|zip|rar|mp4|mp3|webm|css|js|xml|json|txt|docx?|xlsx?)$/i;

const host = (u: URL) => u.hostname.replace(/^www\./, "");

/** Texto legível do HTML, com títulos e itens de lista preservados (o que importa para entender a marca). */
export function textoDaPagina(html: string): string {
  const t = html
    .replace(/<(script|style|noscript|svg|iframe|template|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<h([1-4])[^>]*>/gi, (_, n: string) => `\n\n${"#".repeat(Number(n) + 1)} `)
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(h[1-6]|p|div|section|article|li|tr|header|footer|ul|ol|blockquote|figcaption|dd|dt)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodificar(t).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l && l !== "-" && !/^#+$/.test(l)).join("\n");
}

/** Links do mesmo site (sem arquivos, âncoras nem parâmetros). */
export function linksInternos(html: string, base: URL): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["']/gi)) {
    try {
      const u = new URL(m[1]!.trim(), base);
      if (!/^https?:$/.test(u.protocol) || host(u) !== host(base) || ARQUIVO.test(u.pathname)) continue;
      u.hash = ""; u.search = "";
      out.add(u.toString().replace(/\/$/, ""));
    } catch { /* link quebrado */ }
  }
  return [...out];
}

const prioridade = (u: string) => (UTIL.test(u) ? 0 : /\/(blog|noticias|artigos|post)s?\//i.test(u) ? 2 : 1) + u.split("/").length * 0.01;

/** Busca até MAX_PAGINAS do site: começa pela URL dada e segue os links internos mais úteis. Linhas repetidas (menu, rodapé) entram uma vez só. */
async function vasculhar(inicio: string, log: (m: string) => Promise<void>, signal: AbortSignal) {
  const fila = [inicio.replace(/\/$/, "")];
  const vistos = new Set<string>(fila);
  const linhasVistas = new Set<string>();
  const paginas: { url: string; titulo: string; texto: string }[] = [];
  let total = 0;
  while (fila.length && paginas.length < MAX_PAGINAS && total < MAX_TOTAL) {
    if (signal.aborted) throw new Error("Cancelado");
    fila.sort((a, b) => prioridade(a) - prioridade(b));
    const url = fila.shift()!;
    try {
      const r = await buscarSeguro(url, { accept: "text/html,application/xhtml+xml", max: 2_000_000 });
      if (!r.tipo.includes("html")) continue;
      const html = r.corpo.toString("utf8");
      const titulo = decodificar(html.match(/<title[^>]*>([^<]{1,200})/i)?.[1]?.trim() ?? "");
      const descricao = decodificar(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1] ?? "");
      const linhas = textoDaPagina(html).split("\n").filter((l) => {
        if (l.length > 140) return true; // parágrafo de conteúdo fica mesmo se repetir
        if (linhasVistas.has(l)) return false;
        linhasVistas.add(l);
        return true;
      });
      const texto = [descricao && `(descrição) ${descricao}`, ...linhas].filter(Boolean).join("\n").slice(0, MAX_POR_PAGINA);
      if (texto.length > 80) { paginas.push({ url: r.url.toString(), titulo, texto }); total += texto.length; }
      for (const l of linksInternos(html, r.url)) if (!vistos.has(l)) { vistos.add(l); fila.push(l); }
      await log(`lida: ${r.url.pathname || "/"} (${texto.length} caracteres)`);
    } catch (e) {
      await log(`não lida: ${url} (${(e as Error).message})`);
    }
  }
  return paginas;
}

const SISTEMA = `Você é estrategista de marca e pesquisador. Recebe o texto das páginas do site de uma marca e monta a BASE DE
CONHECIMENTO que redatores e roteiristas vão consultar para escrever anúncios, roteiros de vídeo e posts específicos e verdadeiros.

Responda APENAS com um bloco \`\`\`markdown, em português do Brasil, com exatamente estas seções (## título):
## Resumo (3 a 5 frases: o que é, para quem, por que escolher)
## Produtos e serviços (cada um: o que é, para quem, principais recursos, preço/planos SE estiver no site)
## Público e situações de uso (quem compra, o dia a dia dessa pessoa, o que ela está tentando resolver)
## Dores que resolve (concretas, nas palavras do cliente quando possível)
## Diferenciais (o que é específico desta marca; nada genérico como "qualidade")
## Provas (números, clientes, depoimentos, cases, tempo de mercado, prêmios: só o que está escrito no site)
## Objeções e respostas (dúvidas frequentes e como o site responde)
## Ofertas e chamadas (testes grátis, promoções, garantias, como contratar, contatos e links)
## Linguagem da marca (tom; palavras e expressões que ela usa; 5 a 10 frases reais do site entre aspas)
## Não afirmar (o que NÃO está no site e não deve ser inventado: preços, prazos, números ausentes etc.)

Regras:
- Só fatos que estão nas páginas. Não invente nem complete com suposição; se faltar, diga na seção "Não afirmar".
- Seja específico: nomes de recursos, números, cidades, nichos, exemplos. Corte frases de efeito vazias do site.
- Termine cada seção com "Fontes:" e os caminhos das páginas usadas (ex.: /planos, /sobre).
- Tamanho: o necessário para ser completo, sem repetir (até umas 2.500 palavras).`;

export async function runConhecimento(payload: ConhecimentoPayload, c: { signal: AbortSignal; log: (m: string) => Promise<void>; progress: (p: number) => Promise<void> }) {
  const sql = db();
  const [m] = await sql<{ id: string; workspace_id: string; nome: string }[]>`select id, workspace_id, nome from ads.brands where id = ${payload.brandId}`;
  if (!m) throw new Error("Marca não encontrada");
  await c.log(`Vasculhando ${payload.url}…`);
  await c.progress(5);
  const paginas = await vasculhar(payload.url, c.log, c.signal);
  if (!paginas.length) throw new Error("Não consegui ler nenhuma página desse site. Confira o endereço (precisa ser público, sem login).");
  await c.progress(55);
  await c.log(`${paginas.length} páginas lidas; a IA está montando a base de conhecimento…`);
  const pasta = join(DATA_DIR, "conhecimento", m.id);
  mkdirSync(pasta, { recursive: true });
  const prompt = `Marca: ${m.nome}\nSite: ${payload.url}\n\n<paginas>\n${paginas.map((p) => `<pagina url="${p.url}" titulo="${p.titulo.replace(/"/g, "'")}">\n${p.texto}\n</pagina>`).join("\n\n")}\n</paginas>`;
  const r = await perguntarIA({ workspaceId: m.workspace_id, sistema: SISTEMA, prompt, cwd: pasta, signal: c.signal, log: c.log });
  const texto = bloco(r.text, "markdown").slice(0, MAX_CONHECIMENTO);
  if (texto.length < 200) throw new Error("A IA não conseguiu montar a base com o conteúdo do site. Tente de novo.");
  await sql`update ads.brands set conhecimento = ${texto}, conhecimento_em = now(), conhecimento_fontes = ${sql.json(paginas.map((p) => p.url))},
    brand = case when coalesce(brand->>'site', '') = '' then jsonb_set(brand, '{site}', to_jsonb(${payload.url}::text)) else brand end, updated_at = now()
    where id = ${m.id}`;
  await c.progress(100);
  return { paginas: paginas.length, caracteres: texto.length };
}

/** Bloco para o prompt: fatos confiáveis da marca. max corta bases grandes nos pedidos curtos. */
export const blocoConhecimento = (marca: string | null, texto: string | null | undefined, max = 14_000) =>
  texto?.trim() ? `<base_de_conhecimento marca="${(marca ?? "").replace(/"/g, "'")}">
Fatos da marca, levantados do site oficial (e revisados pelo cliente). Use para ser específico: produtos, recursos, público,
dores, provas, objeções e a linguagem da marca. É a fonte de verdade: não afirme nada que contradiga ou que não esteja aqui ou no briefing.
${texto.trim().slice(0, max)}
</base_de_conhecimento>` : "";
