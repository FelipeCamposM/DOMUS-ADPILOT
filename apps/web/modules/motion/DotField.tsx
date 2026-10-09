"use client";

import { useEffect, useRef } from "react";

// Campo de pontos que ondula; perto do mouse os pontos acendem na cor da marca. Shader do hero do SIAPLUS,
// em WebGL puro (só um quad de tela cheia: Three.js seria peso à toa).
const FRAG = `
precision highp float;
uniform float uTime; uniform vec2 uRes; uniform vec2 uMouse;
const vec3 BRAND = vec3(0.659, 0.333, 1.0); // #A855FF violeta DOMUS
const vec3 DIM = vec3(0.36, 0.36, 0.44);
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 frag = gl_FragCoord.xy; float cell = 22.0;
  vec2 id = floor(frag / cell); vec2 f = fract(frag / cell) - 0.5; vec2 uv = frag / uRes;
  float t = uTime * 0.35;
  float onda = noise(id * 0.06 + vec2(t, -t * 0.7)) * 0.7 + 0.3 * sin(id.x * 0.12 + id.y * 0.08 - uTime * 0.9);
  float perto = 1.0 - smoothstep(0.0, 280.0, distance(frag, uMouse));
  float forca = clamp(onda * 0.85 + perto * 0.9, 0.0, 1.0);
  float raio = mix(0.06, 0.22, forca);
  float ponto = 1.0 - smoothstep(raio - 0.04, raio, length(f));
  float centro = smoothstep(0.08, 0.5, distance(uv, vec2(0.5)));
  float alfa = ponto * mix(0.18, 1.0, forca * forca) * mix(0.35, 1.0, centro);
  gl_FragColor = vec4(mix(DIM, BRAND, smoothstep(0.45, 0.95, forca)) * alfa, alfa);
}`;

export function DotField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false });
    if (!gl) return; // sem WebGL: fica o fundo em CSS
    const sh = (tipo: number, src: string) => { const s = gl.createShader(tipo)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }"));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const uTime = gl.getUniformLocation(prog, "uTime"), uRes = gl.getUniformLocation(prog, "uRes"), uMouse = gl.getUniformLocation(prog, "uMouse");

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const tamanho = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    tamanho();
    const ro = new ResizeObserver(tamanho);
    ro.observe(canvas);

    const alvo = { x: -9999, y: -9999 }, mouse = { x: -9999, y: -9999 };
    const mover = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      alvo.x = (e.clientX - r.left) * dpr;
      alvo.y = (r.bottom - e.clientY) * dpr;
    };
    window.addEventListener("pointermove", mover, { passive: true });

    const inicio = performance.now();
    let quadro = 0;
    const desenhar = () => {
      quadro = requestAnimationFrame(desenhar);
      if (document.hidden) return;
      mouse.x += (alvo.x - mouse.x) * 0.08;
      mouse.y += (alvo.y - mouse.y) * 0.08;
      gl.uniform1f(uTime, 4 + (performance.now() - inicio) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    gl.uniform1f(uTime, 4);
    gl.uniform2f(uMouse, -9999, -9999);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) desenhar();

    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("pointermove", mover);
      ro.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <canvas ref={ref} aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}
