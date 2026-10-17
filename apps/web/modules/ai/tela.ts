/**
 * "Mãos" do consultor na tela: ele lê a página aberta (campos com id, opções clicáveis) e devolve um bloco
 * ```domus-tela com passos (ir, escolher, preencher). Só mexe no formulário: nunca envia, salva nem publica.
 */

const visivel = (el: HTMLElement) => !!el.offsetParent && !el.closest("[hidden], [aria-hidden='true']");
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const texto1 = (el: HTMLElement) => (el.innerText || el.getAttribute("aria-label") || "").split("\n").map((l) => l.trim()).filter(Boolean)[0]?.slice(0, 48) ?? "";

type Campo = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const PULAR = ["password", "hidden", "file", "submit", "button"];

function campos(main: HTMLElement): Campo[] {
  return Array.from(main.querySelectorAll<Campo>("input, textarea, select")).filter((el) => visivel(el) && !PULAR.includes(el.type) && !el.disabled);
}
// ids repetidos (abas montadas e escondidas) fazem el.labels apontar para outro campo: o rótulo do mesmo .field vem primeiro
const rotulo = (el: Campo) => el.closest(".field")?.querySelector("label")?.textContent?.trim() || el.labels?.[0]?.textContent?.trim() || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.name || "";

/** Botões de escolha (abas, chips, cartões de opção). Botão de enviar/salvar fica de fora. */
function opcoes(main: HTMLElement): HTMLElement[] {
  return Array.from(main.querySelectorAll<HTMLElement>("button[aria-pressed], [role=tab], [role=radio], [role=switch], button[data-opt], [data-opt] > button, button.chip"))
    .filter((el) => visivel(el) && !(el as HTMLButtonElement).disabled && (el as HTMLButtonElement).type !== "submit" && !el.classList.contains("btn-primary"));
}
const marcado = (el: HTMLElement) => ["true"].includes(el.getAttribute("aria-pressed") ?? el.getAttribute("aria-selected") ?? el.getAttribute("aria-checked") ?? el.dataset.active ?? "");

/** Retrato da tela aberta: rota, título, campos (com o id que a IA usa para preencher), opções e texto visível. */
export function lerTela() {
  const main = document.getElementById("conteudo");
  if (!main) return undefined;
  const fs = campos(main).filter((el) => !(el instanceof HTMLInputElement && el.type === "radio"));
  const linhasCampos = fs.map((el) => {
    const id = el.id || el.name;
    const v = el instanceof HTMLSelectElement ? el.selectedOptions[0]?.text ?? "" : el instanceof HTMLInputElement && el.type === "checkbox" ? (el.checked ? "marcado" : "desmarcado") : el.value;
    const extra = el instanceof HTMLSelectElement ? ` (opções: ${Array.from(el.options).map((o) => o.text).join(" | ").slice(0, 300)})` : el instanceof HTMLInputElement && el.type === "range" ? ` (de ${el.min} a ${el.max})` : "";
    return `- [${id || "sem-id"}] ${rotulo(el).slice(0, 80)}${extra} = ${v.trim() ? JSON.stringify(v.slice(0, 1500)) : "(vazio)"}`;
  });
  const ops = [...new Set(opcoes(main).map((el) => { const t = texto1(el); return t ? `${t}${marcado(el) ? " ✓" : ""}` : ""; }).filter(Boolean))];
  const partes = [
    linhasCampos.length ? `Campos da tela (preencher pelo id entre colchetes):\n${linhasCampos.join("\n")}` : "",
    ops.length ? `Opções clicáveis (escolher pelo texto; ✓ = selecionada): ${ops.join(" · ")}` : "",
    `Texto da tela:\n${main.innerText.replace(/\n{3,}/g, "\n\n").trim()}`,
  ].filter(Boolean);
  return { path: location.pathname + location.search, titulo: document.title, texto: partes.join("\n\n").slice(0, 20_000) };
}

export type Passo = { ir: string } | { escolher: string } | { preencher: Record<string, string | number | boolean> };

/** Passos do último bloco ```domus-tela da mensagem (JSON: lista de passos ou { "passos": [...] }). */
export function passosDaMensagem(conteudo: string): Passo[] | null {
  const m = [...conteudo.matchAll(/```domus-tela\s*([\s\S]*?)```/g)].at(-1);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]!) as unknown;
    const lista = Array.isArray(j) ? j : (j as { passos?: unknown }).passos ?? [j];
    return (lista as Passo[]).filter((p) => p && typeof p === "object").slice(0, 40);
  } catch { return null; }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function ate<T>(f: () => T | null | undefined, ms = 8000): Promise<T | null> {
  for (const fim = Date.now() + ms; Date.now() < fim; await esperar(120)) { const v = f(); if (v) return v; }
  return null;
}

/** Valor em input/textarea/select controlado pelo React: setter nativo + evento, senão o estado não acompanha. */
function definir(el: Campo, valor: string | number | boolean) {
  if (el instanceof HTMLInputElement && el.type === "checkbox") {
    if (el.checked !== !!valor) el.click();
    return true;
  }
  let v = String(valor);
  if (el instanceof HTMLSelectElement) {
    const op = Array.from(el.options).find((o) => o.value === v) ?? Array.from(el.options).find((o) => norm(o.text) === norm(v)) ?? Array.from(el.options).find((o) => norm(o.text).includes(norm(v)));
    if (!op) return false;
    v = op.value;
  }
  if (!(el instanceof HTMLSelectElement) && el.maxLength > 0) v = v.slice(0, el.maxLength);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function acharCampo(main: HTMLElement, chave: string): Campo | null {
  const fs = campos(main);
  const k = norm(chave);
  return fs.find((el) => el.id === chave || el.name === chave) ?? fs.find((el) => norm(rotulo(el)) === k) ?? fs.find((el) => k.length > 2 && norm(rotulo(el)).includes(k)) ?? null;
}
function acharOpcao(main: HTMLElement, alvo: string): HTMLElement | null {
  const ops = opcoes(main);
  const k = norm(alvo);
  return ops.find((el) => norm(texto1(el)) === k) ?? ops.find((el) => norm(el.innerText).startsWith(k)) ?? ops.find((el) => k.length > 2 && norm(el.innerText).includes(k)) ?? null;
}

/** Executa os passos na tela. Navegar usa o router (sem recarregar) e espera a página nova montar. */
export async function executarTela(passos: Passo[], navegar: (href: string) => void) {
  const falhas: string[] = [];
  let feitos = 0;
  for (const p of passos) {
    if ("ir" in p) {
      const href = String(p.ir);
      if (!/^\/(?!\/|api\/)/.test(href)) { falhas.push(`endereço recusado: ${href}`); continue; }
      if (location.pathname + location.search !== href) {
        navegar(href);
        const chegou = await ate(() => location.pathname + location.search === href.split("#")[0] && document.getElementById("conteudo"), 10_000);
        if (!chegou) { falhas.push(`não abriu ${href}`); break; }
        await esperar(700); // a página nova termina de montar (e entrar com animação)
      }
      feitos++;
      continue;
    }
    const main = document.getElementById("conteudo");
    if (!main) break;
    if ("escolher" in p) {
      const el = await ate(() => acharOpcao(main, String(p.escolher)), 3000);
      if (!el) { falhas.push(`opção “${p.escolher}”`); continue; }
      if (!marcado(el)) el.click();
      feitos++;
      await esperar(350); // trocar opção pode revelar outros campos
      continue;
    }
    if ("preencher" in p && p.preencher && typeof p.preencher === "object") {
      for (const [chave, valor] of Object.entries(p.preencher)) {
        const el = await ate(() => acharCampo(main, chave), 2000);
        if (el && definir(el, valor)) { feitos++; el.closest(".field, .panel")?.animate?.([{ boxShadow: "0 0 0 2px rgb(168 85 255 / .8)" }, { boxShadow: "0 0 0 0 rgb(168 85 255 / 0)" }], { duration: 1200, easing: "ease-out" }); }
        else falhas.push(`campo “${chave}”`);
        await esperar(40);
      }
    }
  }
  return { feitos, falhas };
}
