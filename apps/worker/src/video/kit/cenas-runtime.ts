/**
 * Runtime das CENAS PRONTAS (vai para assets/cenas.js). Roda dentro da composição HyperFrames, quadro a quadro:
 * determinístico (PRNG com semente, nada de Math.random/Date/rede), tudo no timeline principal do GSAP.
 *
 * O montador (cenas.ts) escreve o HTML de cada cena com papéis marcados (data-a="titulo|sub|item|…"); este runtime:
 *  1. monta o fundo e a moldura do estilo;
 *  2. ENCAIXA o texto: reduz a escala tipográfica (--k) até o conteúdo caber na área segura (nada sai da tela);
 *  3. anima cada papel com a personalidade de movimento do estilo, com entrada curta, tempo de leitura e saída curta;
 *  4. controla a visibilidade das cenas no próprio timeline (a mesma composição funciona fora da HyperFrames, no QA).
 */
export const CENAS_JS = String.raw`(function () {
  "use strict";
  var gsap = window.gsap;
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }
  function el(tag, cls, pai, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (pai) pai.appendChild(e); return e; }

  // ── Personalidade de movimento por estilo ──
  var MOV = {
    hud: { ent: "expo.out", dur: 0.75, stag: 0.06, sai: "power3.in", durSai: 0.4, pulo: "back.out(1.6)" },
    clay: { ent: "elastic.out(1, 0.62)", dur: 1.15, stag: 0.08, sai: "back.in(1.6)", durSai: 0.42, pulo: "elastic.out(1, 0.5)" },
    editorial: { ent: "power3.out", dur: 1.05, stag: 0.09, sai: "power2.in", durSai: 0.5, pulo: "power3.out" },
  };

  var C = {};
  C.init = function (D) {
    var root = document.getElementById("root");
    var W = D.w, H = D.h, T = D.total, est = D.estilo, M = MOV[est] || MOV.hud;
    C.D = D; C.M = M; C.W = W; C.H = H;
    seed = D.semente || 7;
    var tl = gsap.timeline({ paused: true });
    C.tl = tl;

    fundo(root, D, tl);
    encaixarTudo();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(encaixarTudo); // métricas finais das fontes

    D.cenas.forEach(function (c, i) { cena(c, i, tl); });
    return tl;
  };

  // ── Encaixe: o bloco de conteúdo nunca transborda a área segura ──
  // mede pelo LAYOUT (offset*), que ignora as transformações da animação (posições iniciais fora do lugar)
  function altura(box) {
    var f = box.children; if (!f.length) return 0;
    var topo = Infinity, base = -Infinity;
    for (var i = 0; i < f.length; i++) { topo = Math.min(topo, f[i].offsetTop); base = Math.max(base, f[i].offsetTop + f[i].offsetHeight); }
    return base - topo;
  }
  function largo(box) {
    for (var i = 0; i < box.children.length; i++) if (box.children[i].offsetWidth > box.clientWidth + 1) return true;
    // palavra única larga demais (nome longo, número grande) dentro do título/número
    return $$("[data-a=titulo], [data-a=numero], .lista li, .card, .botao", box).some(function (t) {
      var w = 0; $$(".w, .num-v, span, p", t).forEach(function (x) { w = Math.max(w, x.offsetWidth); });
      return w > t.clientWidth + 1;
    });
  }
  function encaixar(box) {
    var k = 1;
    box.style.setProperty("--k", "1");
    for (var n = 0; n < 45 && (altura(box) > box.clientHeight + 1 || largo(box)); n++) { k *= 0.95; box.style.setProperty("--k", k.toFixed(3)); }
  }
  function encaixarTudo() { $$(".conteudo").forEach(encaixar); $$(".leg").forEach(function (l) { for (var n = 0; n < 20 && l.scrollWidth > l.clientWidth + 1; n++) l.style.fontSize = (parseFloat(getComputedStyle(l).fontSize) * 0.94) + "px"; }); }

  // ── Fundo e moldura de cada estilo ──
  function fundo(root, D, tl) {
    var T = D.total, W = D.w, H = D.h, u = Math.min(W, H) / 100;
    var f = el("div", "fundo", null); root.insertBefore(f, root.firstChild);
    if (D.estilo === "hud") {
      for (var i = 0; i < 3; i++) {
        var b = el("div", "blob", f), s = (50 + rnd() * 30) * u;
        b.style.width = b.style.height = s + "px";
        b.style.background = "radial-gradient(circle," + (i % 2 ? "var(--a2)" : "var(--a)") + ",transparent 65%)";
        gsap.set(b, { x: rnd() * W - s / 2, y: rnd() * H * .8 - s / 2, opacity: .16 + rnd() * .14 });
        tl.to(b, { x: "+=" + ((rnd() - .5) * W * .4), y: "+=" + ((rnd() - .5) * H * .25), duration: T, ease: "sine.inOut" }, 0);
      }
      var g = el("div", "grade", f);
      tl.fromTo(g, { opacity: 0 }, { opacity: 1, duration: 1.4, ease: "sine.out" }, 0);
      tl.to(g, { y: -u * 6, duration: T, ease: "none" }, 0);
      for (var p = 0; p < 34; p++) {
        var d = el("div", "ponto", f);
        gsap.set(d, { x: rnd() * W, y: rnd() * H, scale: .4 + rnd() * .8, opacity: .1 + rnd() * .45 });
        tl.to(d, { y: "-=" + (H * (.04 + rnd() * .1)), duration: T, ease: "none" }, 0);
      }
      el("div", "vinheta", f);
      var hud = el("div", "hud", root);
      ["c1", "c2", "c3", "c4"].forEach(function (c) { el("i", "canto " + c, hud); });
      el("div", "hud-rotulo", hud, D.rotulo || "");
      var pr = el("div", "hud-prog", hud), bar = el("i", "", pr);
      tl.fromTo(hud, { opacity: 0 }, { opacity: 1, duration: .9, ease: "sine.out" }, .1);
      tl.fromTo($$(".canto", hud), { scale: 1.5, opacity: 0 }, { scale: 1, opacity: 1, duration: .8, ease: "expo.out", stagger: .05 }, .15);
      tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: T, ease: "none" }, 0);
    } else if (D.estilo === "clay") {
      // bolhas de massinha flutuando (esferas com luz e sombra internas)
      var cores = ["var(--a)", "var(--a2)", "var(--a3)"];
      for (var j = 0; j < 7; j++) {
        var bo = el("div", "bolha", f), sz = (7 + rnd() * 12) * u;
        bo.style.width = bo.style.height = sz + "px";
        bo.style.setProperty("--cor", cores[j % 3]);
        // só nas bordas: o miolo fica livre para o texto
        var x0 = (j % 2 ? .86 + rnd() * .16 : -.04 + rnd() * .14) * W - sz / 2, y0 = (.04 + (j / 7) * .9 + rnd() * .06) * H - sz / 2;
        gsap.set(bo, { x: x0, y: y0, rotation: rnd() * 40 - 20, opacity: 0, scale: .3 });
        tl.to(bo, { opacity: .92, scale: 1, duration: 1.3, ease: "elastic.out(1, 0.55)" }, .1 + j * .09);
        tl.to(bo, { y: y0 - (2 + rnd() * 4) * u, rotation: "+=" + (rnd() * 30 - 15), duration: 2.2 + rnd() * 1.2, ease: "sine.inOut", yoyo: true, repeat: Math.ceil(T / 2.5) }, 1.2);
      }
    } else {
      // editorial: papel, margens com fios finos e numeração de página
      el("div", "papel", f);
      var fio1 = el("div", "fio fio-topo", f), fio2 = el("div", "fio fio-base", f);
      tl.fromTo([fio1, fio2], { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: "power3.inOut", stagger: .15 }, .1);
      var cab = el("div", "cabecalho", f, "<span>" + (D.rotulo || "") + "</span><span class=pag></span>");
      tl.fromTo(cab, { opacity: 0, y: -u }, { opacity: 1, y: 0, duration: 1, ease: "power3.out" }, .4);
      var pag = cab.querySelector(".pag");
      D.cenas.forEach(function (c, i) { tl.call(function () { pag.textContent = ("0" + (i + 1)).slice(-2) + " / " + ("0" + D.cenas.length).slice(-2); }, null, c.s); });
    }
  }

  // ── Uma cena: visibilidade, entrada por papel, ênfases, saída ──
  function cena(c, i, tl) {
    var sec = document.getElementById("c" + i), M = C.M, est = C.D.estilo, t0 = c.s, t1 = c.e;
    var ultima = i === C.D.cenas.length - 1;
    tl.set(sec, { autoAlpha: i === 0 ? 1 : 0 }, 0);
    if (i > 0) tl.set(sec, { autoAlpha: 1 }, t0);
    if (!ultima) tl.set(sec, { autoAlpha: 0 }, t1);

    var t = t0 + 0.12; // cada papel entra em sequência curta; o resto do tempo é leitura
    function papel(a) { return $$("[data-a=" + a + "]", sec); }

    papel("kicker").forEach(function (k) { tl.fromTo(k, de("kicker"), para(), t); t += .12; });
    papel("titulo").forEach(function (ti) {
      var ws = $$(".wi", ti);
      tl.fromTo(ws, de("palavra"), para({ stagger: M.stag }), t);
      $$(".hl", ti).forEach(function (h, n) { tl.fromTo(h, { "--hl": 0 }, { "--hl": 1, duration: .6, ease: "power2.out" }, t + .35 + n * .1); });
      t += Math.min(.75, .25 + ws.length * M.stag);
    });
    papel("numero").forEach(function (nu) {
      var v = +nu.getAttribute("data-valor"), cs = +nu.getAttribute("data-casas") || 0, pre = nu.getAttribute("data-pre") || "", suf = nu.getAttribute("data-suf") || "", alvo = nu.querySelector(".num-v");
      var o = { v: 0 };
      tl.fromTo(nu, de("pulo"), para({ ease: M.pulo }), t);
      tl.to(o, { v: v, duration: 1.4, ease: "power3.out", onUpdate: function () { alvo.textContent = pre + o.v.toFixed(cs).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".") + suf; } }, t);
      t += .35;
    });
    papel("mock").forEach(function (mk) { tl.fromTo(mk, de("mock"), para({ duration: M.dur * 1.15 }), t); t += .3; flutuar(mk, tl, t + .8, t1); });
    papel("sub").forEach(function (s) { tl.fromTo(s, de("sub"), para(), t); t += .2; });
    papel("quote").forEach(function (q) { tl.fromTo(q, de("pulo"), para({ ease: M.pulo }), t - .1); });
    var itens = papel("item");
    if (itens.length) {
      tl.fromTo(itens, de("item"), para({ stagger: .35 }), t);
      $$(".marca", sec).forEach(function (m, n) { tl.fromTo(m, { scale: 0, rotation: -40 }, { scale: 1, rotation: 0, duration: .55, ease: M.pulo }, t + .2 + n * .35); });
      t += itens.length * .35;
    }
    papel("card").forEach(function (cd, n) { tl.fromTo(cd, de(n ? "direita" : "esquerda"), para({ duration: M.dur }), t + n * .45); });
    papel("cta").forEach(function (b) {
      tl.fromTo(b, de("pulo"), para({ ease: M.pulo, duration: est === "editorial" ? .9 : 1.1 }), t);
      var brilho = b.querySelector(".brilho");
      if (brilho) tl.fromTo(brilho, { xPercent: -220 }, { xPercent: 420, duration: 1, ease: "power2.inOut", repeat: Math.max(0, Math.floor((t1 - t - 1.2) / 1.8)), repeatDelay: .8 }, t + .6);
      tl.to(b, { scale: 1.05, duration: .55, ease: "sine.inOut", yoyo: true, repeat: Math.max(1, Math.floor((t1 - t - 1.2) / 1.1)) | 1 /* ímpar: termina no tamanho normal */ }, t + 1.1);
    });
    papel("logo").forEach(function (lg) { tl.fromTo(lg, de("pulo"), para({ ease: M.pulo }), t0 + .2); });

    // ênfase de estilo dentro da cena
    if (est === "hud") $$(".anel", sec).forEach(function (a, n) { tl.fromTo(a, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: .9, ease: "back.out(1.6)" }, t0 + n * .08); tl.to(a, { rotation: n % 2 ? -90 : 90, duration: t1 - t0, ease: "none" }, t0); });
    if (est === "clay") $$(".massa", sec).forEach(function (a, n) { tl.fromTo(a, { scale: 0, y: C.H * .05 }, { scale: 1, y: 0, duration: 1.2, ease: "elastic.out(1, 0.5)" }, t0 + .05 + n * .1); flutuar(a, tl, t0 + 1.2, t1); });
    if (est === "editorial") $$(".regua", sec).forEach(function (r) { tl.fromTo(r, { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: "power3.inOut" }, t0 + .1); });

    // câmera: aproximação lenta e contínua (nunca fica parado)
    var cam = sec.querySelector(".camera");
    if (cam) tl.fromTo(cam, { scale: est === "editorial" ? 1 : 1.02 }, { scale: est === "editorial" ? 1.025 : 1.06, duration: t1 - t0, ease: "sine.inOut" }, t0);

    // legenda: blocos curtos, cada um fica no ar o tempo da fala dele
    (c.leg || []).forEach(function (b, n) {
      var e = document.getElementById("c" + i + "-l" + n); if (!e) return;
      tl.fromTo(e, { autoAlpha: 0, y: C.H * .012 }, { autoAlpha: 1, y: 0, duration: .22, ease: "power2.out" }, b.s);
      tl.to(e, { autoAlpha: 0, duration: .18, ease: "power2.in" }, b.e - .18);
      (b.p || []).forEach(function (ps, k) { var w = e.children[k]; if (w) tl.fromTo(w, { "--on": 0 }, { "--on": 1, duration: .12 }, ps); });
    });

    // saída curta no fim (a última cena fica)
    if (!ultima) {
      var sai = $$("[data-a], .deco", sec);
      tl.to(sai, saida(), t1 - M.durSai - .05);
      transicao(t1, tl);
    }
  }

  function flutuar(e, tl, ini, fim) {
    var amp = C.H * (C.D.estilo === "clay" ? .012 : .006), per = C.D.estilo === "clay" ? 1.6 : 2.2;
    var n = Math.max(1, Math.floor((fim - ini) / per));
    tl.to(e, { y: "-=" + amp, duration: per / 2, ease: "sine.inOut", yoyo: true, repeat: n * 2 - 1 }, ini);
  }

  function de(tipo) {
    var est = C.D.estilo, H = C.H, W = C.W;
    if (est === "clay") {
      if (tipo === "palavra") return { yPercent: 60, scale: .4, opacity: 0, rotation: -8 };
      if (tipo === "item") return { x: -W * .08, scale: .6, opacity: 0 };
      if (tipo === "esquerda") return { x: -W * .3, rotation: -10, opacity: 0 };
      if (tipo === "direita") return { x: W * .3, rotation: 10, opacity: 0 };
      if (tipo === "mock") return { y: H * .12, scale: .7, rotation: -6, opacity: 0 };
      return { scale: .5, y: H * .03, opacity: 0 };
    }
    if (est === "editorial") {
      if (tipo === "palavra") return { yPercent: 105, opacity: 0 };
      if (tipo === "item") return { x: -W * .04, opacity: 0 };
      if (tipo === "esquerda" || tipo === "direita") return { y: H * .03, opacity: 0, clipPath: "inset(0 0 100% 0)" };
      if (tipo === "mock") return { y: H * .05, opacity: 0, clipPath: "inset(0 0 100% 0)" };
      return { y: H * .015, opacity: 0 };
    }
    // hud
    if (tipo === "palavra") return { yPercent: 110, opacity: 0, rotationX: -50, filter: "blur(6px)" };
    if (tipo === "item") return { x: -W * .06, opacity: 0, filter: "blur(6px)" };
    if (tipo === "esquerda") return { x: -W * .25, rotationY: 35, opacity: 0, filter: "blur(8px)" };
    if (tipo === "direita") return { x: W * .25, rotationY: -35, opacity: 0, filter: "blur(8px)" };
    if (tipo === "mock") return { z: -500, rotationX: 28, opacity: 0, filter: "blur(10px)" };
    if (tipo === "kicker") return { opacity: 0, letterSpacing: ".6em" };
    return { y: H * .02, opacity: 0, filter: "blur(6px)" };
  }
  function para(o) {
    o = o || {}; var M = C.M;
    var r = { x: 0, y: 0, z: 0, xPercent: 0, yPercent: 0, scale: 1, rotation: 0, rotationX: 0, rotationY: 0, opacity: 1, duration: o.duration || M.dur, ease: o.ease || M.ent, stagger: o.stagger || 0 };
    if (C.D.estilo === "hud") r.filter = "blur(0px)";
    if (C.D.estilo === "editorial") r.clipPath = "inset(0 0 0% 0)";
    return r;
  }
  function saida() {
    var M = C.M, est = C.D.estilo;
    if (est === "clay") return { scale: .6, opacity: 0, duration: M.durSai, ease: M.sai, stagger: .02 };
    if (est === "editorial") return { opacity: 0, y: -C.H * .01, duration: M.durSai, ease: M.sai, stagger: .02 };
    return { opacity: 0, y: -C.H * .02, filter: "blur(8px)", duration: M.durSai, ease: M.sai, stagger: .02 };
  }
  // transição no corte, discreta e coerente com o estilo
  function transicao(t, tl) {
    var root = document.getElementById("root"), est = C.D.estilo;
    if (est === "hud") {
      var s = el("div", "varre", root);
      tl.fromTo(s, { xPercent: -180, opacity: 0 }, { xPercent: 400, duration: .75, ease: "power3.inOut", immediateRender: false }, t - .38);
      tl.fromTo(s, { opacity: 0 }, { opacity: 1, duration: .12, immediateRender: false }, t - .38);
      tl.to(s, { opacity: 0, duration: .15 }, t + .2);
    }
    else if (est === "editorial") { var w = el("div", "cortina", root); tl.fromTo(w, { scaleX: 0, transformOrigin: "left" }, { scaleX: 1, duration: .32, ease: "power3.in" }, t - .3); tl.to(w, { scaleX: 0, transformOrigin: "right", duration: .4, ease: "power3.out" }, t + .02); }
    else { var b = el("div", "bolhao", root); tl.fromTo(b, { scale: 0, opacity: .95 }, { scale: 1, duration: .45, ease: "power2.in" }, t - .38); tl.to(b, { opacity: 0, duration: .35, ease: "power1.out" }, t + .07); }
  }

  window.C = C;
})();`;
