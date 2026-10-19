/**
 * Runtime da EDIÇÃO (vai para assets/edicao.js), dentro da composição HyperFrames: determinístico, tudo no timeline.
 *  - encaixa o texto de cada animação e de cada bloco de legenda na caixa calculada pelo montador;
 *  - entradas com cara de 3D (perspectiva + rotação + profundidade) e saída curta;
 *  - legenda: o bloco entra/sai com a fala, a palavra falada ganha o destaque do estilo (--on);
 *  - zoom e efeitos no próprio vídeo (inclinar em 3D, flash, tremor, P&B, vinheta, desfoque).
 */
export const EDICAO_JS = String.raw`(function () {
  "use strict";
  var gsap = window.gsap;
  function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }

  var E = {};
  E.init = function (D) {
    var W = D.w, H = D.h, tl = gsap.timeline({ paused: true });
    E.D = D;
    encaixarTudo();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(encaixarTudo);

    var video = document.getElementById("fonte");
    D.zooms.forEach(function (z) { zoom(tl, video, z); });
    D.efeitos.forEach(function (f) { efeito(tl, video, f, W, H); });
    D.overlays.forEach(function (o) { overlay(tl, o, W, H); });
    D.legendas.forEach(function (l, k) { legenda(tl, l, D.legendas[k + 1], D.estilo, H); });
    tl.set({}, {}, D.total); // timeline com a duração exata
    return tl;
  };

  // ── Encaixe: reduz a escala (--k) até caber na caixa; legenda reduz a fonte até caber na largura ──
  function encaixar(box) {
    var k = 1; box.style.setProperty("--k", "1");
    for (var n = 0; n < 50 && (box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1 || filhoLargo(box)); n++) { k *= 0.95; box.style.setProperty("--k", k.toFixed(3)); }
  }
  function filhoLargo(box) { return $$("[data-p], .ov-card", box).some(function (e) { return e.offsetWidth > box.clientWidth + 1; }); }
  function encaixarTudo() {
    $$(".ov-box").forEach(encaixar);
    $$(".lg").forEach(function (l) {
      var i = l.firstElementChild; i.style.fontSize = "";
      for (var n = 0; n < 30 && (i.offsetWidth > l.clientWidth + 1 || i.offsetHeight > l.clientHeight + 1); n++) i.style.fontSize = (parseFloat(getComputedStyle(i).fontSize) * 0.94) + "px";
    });
  }

  // ── Entradas 3D ──
  function de(entrada, W, H) {
    switch (entrada) {
      case "orbita": return { rotationY: 78, x: -W * 0.18, z: -600, opacity: 0, transformOrigin: "50% 50% -200px" };
      case "profundidade": return { z: -1600, opacity: 0, filter: "blur(14px)", rotationX: 18 };
      case "dobra": return { rotationX: 92, transformOrigin: "50% 100%", opacity: 0, y: H * 0.02 };
      case "pop": return { scale: 0, rotation: -14, opacity: 0 };
      case "deslize": return { x: -W * 0.7, skewX: 28, opacity: 0, filter: "blur(10px)" };
      default: return { rotationX: -96, transformOrigin: "50% 0%", z: -200, opacity: 0 }; // flip
    }
  }
  var ENT = { orbita: "expo.out", profundidade: "expo.out", dobra: "back.out(1.4)", pop: "back.out(2.2)", deslize: "expo.out", flip: "back.out(1.3)" };

  function overlay(tl, o, W, H) {
    var sec = document.getElementById("o" + o.i); if (!sec) return;
    var box = sec.querySelector(".ov-box"), corpo = box.firstElementChild, dur = o.e - o.s, t = o.s;
    var dEnt = Math.min(0.85, dur * 0.3);
    var ini = de(o.entrada, W, H);
    var fim = { x: 0, y: 0, z: 0, scale: 1, rotation: 0, rotationX: 0, rotationY: 0, skewX: 0, opacity: 1, filter: "blur(0px)", duration: dEnt, ease: ENT[o.entrada] || "expo.out" };
    tl.fromTo(corpo, ini, fim, t);
    // palavras do título caem uma a uma em 3D (dobram para a frente)
    var ws = $$(".owi", sec);
    if (ws.length) tl.fromTo(ws, { rotationX: -90, opacity: 0, y: H * 0.01 }, { rotationX: 0, opacity: 1, y: 0, duration: 0.55, ease: "back.out(1.6)", stagger: 0.06 }, t + dEnt * 0.35);
    var itens = $$("[data-item]", sec);
    if (itens.length) tl.fromTo(itens, { x: -W * 0.08, rotationY: 40, opacity: 0 }, { x: 0, rotationY: 0, opacity: 1, duration: 0.5, ease: "expo.out", stagger: Math.min(0.35, (dur - 1.5) / Math.max(1, itens.length)) }, t + dEnt * 0.6);
    $$(".ov-barra", sec).forEach(function (b) { tl.fromTo(b, { scaleY: 0 }, { scaleY: 1, duration: 0.5, ease: "expo.out" }, t + 0.1); });
    $$(".ov-num", sec).forEach(function (nu) {
      var v = +nu.getAttribute("data-valor") || 0, pre = nu.getAttribute("data-pre") || "", suf = nu.getAttribute("data-suf") || "", c = { v: 0 };
      var casas = String(v).indexOf(".") >= 0 ? 1 : 0;
      tl.to(c, { v: v, duration: Math.min(1.4, dur * 0.5), ease: "power3.out", onUpdate: function () { nu.textContent = pre + c.v.toFixed(casas).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".") + suf; } }, t + 0.2);
    });
    $$(".ov-brilho", sec).forEach(function (b) { tl.fromTo(b, { xPercent: -260 }, { xPercent: 460, duration: 0.9, ease: "power2.inOut", repeat: Math.max(0, Math.floor((dur - 1.4) / 1.8)), repeatDelay: 0.9 }, t + dEnt); });
    if (o.tipo === "emoji") tl.to(corpo, { y: -H * 0.012, rotation: 6, duration: 0.45, ease: "sine.inOut", yoyo: true, repeat: Math.max(1, Math.floor((dur - dEnt - 0.5) / 0.45)) | 1 }, t + dEnt);
    // enquanto está na tela: balanço 3D sutil (nunca fica chapado)
    else if (dur > dEnt + 0.9) tl.fromTo(box, { rotationY: -4, rotationX: 2 }, { rotationY: 4, rotationX: -2, duration: dur - dEnt - 0.4, ease: "sine.inOut" }, t + dEnt * 0.5);
    // saída: recua em profundidade
    tl.to(corpo, { opacity: 0, z: -360, rotationX: 24, filter: "blur(8px)", duration: Math.min(0.35, dur * 0.15), ease: "power2.in" }, o.e - Math.min(0.35, dur * 0.15));
  }

  // ── Legenda ──
  var ACUMULA = { karaoke: true, neon: true, profundidade: true }; // palavra acesa continua acesa no bloco
  function legenda(tl, l, prox, estilo, H) {
    var e = document.getElementById("l" + l.n); if (!e) return;
    var dentro = e.firstElementChild, ws = $$(".lw", e);
    var dEnt = Math.min(0.2, (l.e - l.s) / 3);
    tl.set(e, { visibility: "visible" }, l.s);
    if (estilo === "profundidade") tl.fromTo(dentro, { rotationX: -90, opacity: 0, transformOrigin: "50% 100%" }, { rotationX: 0, opacity: 1, duration: dEnt + 0.1, ease: "back.out(1.5)" }, l.s);
    else if (estilo === "palavra") tl.fromTo(dentro, { scale: 0.45, opacity: 0 }, { scale: 1, opacity: 1, duration: dEnt, ease: "back.out(3)" }, l.s);
    else if (estilo === "impacto") tl.fromTo(dentro, { scale: 0.8, opacity: 0, y: H * 0.01 }, { scale: 1, opacity: 1, y: 0, duration: dEnt, ease: "back.out(2)" }, l.s);
    else tl.fromTo(dentro, { opacity: 0, y: H * 0.01 }, { opacity: 1, y: 0, duration: dEnt, ease: "power2.out" }, l.s);
    ws.forEach(function (w, k) {
      var s = l.p[k]; if (s == null) return;
      tl.fromTo(w, { "--on": 0 }, { "--on": 1, duration: 0.1, ease: "none", immediateRender: false }, s);
      if (!ACUMULA[estilo] && k < ws.length - 1 && l.p[k + 1] != null) tl.to(w, { "--on": 0, duration: 0.1, ease: "none" }, l.p[k + 1]);
    });
    // sai junto com a chegada do próximo bloco (sem buraco) ou com um respiro depois da fala
    var dSai = Math.min(0.14, (l.e - l.s) / 4);
    tl.to(dentro, { opacity: 0, duration: dSai, ease: "power1.in" }, l.e - dSai);
    tl.set(e, { visibility: "hidden" }, l.e);
  }

  // ── No próprio vídeo ──
  function zoom(tl, v, z) {
    var dur = z.end - z.start, ida = Math.min(0.35, dur / 3);
    var origem = (z.x * 100).toFixed(1) + "% " + (z.y * 100).toFixed(1) + "%";
    tl.fromTo(v, { scale: 1, transformOrigin: origem }, { scale: z.escala, duration: ida, ease: dur < 1.2 ? "power4.out" : "power3.inOut", immediateRender: false }, z.start);
    tl.to(v, { scale: 1, duration: ida, ease: "power2.inOut" }, z.end - ida);
  }
  function efeito(tl, v, f, W, H) {
    var dur = f.end - f.start, ida = Math.min(0.5, dur / 3), palco = document.getElementById("palco");
    if (f.tipo === "inclinar") {
      tl.fromTo(palco, { rotationY: 0, rotationX: 0, scale: 1 }, { rotationY: -16, rotationX: 7, scale: 0.84, duration: ida, ease: "power3.inOut", immediateRender: false }, f.start);
      tl.fromTo(v, { borderRadius: 0, boxShadow: "0 0 0 rgba(0,0,0,0)" }, { borderRadius: W * 0.04, boxShadow: "0 " + H * 0.03 + "px " + H * 0.06 + "px rgba(0,0,0,.6)", duration: ida, immediateRender: false }, f.start);
      tl.to(palco, { rotationY: 0, rotationX: 0, scale: 1, duration: ida, ease: "power3.inOut" }, f.end - ida);
      tl.to(v, { borderRadius: 0, boxShadow: "0 0 0 rgba(0,0,0,0)", duration: ida }, f.end - ida);
    } else if (f.tipo === "flash") {
      var fl = document.getElementById("fx-flash");
      tl.fromTo(fl, { opacity: 0 }, { opacity: 0.85, duration: 0.06, immediateRender: false }, f.start);
      tl.to(fl, { opacity: 0, duration: Math.max(0.2, Math.min(0.6, dur)), ease: "power2.out" }, f.start + 0.06);
    } else if (f.tipo === "tremor") {
      var passos = Math.min(40, Math.floor(dur / 0.05));
      for (var i = 0; i < passos; i++) {
        var a = (1 - i / passos) * W * 0.012;
        tl.to(palco, { x: Math.sin(i * 2.3) * a, y: Math.cos(i * 3.1) * a, duration: 0.05, ease: "none" }, f.start + i * 0.05);
      }
      tl.to(palco, { x: 0, y: 0, duration: 0.05 }, f.start + passos * 0.05);
    } else if (f.tipo === "vinheta") {
      var vi = document.getElementById("fx-vinheta");
      tl.fromTo(vi, { opacity: 0 }, { opacity: 1, duration: ida, immediateRender: false }, f.start);
      tl.to(vi, { opacity: 0, duration: ida }, f.end - ida);
    } else {
      // mesma lista de funções nos dois lados: o GSAP interpola número a número
      var filtro = f.tipo === "pb" ? "grayscale(1) contrast(1.1) blur(0px) brightness(1)" : "grayscale(0) contrast(1) blur(" + (W * 0.008).toFixed(1) + "px) brightness(.8)";
      tl.fromTo(v, { filter: "grayscale(0) contrast(1) blur(0px) brightness(1)" }, { filter: filtro, duration: ida, immediateRender: false }, f.start);
      tl.to(v, { filter: "grayscale(0) contrast(1) blur(0px) brightness(1)", duration: ida }, f.end - ida);
    }
  }

  window.E = E;
})();`;
