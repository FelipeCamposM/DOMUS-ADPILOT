/** Barreira de segurança antes do Chrome: o HTML vem de IA, então só passa o que é determinístico e local. */
export function violacoes(html: string): string[] {
  const erros: string[] = [];
  const proibidos: [RegExp, string][] = [
    [/Math\.random/, "Math.random não é permitido (render não determinístico)"],
    [/Date\.now|new Date\b/, "Date não é permitido (render não determinístico)"],
    [/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon/, "Acesso à rede não é permitido"],
    [/\bimport\s*\(|\beval\s*\(|new Function\b/, "Código dinâmico (import()/eval/Function) não é permitido"],
    [/<iframe|<object|<embed/i, "iframe/object/embed não são permitidos"],
    [/@keyframes|animation\s*:|transition\s*:/i, "Use só o timeline GSAP (sem @keyframes, animation ou transition no CSS)"],
  ];
  for (const [re, msg] of proibidos) if (re.test(html)) erros.push(msg);
  for (const m of html.matchAll(/<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi))
    if (m[1] !== "assets/motion-kit.js" && m[1] !== "assets/cenas.js" && !/^https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@3[\w.]*\/dist\/[\w.]+\.js$/.test(m[1]!)) erros.push(`Script não permitido: ${m[1]} (só o GSAP do jsdelivr, assets/motion-kit.js e assets/cenas.js)`);
  for (const m of html.matchAll(/<link[^>]*\shref\s*=\s*["']([^"']+)["']/gi))
    if (!/^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/.test(m[1]!)) erros.push(`Link externo não permitido: ${m[1]} (só Google Fonts)`);
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi))
    if (!/^https:\/\/(cdn\.jsdelivr\.net\/npm\/gsap@3|fonts\.(googleapis|gstatic)\.com(\/|$))/.test(m[1]!)) erros.push(`Recurso externo não permitido: ${m[1]}`);
  // arquivos locais: só os anexos copiados para assets/ da pasta do projeto
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const v = m[1]!;
    if (/^(https?:|data:|#)/i.test(v)) continue;
    if (!/^assets\/[\w.-]+$/.test(v)) erros.push(`Arquivo local não permitido: ${v} (só assets/<arquivo> da pasta do projeto)`);
  }
  if (/file:|\.\.[/\\]/i.test(html)) erros.push("Caminhos com .. ou file: não são permitidos");
  for (const m of html.matchAll(/url\(\s*["']?(https?:[^"')]+)/gi))
    if (!/^https:\/\/fonts\.gstatic\.com\//.test(m[1]!)) erros.push(`url() externa não permitida: ${m[1]}`);
  if (!/data-composition-id\s*=\s*["']main["']/.test(html)) erros.push('Falta o raiz com data-composition-id="main"');
  if (!/window\.__timelines\s*\[\s*["']main["']\s*\]/.test(html)) erros.push('Falta registrar window.__timelines["main"]');
  return [...new Set(erros)];
}
