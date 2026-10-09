/**
 * Script do editor visual, injetado na arte (iframe sandbox sem allow-same-origin: não enxerga o app).
 * Mexe direto no DOM da composição original, então nada se perde: fontes, gradientes, vidro, glow e SVG continuam iguais.
 * Movimento, tamanho e rotação usam as propriedades CSS independentes translate/scale/rotate, que se somam aos
 * transforms que a arte já tinha. Fala com a página por postMessage; o export remove tudo que é do editor.
 */
export const EDITOR_SCRIPT = String.raw`(() => {
  const doc = document, W = doc.documentElement.clientWidth, H = doc.documentElement.clientHeight;
  const arte = doc.querySelector("#arte") || doc.querySelector("[data-composition-id]") || doc.body;
  const fundo = new Set([doc.documentElement, doc.body, arte, doc.querySelector("[data-composition-id]")]);
  const post = (m) => parent.postMessage({ __editor: true, ...m }, "*");
  const mk = (css) => { const d = doc.createElement("div"); d.className = "__ed"; d.style.cssText = css; doc.body.appendChild(d); return d; };
  const box = mk("position:absolute;pointer-events:none;z-index:2147483646;outline:2px solid #a78bfa;box-shadow:0 0 0 1px rgba(0,0,0,.6),0 0 24px rgba(139,92,246,.7);display:none");
  const hover = mk("position:absolute;pointer-events:none;z-index:2147483645;outline:1.5px dashed rgba(167,139,250,.85);display:none");
  const alca = mk("position:absolute;z-index:2147483647;width:26px;height:26px;border-radius:50%;background:#8b5cf6;border:3px solid #fff;cursor:nwse-resize;display:none;box-shadow:0 0 14px rgba(139,92,246,.9)");
  const guiaV = mk("position:absolute;top:0;bottom:0;left:" + (W / 2) + "px;width:0;border-left:2px dashed #f0abfc;z-index:2147483644;display:none;pointer-events:none");
  const guiaH = mk("position:absolute;left:0;right:0;top:" + (H / 2) + "px;height:0;border-top:2px dashed #f0abfc;z-index:2147483644;display:none;pointer-events:none");

  let sel = null, editando = null;
  const hist = [], fut = [];
  const salvar = () => { hist.push(arte.innerHTML); if (hist.length > 80) hist.shift(); fut.length = 0; };
  const restaurar = (html) => { arte.innerHTML = html; selecionar(null); };

  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const trans = (el) => { const p = (el.style.translate || "0px 0px").split(/\s+/); return [num(p[0], 0), num(p[1], 0)]; };
  const hex = (c) => { const m = String(c).match(/[\d.]+/g); if (!m || m.length < 3) return "#ffffff"; return "#" + m.slice(0, 3).map((x) => Math.round(+x).toString(16).padStart(2, "0")).join(""); };
  const ehInline = (el) => getComputedStyle(el).display.startsWith("inline") && !/^(IMG|SVG|VIDEO|BUTTON)$/i.test(el.tagName);
  const alvoDe = (t) => {
    let el = t && t.closest ? t : null;
    if (el && el.closest("svg") && el.tagName.toLowerCase() !== "svg") el = el.closest("svg");
    while (el && !fundo.has(el) && ehInline(el) && el.parentElement && !fundo.has(el.parentElement)) el = el.parentElement;
    return el && !fundo.has(el) && !el.classList.contains("__ed") && arte.contains(el) ? el : null;
  };

  // títulos/parágrafos (só texto e inline dentro): caixa justa no texto, não na largura do bloco
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    if (![...el.children].every((c) => ehInline(c)) || !(el.textContent || "").trim()) return r;
    const rg = doc.createRange(); rg.selectNodeContents(el); const t = rg.getBoundingClientRect();
    return t.width > 0 && t.width < r.width ? t : r;
  };
  const desenhar = () => {
    if (!sel || !sel.isConnected) { box.style.display = alca.style.display = "none"; return; }
    const r = rect(sel);
    Object.assign(box.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    Object.assign(alca.style, { display: editando ? "none" : "block", left: (r.right - 13) + "px", top: (r.bottom - 13) + "px" });
  };
  const info = () => {
    if (!sel) return post({ t: "sel", sel: null, undo: hist.length > 0, redo: fut.length > 0 });
    const cs = getComputedStyle(sel);
    post({ t: "sel", undo: hist.length > 0, redo: fut.length > 0, sel: {
      tag: sel.tagName.toLowerCase(), texto: (sel.innerText || "").trim().slice(0, 80), temTexto: !!(sel.innerText || "").trim(),
      fonte: Math.round(num(cs.fontSize, 16)), cor: hex(cs.color), opacidade: num(cs.opacity, 1),
      rotacao: num(sel.style.rotate, 0), escala: num(sel.style.scale, 1), pai: !!(sel.parentElement && !fundo.has(sel.parentElement)),
    } });
  };
  const selecionar = (el) => { if (editando && editando !== el) fimTexto(); sel = el; desenhar(); info(); };

  // texto: duplo clique edita no lugar (mantém spans e cores do original)
  const fimTexto = () => { if (!editando) return; editando.removeAttribute("contenteditable"); editando = null; desenhar(); info(); };
  doc.addEventListener("dblclick", (e) => {
    const el = alvoDe(e.target); if (!el || !(el.innerText || "").trim()) return;
    salvar(); selecionar(el); editando = el; el.setAttribute("contenteditable", "true"); el.focus();
    const s = getSelection(); const rg = doc.createRange(); rg.selectNodeContents(el); s.removeAllRanges(); s.addRange(rg); desenhar();
  });
  doc.addEventListener("input", desenhar);

  // arrastar (mover) e alça (tamanho)
  let acao = null;
  doc.addEventListener("pointerdown", (e) => {
    window.focus();
    if (e.target === alca && sel) {
      const r = rect(sel), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      acao = { tipo: "escala", cx, cy, d0: Math.hypot(e.clientX - cx, e.clientY - cy) || 1, s0: num(sel.style.scale, 1), feito: false };
      alca.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }
    if (editando && editando.contains(e.target)) return;
    const el = alvoDe(e.target);
    selecionar(el);
    if (!el) return;
    const [x0, y0] = trans(el);
    acao = { tipo: "mover", el, px: e.clientX, py: e.clientY, x0, y0, feito: false };
    e.preventDefault();
  });
  doc.addEventListener("pointermove", (e) => {
    if (!acao) { const el = alvoDe(e.target); if (el && el !== sel) { const r = rect(el); Object.assign(hover.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" }); } else hover.style.display = "none"; return; }
    hover.style.display = "none";
    if (acao.tipo === "escala") {
      if (!acao.feito) { salvar(); acao.feito = true; }
      const s = Math.max(0.05, acao.s0 * Math.hypot(e.clientX - acao.cx, e.clientY - acao.cy) / acao.d0);
      sel.style.scale = String(+s.toFixed(3)); desenhar(); return;
    }
    const dx = e.clientX - acao.px, dy = e.clientY - acao.py;
    if (!acao.feito && Math.hypot(dx, dy) < 3) return;
    if (!acao.feito) { salvar(); acao.feito = true; }
    let nx = acao.x0 + dx, ny = acao.y0 + dy;
    acao.el.style.translate = nx + "px " + ny + "px";
    // ímã no centro do quadro
    const r = rect(acao.el), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const mx = Math.abs(cx - W / 2) < 8, my = Math.abs(cy - H / 2) < 8;
    if (mx) nx += W / 2 - cx; if (my) ny += H / 2 - cy;
    if (mx || my) acao.el.style.translate = Math.round(nx) + "px " + Math.round(ny) + "px";
    guiaV.style.display = mx ? "block" : "none"; guiaH.style.display = my ? "block" : "none";
    desenhar();
  });
  doc.addEventListener("pointerup", () => { if (acao && acao.feito) info(); acao = null; guiaV.style.display = guiaH.style.display = "none"; });

  const comandos = {
    undo() { if (!hist.length) return; fut.push(arte.innerHTML); restaurar(hist.pop()); },
    redo() { if (!fut.length) return; hist.push(arte.innerHTML); restaurar(fut.pop()); },
    apagar() { if (!sel) return; salvar(); sel.remove(); selecionar(null); },
    duplicar() { if (!sel) return; salvar(); const c = sel.cloneNode(true); const [x, y] = trans(sel); c.style.translate = (x + 24) + "px " + (y + 24) + "px"; sel.after(c); selecionar(c); },
    pai() { if (sel && sel.parentElement && !fundo.has(sel.parentElement)) selecionar(sel.parentElement); },
    frente() { if (!sel) return; salvar(); if (getComputedStyle(sel).position === "static") sel.style.position = "relative"; sel.style.zIndex = String(num(getComputedStyle(sel).zIndex, 0) + 1); info(); },
    tras() { if (!sel) return; salvar(); if (getComputedStyle(sel).position === "static") sel.style.position = "relative"; sel.style.zIndex = String(num(getComputedStyle(sel).zIndex, 0) - 1); info(); },
    resetar() { if (!sel) return; salvar(); sel.style.translate = sel.style.scale = sel.style.rotate = ""; desenhar(); info(); },
    texto() {
      salvar();
      const ref = arte.querySelector("h1,h2,[class*=head],p") || arte, cs = getComputedStyle(ref);
      const d = doc.createElement("div"); d.textContent = "Novo texto";
      d.style.cssText = "position:absolute;left:" + Math.round(W * 0.3) + "px;top:" + Math.round(H * 0.45) + "px;z-index:50;font-family:" + cs.fontFamily + ";font-weight:700;font-size:" + Math.round(W * 0.06) + "px;color:" + cs.color + ";white-space:nowrap";
      arte.appendChild(d); selecionar(d);
    },
    marco() { if (sel) salvar(); },
    prop(k, v) { if (!sel) return; salvar(); comandos.live(k, v); },
    live(k, v) {
      if (!sel) return;
      if (k === "fonte") sel.style.fontSize = Math.max(6, v) + "px";
      if (k === "cor") sel.style.color = v;
      if (k === "opacidade") sel.style.opacity = String(v);
      if (k === "rotacao") sel.style.rotate = v + "deg";
      if (k === "escala") sel.style.scale = String(v);
      desenhar(); info();
    },
    exportar() {
      fimTexto();
      const c = doc.documentElement.cloneNode(true);
      c.querySelectorAll(".__ed,#__ed_script,#__ed_style").forEach((n) => n.remove());
      c.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
      post({ t: "html", html: "<!DOCTYPE html>\n" + c.outerHTML });
    },
  };

  doc.addEventListener("keydown", (e) => {
    if (editando) { if (e.key === "Escape") { e.preventDefault(); fimTexto(); } return; }
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? comandos.redo() : comandos.undo(); return; }
    if (ctrl && k.toLowerCase() === "y") { e.preventDefault(); comandos.redo(); return; }
    if (ctrl && k.toLowerCase() === "d") { e.preventDefault(); comandos.duplicar(); return; }
    if (!sel) return;
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); comandos.apagar(); return; }
    if (k === "Escape") { e.preventDefault(); sel.parentElement && !fundo.has(sel.parentElement) ? comandos.pai() : selecionar(null); return; }
    const passo = e.shiftKey ? 10 : 1, mv = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[k];
    if (mv) { e.preventDefault(); salvar(); const [x, y] = trans(sel); sel.style.translate = (x + mv[0]) + "px " + (y + mv[1]) + "px"; desenhar(); }
  });

  window.addEventListener("message", (e) => {
    if (e.source !== parent || !e.data || !e.data.__editor) return;
    const f = comandos[e.data.cmd]; if (f) f(e.data.k, e.data.v);
  });
  window.addEventListener("resize", desenhar);
  post({ t: "pronto" });
  info();
})();`;

export const EDITOR_STYLE = `[contenteditable]{outline:none;cursor:text}*{cursor:default}`;
