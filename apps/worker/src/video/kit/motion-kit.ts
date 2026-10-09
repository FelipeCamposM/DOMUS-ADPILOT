/**
 * DOMUS Motion Kit — o "design system" dos vídeos. A IA não anima tudo do zero: ela monta cenas com estes blocos,
 * que já trazem tipografia, grade, ritmo, easing e profundidade bem resolvidos (é o que separa motion de "PowerPoint").
 *
 * Roda dentro da composição HyperFrames (Chrome headless, quadro a quadro), então tudo é determinístico: só GSAP no
 * timeline principal, PRNG com semente, nada de Math.random/Date/rede. O arquivo vai para assets/motion-kit.js.
 * API documentada em KIT_DOC (o mesmo texto vai para o prompt da IA).
 */
export const MOTION_KIT_JS = String.raw`(function () {
  "use strict";
  var gsap = window.gsap;
  var MK = { version: "1.0" };
  var seed = 20261008;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  function $(x) { return typeof x === "string" ? document.querySelector(x) : x; }
  function $$(x) { return typeof x === "string" ? Array.prototype.slice.call(document.querySelectorAll(x)) : Array.isArray(x) ? x : [x]; }
  function el(tag, cls, parent, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
  MK.rand = rnd;
  MK.seed = function (s) { seed = s || 1; };

  // ── Tokens de movimento: poucos easings, sempre os mesmos (ritmo consistente) ──
  MK.ease = { enter: "expo.out", move: "power4.inOut", snap: "back.out(1.7)", soft: "sine.inOut", exit: "power3.in", spring: "elastic.out(1, 0.55)" };
  MK.dur = { fast: 0.35, base: 0.6, slow: 1.1, scene: 0.9 };

  var CSS = [
    ":root{--mk-u:10px}",
    "#root{perspective:calc(var(--mk-u)*140);perspective-origin:50% 45%;background:var(--mk-bg);color:var(--mk-text);font-family:var(--mk-font),system-ui,sans-serif;overflow:hidden}",
    ".clip{transform-style:preserve-3d}",
    ".mk-layer{position:absolute;inset:0;pointer-events:none}",
    ".mk-blob{position:absolute;border-radius:50%;filter:blur(calc(var(--mk-u)*9));opacity:.55}",
    ".mk-grid{position:absolute;inset:-5%;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:calc(var(--mk-u)*6) calc(var(--mk-u)*6);-webkit-mask-image:radial-gradient(ellipse 75% 65% at 50% 45%,#000 25%,transparent 78%);mask-image:radial-gradient(ellipse 75% 65% at 50% 45%,#000 25%,transparent 78%)}",
    ".mk-vignette{position:absolute;inset:0;background:radial-gradient(ellipse 85% 75% at 50% 45%,transparent 45%,rgba(0,0,0,.72) 100%)}",
    ".mk-scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 3px);mix-blend-mode:overlay}",
    ".mk-dot{position:absolute;width:calc(var(--mk-u)*.45);height:calc(var(--mk-u)*.45);border-radius:50%;background:var(--mk-accent);box-shadow:0 0 calc(var(--mk-u)*1.2) var(--mk-accent)}",
    ".mk-hud{position:absolute;inset:calc(var(--mk-u)*4);pointer-events:none;z-index:50;font-family:var(--mk-mono),ui-monospace,monospace;font-size:calc(var(--mk-u)*1.35);letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.55)}",
    ".mk-corner{position:absolute;width:calc(var(--mk-u)*3.2);height:calc(var(--mk-u)*3.2);border-color:color-mix(in srgb,var(--mk-accent) 70%,transparent);border-style:solid;border-width:0}",
    ".mk-c1{left:0;top:0;border-left-width:2px;border-top-width:2px}.mk-c2{right:0;top:0;border-right-width:2px;border-top-width:2px}.mk-c3{left:0;bottom:0;border-left-width:2px;border-bottom-width:2px}.mk-c4{right:0;bottom:0;border-right-width:2px;border-bottom-width:2px}",
    ".mk-hud-tl{position:absolute;left:calc(var(--mk-u)*4.5);top:calc(var(--mk-u)*.9)}.mk-hud-tr{position:absolute;right:calc(var(--mk-u)*4.5);top:calc(var(--mk-u)*.9)}.mk-hud-bl{position:absolute;left:calc(var(--mk-u)*4.5);bottom:calc(var(--mk-u)*.9)}.mk-hud-br{position:absolute;right:calc(var(--mk-u)*4.5);bottom:calc(var(--mk-u)*.9)}",
    ".mk-progress{position:absolute;left:0;right:0;bottom:calc(var(--mk-u)*-1.6);height:2px;background:rgba(255,255,255,.08)}.mk-progress i{display:block;height:100%;width:100%;background:var(--mk-accent);transform-origin:left;box-shadow:0 0 calc(var(--mk-u)*1.2) var(--mk-accent)}",
    ".mk-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 calc(var(--mk-u)*8);gap:calc(var(--mk-u)*2.4)}",
    ".mk-display{font-weight:800;font-size:calc(var(--mk-u)*15);line-height:.95;letter-spacing:-.045em}",
    ".mk-h1{font-weight:800;font-size:calc(var(--mk-u)*10);line-height:1.02;letter-spacing:-.035em}",
    ".mk-h2{font-weight:700;font-size:calc(var(--mk-u)*6.6);line-height:1.1;letter-spacing:-.025em}",
    ".mk-sub{font-size:calc(var(--mk-u)*3.4);line-height:1.35;color:color-mix(in srgb,var(--mk-text) 72%,transparent);font-weight:500}",
    ".mk-label{font-family:var(--mk-mono),ui-monospace,monospace;font-size:calc(var(--mk-u)*2);letter-spacing:.16em;text-transform:uppercase;color:var(--mk-accent)}",
    ".mk-word{display:inline-block;white-space:pre;will-change:transform,opacity,filter}",
    ".mk-mask{display:inline-block;overflow:hidden;vertical-align:bottom;padding-bottom:.08em}",
    ".mk-hl{color:var(--mk-accent);text-shadow:0 0 calc(var(--mk-u)*2.2) color-mix(in srgb,var(--mk-accent) 70%,transparent)}",
    ".mk-glass{position:relative;border-radius:calc(var(--mk-u)*2.4);background:linear-gradient(160deg,color-mix(in srgb,var(--mk-accent) 14%,transparent),rgba(255,255,255,.025));border:1px solid color-mix(in srgb,var(--mk-accent) 55%,transparent);box-shadow:0 0 calc(var(--mk-u)*5) color-mix(in srgb,var(--mk-accent) 22%,transparent),inset 0 1px 0 rgba(255,255,255,.12);backdrop-filter:blur(calc(var(--mk-u)*1.4));padding:calc(var(--mk-u)*3);transform-style:preserve-3d}",
    ".mk-prompt{display:flex;align-items:center;gap:calc(var(--mk-u)*1.4);font-family:var(--mk-mono),ui-monospace,monospace;font-size:calc(var(--mk-u)*3);text-align:left;min-width:70%}",
    ".mk-prompt:before{content:'›';color:var(--mk-accent);font-weight:700}",
    ".mk-caret{display:inline-block;width:.55em;height:1.05em;background:var(--mk-accent);vertical-align:text-bottom;margin-left:2px;box-shadow:0 0 calc(var(--mk-u)) var(--mk-accent)}",
    ".mk-ring{position:absolute;border-radius:50%;border:2px solid var(--mk-accent);box-shadow:0 0 calc(var(--mk-u)*2) color-mix(in srgb,var(--mk-accent) 60%,transparent);transform:translate(-50%,-50%)}",
    ".mk-cross{position:absolute;background:color-mix(in srgb,var(--mk-accent) 60%,transparent)}",
    ".mk-chip{display:inline-flex;align-items:center;gap:calc(var(--mk-u)*.8);padding:calc(var(--mk-u)*1) calc(var(--mk-u)*2);border-radius:999px;border:1px solid color-mix(in srgb,var(--mk-accent) 55%,transparent);background:color-mix(in srgb,var(--mk-accent) 10%,transparent);font-weight:600;font-size:calc(var(--mk-u)*3)}",
    ".mk-btn{display:inline-flex;align-items:center;justify-content:center;gap:calc(var(--mk-u)*1.2);padding:calc(var(--mk-u)*2.2) calc(var(--mk-u)*4.6);border-radius:999px;background:var(--mk-accent);color:var(--mk-bg);font-weight:800;font-size:calc(var(--mk-u)*4.2);position:relative;overflow:hidden;box-shadow:0 0 calc(var(--mk-u)*6) color-mix(in srgb,var(--mk-accent) 60%,transparent)}",
    ".mk-shine{position:absolute;top:-50%;bottom:-50%;width:30%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);transform:skewX(-20deg)}",
    ".mk-marquee{position:absolute;left:-30%;right:-30%;white-space:nowrap;font-weight:900;font-size:calc(var(--mk-u)*7);letter-spacing:-.02em;text-transform:uppercase;padding:calc(var(--mk-u)*1) 0}",
    ".mk-flash{position:absolute;inset:0;background:var(--mk-accent);z-index:60;opacity:0}",
    ".mk-sweep{position:absolute;top:-20%;bottom:-20%;width:35%;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--mk-accent) 35%,transparent),rgba(255,255,255,.35),color-mix(in srgb,var(--mk-accent) 35%,transparent),transparent);transform:skewX(-18deg);z-index:55;opacity:0;mix-blend-mode:screen}",
    ".mk-line{position:absolute;height:2px;background:var(--mk-accent);box-shadow:0 0 calc(var(--mk-u)*1.4) var(--mk-accent);transform-origin:left}",
  ].join("\n");

  // ── Init: fundo vivo, HUD, timeline principal ──
  MK.init = function (o) {
    o = o || {};
    var root = $(o.root || "#root");
    var W = +root.getAttribute("data-width") || 1080, H = +root.getAttribute("data-height") || 1920;
    var total = o.total || +root.getAttribute("data-duration") || 10;
    root.style.setProperty("--mk-u", (Math.min(W, H) / 100) + "px");
    root.style.setProperty("--mk-accent", o.accent || "#A855FF");
    root.style.setProperty("--mk-bg", o.bg || "#07070A");
    root.style.setProperty("--mk-text", o.text || "#FAFAFC");
    root.style.setProperty("--mk-font", o.font ? "'" + o.font + "'" : "'Plus Jakarta Sans'");
    root.style.setProperty("--mk-mono", o.mono ? "'" + o.mono + "'" : "'JetBrains Mono'");
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    MK.W = W; MK.H = H; MK.total = total; MK.root = root;
    var tl = gsap.timeline({ paused: true });
    MK.tl = tl;
    window.__timelines = window.__timelines || {};
    window.__timelines[o.id || root.getAttribute("data-composition-id") || "main"] = tl;

    // fundo: blobs que derivam devagar, grade, partículas flutuando, vinheta e scanlines
    var bg = el("div", "mk-layer", root); bg.style.zIndex = 0; root.insertBefore(bg, root.firstChild);
    var cores = [o.accent || "#A855FF", o.accent2 || o.accent || "#A855FF"];
    for (var i = 0; i < 3; i++) {
      var b = el("div", "mk-blob", bg); var s = (45 + rnd() * 30) * Math.min(W, H) / 100;
      b.style.width = s + "px"; b.style.height = s + "px"; b.style.background = "radial-gradient(circle," + cores[i % 2] + ",transparent 65%)";
      gsap.set(b, { x: rnd() * W - s / 2, y: rnd() * H * .8 - s / 2, opacity: .18 + rnd() * .22 });
      tl.to(b, { x: "+=" + ((rnd() - .5) * W * .5), y: "+=" + ((rnd() - .5) * H * .3), scale: .8 + rnd() * .5, duration: total, ease: "sine.inOut" }, 0);
    }
    if (o.grid !== false) { var g = el("div", "mk-grid", bg); tl.fromTo(g, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 1.6, ease: MK.ease.enter }, 0); tl.to(g, { y: -Math.min(W, H) * .06, duration: total, ease: "none" }, 0); }
    var n = o.particles == null ? 46 : o.particles;
    for (var p = 0; p < n; p++) {
      var d = el("div", "mk-dot", bg);
      gsap.set(d, { x: rnd() * W, y: rnd() * H, scale: .4 + rnd() * .9, opacity: 0 });
      tl.to(d, { opacity: .15 + rnd() * .55, duration: 1.2, ease: "sine.out" }, rnd() * 1.5);
      tl.to(d, { y: "-=" + (H * (.05 + rnd() * .12)), x: "+=" + ((rnd() - .5) * W * .08), duration: total, ease: "none" }, 0);
    }
    el("div", "mk-vignette", bg); if (o.scanlines !== false) el("div", "mk-scan", bg);

    if (o.hud !== false) {
      var hud = el("div", "mk-hud", root);
      ["mk-c1", "mk-c2", "mk-c3", "mk-c4"].forEach(function (c) { el("div", "mk-corner " + c, hud); });
      el("div", "mk-hud-tl", hud, o.label || "");
      var tc = el("div", "mk-hud-tr", hud, "00:00:00");
      el("div", "mk-hud-bl", hud, o.footer || "");
      MK.hudBR = el("div", "mk-hud-br", hud, o.status || "");
      var pr = el("div", "mk-progress", hud); var bar = el("i", "", pr);
      var t = { v: 0 };
      tl.to(t, { v: total, duration: total, ease: "none", onUpdate: function () { var f = Math.floor(t.v * 30) % 30, sc = Math.floor(t.v) % 60, mi = Math.floor(t.v / 60); tc.textContent = pad(mi) + ":" + pad(sc) + ":" + pad(f); } }, 0);
      tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: total, ease: "none" }, 0);
      tl.fromTo(hud, { opacity: 0 }, { opacity: 1, duration: 1, ease: "sine.out" }, .1);
      tl.fromTo(hud.querySelectorAll(".mk-corner"), { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: .9, ease: MK.ease.enter, stagger: .06 }, .15);
    }
    MK.flashEl = el("div", "mk-flash", root);
    MK.sweepEl = el("div", "mk-sweep", root);
    return tl;
  };
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  MK.status = function (txt, at) { var e = MK.hudBR; if (!e) return; MK.tl.call(function () { e.textContent = txt; }, null, at); };

  // ── Tipografia cinética ──
  // words: frase montada palavra a palavra; com {words:[{w,start}]} sincroniza com a voz; hl destaca palavras-chave.
  MK.words = function (target, text, o) {
    o = o || {}; var e = $(target); var tl = MK.tl; var at = o.at || 0;
    var hl = (o.hl || []).map(function (x) { return x.toLowerCase(); });
    var palavras = String(text).split(/\s+/).filter(Boolean);
    e.innerHTML = "";
    var spans = palavras.map(function (w, i) {
      var m = el("span", "mk-mask", e); var s = el("span", "mk-word", m, w + (i < palavras.length - 1 ? " " : ""));
      var limpa = w.toLowerCase().replace(/[.,!?;:]/g, "");
      if (hl.indexOf(limpa) >= 0) s.classList.add("mk-hl");
      return s;
    });
    var tempos;
    if (o.words && o.words.length) tempos = palavras.map(function (_, i) { var x = o.words[Math.min(i, o.words.length - 1)]; return x.start; });
    else {
      var dur = o.dur || palavras.length * 0.26, pesos = palavras.map(function (w) { return 0.6 + w.length * 0.12; }), soma = pesos.reduce(function (a, b) { return a + b; }, 0), acc = 0;
      tempos = pesos.map(function (p) { var t = at + acc / soma * dur; acc += p; return t; });
    }
    var estilo = o.style || "rise";
    spans.forEach(function (s, i) {
      var de = estilo === "blur" ? { opacity: 0, filter: "blur(12px)", scale: 1.15 } : estilo === "depth" ? { opacity: 0, z: -400, rotationX: -50, yPercent: 30 } : { yPercent: 110, opacity: 0, rotationX: -40, filter: "blur(6px)" };
      tl.fromTo(s, de, { yPercent: 0, opacity: 1, z: 0, rotationX: 0, scale: 1, filter: "blur(0px)", duration: .55, ease: MK.ease.enter }, tempos[i]);
      if (s.classList.contains("mk-hl")) tl.fromTo(s, { scale: 1 }, { scale: 1.07, duration: .25, ease: "sine.out", yoyo: true, repeat: 1 }, tempos[i] + .25);
    });
    return tempos[tempos.length - 1] + .55;
  };

  // title: manchete grande, letra a letra subindo de dentro de uma máscara, com leve giro 3D
  MK.title = function (target, text, o) {
    o = o || {}; var e = $(target); var at = o.at || 0; e.innerHTML = "";
    var hl = (o.hl || []).map(function (x) { return x.toLowerCase(); });
    var chars = [];
    String(text).split(" ").forEach(function (w, wi, arr) {
      var m = el("span", "mk-mask", e); m.style.marginRight = wi < arr.length - 1 ? ".22em" : "0";
      var destaque = hl.indexOf(w.toLowerCase().replace(/[.,!?;:]/g, "")) >= 0;
      w.split("").forEach(function (c) { var s = el("span", "mk-word" + (destaque ? " mk-hl" : ""), m, c); chars.push(s); });
    });
    MK.tl.fromTo(chars, { yPercent: 115, rotationX: -70, opacity: 0 }, { yPercent: 0, rotationX: 0, opacity: 1, duration: .8, ease: MK.ease.enter, stagger: o.stagger || .025 }, at);
    return at + .8 + chars.length * (o.stagger || .025);
  };

  // typewriter: digita como num campo de prompt (com cursor piscando)
  MK.typewriter = function (target, text, o) {
    o = o || {}; var e = $(target); var at = o.at || 0; var cps = o.cps || 28;
    var span = el("span", "", e); var caret = el("span", "mk-caret", e); var dur = Math.max(.4, text.length / cps); var t = { n: 0 };
    MK.tl.to(t, { n: text.length, duration: dur, ease: "none", onUpdate: function () { span.textContent = text.slice(0, Math.round(t.n)); } }, at);
    MK.tl.fromTo(caret, { opacity: 1 }, { opacity: 0, duration: .45, ease: "steps(1)", repeat: Math.ceil((dur + (o.hold || 1.5)) / .9), yoyo: true }, at);
    return at + dur;
  };

  // counter: número subindo (com prefixo/sufixo e casas decimais)
  MK.counter = function (target, o) {
    var e = $(target); var t = { v: o.from || 0 }; var dec = o.decimals || 0;
    MK.tl.to(t, { v: o.to, duration: o.dur || 1.4, ease: o.ease || "power3.out", onUpdate: function () {
      e.textContent = (o.prefix || "") + t.v.toFixed(dec).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (o.suffix || "");
    } }, o.at || 0);
    return (o.at || 0) + (o.dur || 1.4);
  };

  // ── Superfícies e profundidade ──
  // panel: painel de vidro entrando em 3D (vem do fundo, gira para a frente, borda acende)
  MK.panel = function (targets, o) {
    o = o || {}; var at = o.at || 0;
    var de = o.from === "left" ? { x: -MK.W * .3, rotationY: 45 } : o.from === "right" ? { x: MK.W * .3, rotationY: -45 } : o.from === "bottom" ? { y: MK.H * .2, rotationX: 50 } : { z: -600, rotationX: 28 };
    de.opacity = 0; de.filter = "blur(10px)";
    MK.tl.fromTo($$(targets), de, { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, opacity: 1, filter: "blur(0px)", duration: o.dur || 1.1, ease: MK.ease.enter, stagger: o.stagger || .12 }, at);
    if (o.tilt !== false) MK.tl.to($$(targets), { rotationY: o.tilt || 6, rotationX: -3, duration: (o.hold || 3), ease: MK.ease.soft }, at + (o.dur || 1.1));
    return at + (o.dur || 1.1);
  };

  // cards: pilha que chega do fundo e abre em leque 3D
  MK.cards = function (targets, o) {
    o = o || {}; var at = o.at || 0; var els = $$(targets); var n = els.length; var gap = o.gap == null ? 1 : o.gap;
    MK.tl.fromTo(els, { z: -900, rotationY: 60, opacity: 0, filter: "blur(10px)" }, { z: 0, rotationY: 0, opacity: 1, filter: "blur(0px)", duration: 1, ease: MK.ease.enter, stagger: .1 }, at);
    if (o.fan) els.forEach(function (c, i) { var k = i - (n - 1) / 2; MK.tl.to(c, { rotationY: k * -12 * gap, rotationZ: k * 3 * gap, z: -Math.abs(k) * 80, duration: .9, ease: MK.ease.move }, at + 1); });
    return at + 1 + n * .1;
  };

  // camera: empurrão lento (push-in) com leve giro: dá vida e profundidade a qualquer cena
  MK.camera = function (target, o) {
    o = o || {}; MK.tl.fromTo($(target), { scale: o.from || 1, rotationY: o.rotY ? -o.rotY : 0, rotationX: o.rotX ? o.rotX : 0 }, { scale: o.to || 1.07, rotationY: o.rotY || 0, rotationX: 0, duration: o.dur || 4, ease: "sine.inOut" }, o.at || 0);
  };

  MK.float = function (targets, o) {
    o = o || {}; $$(targets).forEach(function (e, i) { MK.tl.to(e, { y: "-=" + (o.amp || MK.H * .008), duration: o.period || 1.8, ease: "sine.inOut", yoyo: true, repeat: Math.max(1, Math.floor((o.dur || 4) / (o.period || 1.8))) }, (o.at || 0) + i * .15); });
  };

  // ── Gráficos de interface ──
  // ring: alvo com anéis concêntricos e mira, pulsando (marca o "ponto de atenção")
  MK.ring = function (o) {
    o = o || {}; var host = $(o.in || MK.root); var x = o.x == null ? MK.W / 2 : o.x, y = o.y == null ? MK.H / 2 : o.y; var s = o.size || Math.min(MK.W, MK.H) * .18; var at = o.at || 0;
    var g = el("div", "", host); g.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none";
    var rs = [1, .66, .33].map(function (k) { var r = el("div", "mk-ring", g); r.style.cssText += ";left:" + x + "px;top:" + y + "px;width:" + s * k + "px;height:" + s * k + "px"; return r; });
    var h = el("div", "mk-cross", g); h.style.cssText += ";left:" + (x - s * .8) + "px;top:" + y + "px;width:" + s * 1.6 + "px;height:1px";
    var v = el("div", "mk-cross", g); v.style.cssText += ";left:" + x + "px;top:" + (y - s * .8) + "px;width:1px;height:" + s * 1.6 + "px";
    MK.tl.fromTo(rs, { scale: 0, opacity: 0, xPercent: -50, yPercent: -50 }, { scale: 1, opacity: 1, xPercent: -50, yPercent: -50, duration: .9, ease: MK.ease.snap, stagger: .08 }, at);
    MK.tl.fromTo([h, v], { scale: 0 }, { scale: 1, duration: .8, ease: MK.ease.enter }, at + .1);
    MK.tl.to(rs[0], { scale: 1.25, opacity: .25, duration: .9, ease: "sine.inOut", yoyo: true, repeat: o.pulses || 3 }, at + .9);
    return g;
  };

  // chart: desenha uma linha/curva SVG (path) como se o gráfico estivesse sendo traçado
  MK.chart = function (path, o) {
    o = o || {}; var p = $(path); var L = p.getTotalLength ? p.getTotalLength() : 1000;
    gsap.set(p, { strokeDasharray: L, strokeDashoffset: L });
    MK.tl.to(p, { strokeDashoffset: 0, duration: o.dur || 1.6, ease: o.ease || MK.ease.move }, o.at || 0);
  };

  // line: traço de luz que cresce (sublinha, conecta, separa)
  MK.line = function (o) {
    o = o || {}; var host = $(o.in || MK.root); var l = el("div", "mk-line", host);
    l.style.left = (o.x || 0) + "px"; l.style.top = (o.y || MK.H / 2) + "px"; l.style.width = (o.w || MK.W) + "px";
    MK.tl.fromTo(l, { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: o.dur || .9, ease: MK.ease.move }, o.at || 0);
    if (o.out) MK.tl.to(l, { opacity: 0, duration: .4 }, o.out);
    return l;
  };

  // particles: explosão a partir de um ponto, ou convergência para ele (centenas de pontos = "keyframes")
  MK.particles = function (o) {
    o = o || {}; var host = $(o.in || MK.root); var n = o.count || 120; var x = o.x == null ? MK.W / 2 : o.x, y = o.y == null ? MK.H / 2 : o.y; var at = o.at || 0; var r = o.radius || Math.min(MK.W, MK.H) * .45;
    var g = el("div", "mk-layer", host);
    for (var i = 0; i < n; i++) {
      var d = el("div", "mk-dot", g); var a = rnd() * Math.PI * 2, dist = r * (.2 + rnd() * .8);
      var fora = { x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist, opacity: 0, scale: .3 + rnd() };
      var centro = { x: x, y: y, opacity: 1, scale: .6 };
      if (o.mode === "converge") MK.tl.fromTo(d, fora, { x: x + (rnd() - .5) * 20, y: y + (rnd() - .5) * 20, opacity: 1, scale: .6, duration: o.dur || 1.4, ease: MK.ease.move }, at + rnd() * .4);
      else {
        var t0 = at + rnd() * .15, dd = o.dur || 1.8;
        MK.tl.fromTo(d, centro, { x: fora.x, y: fora.y, scale: fora.scale, duration: dd, ease: "expo.out" }, t0);
        MK.tl.to(d, { opacity: 0, duration: dd * .5, ease: "sine.in" }, t0 + dd * .55);
      }
    }
    return g;
  };

  // ── Transições ──
  MK.flash = function (o) { o = o || {}; var at = o.at || 0; MK.tl.fromTo(MK.flashEl, { opacity: 0 }, { opacity: o.max || .95, duration: .08, ease: "none" }, at); MK.tl.to(MK.flashEl, { opacity: 0, duration: o.dur || .45, ease: "power2.out" }, at + .08); };
  MK.sweep = function (o) { o = o || {}; MK.tl.fromTo(MK.sweepEl, { xPercent: -150, x: 0, opacity: 1 }, { xPercent: 0, x: MK.W * 1.3, opacity: 1, duration: o.dur || .8, ease: MK.ease.move }, o.at || 0); };
  // marquee: faixas diagonais de texto atravessando a tela (transição de impacto)
  MK.marquee = function (palavras, o) {
    o = o || {}; var at = o.at || 0; var dur = o.dur || 1.6; var host = el("div", "mk-layer", MK.root); host.style.zIndex = 58; host.style.transform = "rotate(" + (o.angle == null ? -12 : o.angle) + "deg) scale(1.3)";
    var linhas = o.rows || 5; var txt = palavras.join("  ✦  ") + "  ✦  ";
    for (var i = 0; i < linhas; i++) {
      var f = el("div", "mk-marquee", host, txt + txt + txt);
      f.style.top = (8 + i * (84 / linhas)) + "%"; f.style.color = i % 2 ? "var(--mk-bg)" : "var(--mk-accent)"; f.style.background = i % 2 ? "var(--mk-accent)" : "transparent";
      MK.tl.fromTo(f, { xPercent: i % 2 ? -30 : 0 }, { xPercent: i % 2 ? 0 : -30, duration: dur, ease: "none" }, at);
    }
    MK.tl.fromTo(host, { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1.3, duration: .25, ease: "power2.out" }, at);
    MK.tl.to(host, { opacity: 0, duration: .25, ease: "power2.in" }, at + dur - .25);
    return host;
  };
  // in/out genéricos: entrada e saída de qualquer elemento, nos estilos do kit
  MK.in = function (targets, o) {
    o = o || {}; var st = o.style || "rise"; var de = st === "scale" ? { scale: .6, opacity: 0, filter: "blur(10px)" } : st === "depth" ? { z: -700, opacity: 0, filter: "blur(12px)" } : st === "left" ? { x: -MK.W * .15, opacity: 0 } : st === "right" ? { x: MK.W * .15, opacity: 0 } : st === "pop" ? { scale: 0, opacity: 0 } : { y: MK.H * .04, opacity: 0, filter: "blur(8px)" };
    MK.tl.fromTo($$(targets), de, { x: 0, y: 0, z: 0, scale: 1, opacity: 1, filter: "blur(0px)", duration: o.dur || .8, ease: st === "pop" ? MK.ease.snap : MK.ease.enter, stagger: o.stagger || .08 }, o.at || 0);
  };
  MK.out = function (targets, o) {
    o = o || {}; var st = o.style || "up"; var para = st === "zoom" ? { scale: 3.2, opacity: 0, filter: "blur(18px)" } : st === "depth" ? { z: -900, opacity: 0, filter: "blur(14px)" } : st === "blur" ? { opacity: 0, filter: "blur(16px)", scale: 1.08 } : st === "left" ? { x: -MK.W * .2, opacity: 0 } : { y: -MK.H * .05, opacity: 0, filter: "blur(8px)" };
    para.duration = o.dur || .5; para.ease = MK.ease.exit; para.stagger = o.stagger || .03;
    MK.tl.to($$(targets), para, o.at || 0);
  };
  // cta: botão que entra com mola, brilho passando e pulso
  MK.cta = function (target, o) {
    o = o || {}; var b = $(target); var at = o.at || 0; var sh = el("i", "mk-shine", b);
    MK.tl.fromTo(b, { scale: 0, opacity: 0, rotationX: 60 }, { scale: 1, opacity: 1, rotationX: 0, duration: .9, ease: MK.ease.spring }, at);
    MK.tl.fromTo(sh, { xPercent: -200 }, { xPercent: 450, duration: .9, ease: MK.ease.move, repeat: o.shines || 2, repeatDelay: .7 }, at + .5);
    MK.tl.to(b, { scale: 1.05, duration: .5, ease: "sine.inOut", yoyo: true, repeat: o.pulses || 3 }, at + 1);
  };
  // logo: entrada de marca com anéis e flash
  MK.logo = function (target, o) {
    o = o || {}; var at = o.at || 0; var e = $(target);
    MK.tl.fromTo(e, { scale: .3, opacity: 0, rotationY: -90, filter: "blur(16px)" }, { scale: 1, opacity: 1, rotationY: 0, filter: "blur(0px)", duration: 1.2, ease: MK.ease.enter }, at);
    var r = e.getBoundingClientRect(); var rr = MK.root.getBoundingClientRect(); var ok = r.width > 0;
    MK.ring({ x: ok ? r.left - rr.left + r.width / 2 : o.x, y: ok ? r.top - rr.top + r.height / 2 : o.y, size: ok ? Math.max(r.width, r.height) * 1.6 : o.size, at: at + .2, pulses: 1 });
  };

  window.MK = MK;
})();`;

/** Referência da API para o prompt da IA (o "manual" do kit). */
export const KIT_DOC = `MOTION KIT (já carregado: <script src="assets/motion-kit.js"></script> logo depois do GSAP). Use-o SEMPRE: ele é o design system dos vídeos.
Setup (uma vez, depois de montar o HTML das cenas):
  const tl = MK.init({ accent:"#hex", accent2:"#hex", bg:"#hex", text:"#hex", font:"Fonte Títulos", mono:"JetBrains Mono",
                       label:"MARCA / 001", footer:"texto curto", status:"", particles:46, grid:true, hud:true });
  // MK.init cria fundo vivo (blobs, grade, partículas, vinheta), HUD com cantos/timecode/barra de progresso e registra window.__timelines["main"].
  // Use MK.tl (ou o tl retornado) para tudo; todos os métodos recebem {at: segundos absolutos}.
Tipografia:
  MK.words(el, "frase da narração", {at, dur, hl:["palavra","chave"], style:"rise"|"blur"|"depth", words})  // palavra a palavra, sincroniza com a voz
  MK.title(el, "MANCHETE", {at, hl:["palavra"]})          // letra a letra em 3D, de dentro de máscara
  MK.typewriter(el, "texto digitado", {at, cps:28})        // campo de prompt digitando, com cursor
  MK.counter(el, {from, to, at, dur, decimals, prefix, suffix})
Superfícies e profundidade:
  MK.panel(els, {at, from:"depth"|"bottom"|"left"|"right", tilt:6})   // painel de vidro entra em 3D e fica levemente inclinado
  MK.cards(els, {at, fan:true})                            // pilha 3D que abre em leque
  MK.camera(sceneEl, {at, dur, to:1.07, rotY:4})           // push-in lento de câmera (use em TODA cena)
  MK.float(els, {at, dur})                                 // flutuação sutil
Gráficos:
  MK.ring({x, y, size, at, in:sceneEl})                    // alvo/anéis pulsando
  MK.particles({x, y, count:120, mode:"burst"|"converge", at, in:sceneEl})
  MK.chart(svgPathEl, {at, dur})                           // desenha path SVG (stroke) como gráfico
  MK.line({x, y, w, at, in:sceneEl})                       // traço de luz que cresce
Transições (entre cenas, no instante do corte):
  MK.flash({at}) · MK.sweep({at}) · MK.marquee(["PALAVRA","OUTRA"], {at, dur:1.4, angle:-12})
  MK.in(els, {at, style:"rise"|"scale"|"depth"|"pop"|"left"|"right"}) · MK.out(els, {at, style:"up"|"zoom"|"depth"|"blur"|"left"})
Marca/CTA: MK.logo(imgEl, {at}) · MK.cta(btnEl, {at})
Classes prontas: .mk-center (cena centrada) .mk-display .mk-h1 .mk-h2 .mk-sub .mk-label (mono, cor de destaque) .mk-glass (painel)
  .mk-prompt (campo de prompt) .mk-chip .mk-btn (botão CTA) .mk-hl (palavra destacada). Unidade: var(--mk-u) = 1% do lado menor.
Tokens: MK.ease.enter (entradas) · MK.ease.move (deslocamentos) · MK.ease.snap (estalos) · MK.ease.exit (saídas). Não invente outros easings.
MK.rand() é o aleatório determinístico (Math.random é proibido).`;
