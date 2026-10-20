import { ESTILOS, FORMATOS, MUSICA_TAGS, SFX_CATEGORIAS, storyboardSchema, TIPOS_CENA, VOZES, type Brief, type Storyboard } from "@domus-ads/core";
import { KIT_DOC } from "./kit/motion-kit";

/** Animações que o storyboard pode pedir (o Claude implementa cada uma em GSAP na composição). */
export const ANIMACOES = ["fade-up", "scale", "slide", "split-words", "mask-reveal", "counter", "glitch", "cta"] as const;

export const SISTEMA_ROTEIRO = `Você é diretor de criação e copywriter sênior de anúncios curtos em vídeo (Meta Ads, Reels, Shorts), em português do Brasil.
Sua tarefa: a partir do briefing, escrever o roteiro como um STORYBOARD ESTRUTURADO em JSON. Ainda não é código.

Responda APENAS com um bloco \`\`\`json contendo exatamente este formato:
{
  "title": "nome curto do vídeo",
  "duration": <segundos, igual ao pedido>,
  "fps": 30,
  "scenes": [
    { "start": 0, "end": 3, "tipo": "abertura", "headline": "texto grande na tela", "subtext": "apoio opcional",
      "narration": "o que a voz fala nesta cena", "destaque": ["palavra"], "animation": "fade-up", "visual": "descrição do visual da cena" }
  ],
  "sfx": [ { "time": 2.9, "effect": "whoosh", "volume": 0.6 } ],
  "music": { "tag": "technology", "volume": 0.25 }
}

Regras:
- Cenas contínuas, sem buracos: a 1ª começa em 0, cada uma começa onde a anterior termina, a última termina em "duration".
- Poucas cenas, cada uma com tempo para ler: 3 a 4 cenas até 20 s, 4 a 6 até 30 s, até 8 em 45–60 s.
  Gancho forte na 1ª cena. A última cena é o CTA.
- "tipo" de cada cena (layout pronto e animado), um de: ${TIPOS_CENA.join(", ")}.
  abertura = gancho (1ª cena) · titulo = uma ideia forte · lista = até 4 itens curtos em "itens" ·
  numero = um número de destaque em "numero" {"valor": 12, "prefixo": "", "sufixo": "h", "casas": 0} com a headline como rótulo (SÓ números que estejam no briefing) ·
  comparacao = antes/depois: "itens": ["como é hoje (ruim)", "como fica (bom)"] e, opcional, rótulos ["…", "…", "Antes", "Depois"] ·
  produto = tela do produto num celular/navegador; use "asset": "assets/…" com o PRINT REAL da página (em <referencias_visuais>; celular no vertical, computador no deitado) ou a imagem do produto marcada "COLOCAR NA ARTE"; site/sistema real só aparece com print real ·
  citacao = depoimento (headline = a fala, subtext = quem disse; só se houver depoimento real no briefing) ·
  cta = chamada final (botão com o CTA do briefing).
  Varie os tipos; não repita o mesmo tipo em cenas seguidas.
- TEXTO NA TELA CURTO (precisa dar tempo de ler): headline até 7 palavras, subtext até 12, cada item até 6 palavras.
- "destaque": 1 ou 2 palavras da headline que ganham a cor de destaque.
- Narração: no máximo 2,4 palavras por segundo da cena (a voz precisa caber). Se a voz for "Sem narração", use "narration": "".
- headline curta e forte. Nada de jargão. Fale com o público do briefing.
- animation: uma de ${ANIMACOES.join(", ")}.
- sfx: só nos momentos de transição/impacto (3 a 8 no total); effect: um de ${SFX_CATEGORIAS.join(", ")}. Se o briefing pedir sem efeitos, "sfx": [].
- music: se o briefing pedir uma tag, use-a; se for "auto", escolha a que combina com o produto e o tom; se for "none", "music": null. Tags: ${MUSICA_TAGS.join(", ")}.
- Use só fatos do briefing. Não invente preço, prazo, estatística ou promessa que não esteja nele.`;

export function promptRoteiro(b: Brief, contexto = ""): string {
  return `${contexto ? `${contexto}\n\n` : ""}<briefing>
Produto: ${b.produto}
Objetivo: ${b.objetivo || "(não informado: siga as orientações do cliente)"}
Descrição: ${b.descricao || "-"}
Público: ${b.publico || "-"}
Duração: ${b.duracao} s
Formato: ${b.formato}
Estilo visual: ${ESTILOS[b.estiloVisual].nome} (${b.estilo || "-"})
Cores/identidade: ${b.cores || "livre, premium"}
CTA: ${b.cta || "-"}
Voz: ${b.voz in VOZES ? VOZES[b.voz as keyof typeof VOZES] : b.vozNome || "ElevenLabs"}
Música: ${b.musica === "auto" ? "automática (escolha a tag)" : b.musica}
Efeitos sonoros: ${b.efeitos ? "sim" : "não"}
</briefing>`;
}

export function lerStoryboard(json: string): Storyboard {
  let bruto: unknown;
  try { bruto = JSON.parse(json); } catch { throw new Error("O roteiro não veio em JSON válido"); }
  const r = storyboardSchema.safeParse(bruto);
  if (!r.success) throw new Error(`Roteiro fora do formato: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return r.data;
}

/** Regras da HyperFrames (CLI `docs` + CLAUDE.md do projeto) + direção de arte. O Claude só devolve o HTML. */
export function sistemaComposicao(b: Brief, direcao?: Direcao, ajuste = false, referencia?: string): string {
  const [w, h] = FORMATOS[b.formato];
  return `Você é motion designer sênior e escreve composições de vídeo em HTML para a HyperFrames (renderizada quadro a quadro em Chrome headless).
Responda APENAS com um bloco \`\`\`html contendo o documento completo index.html.

ESTRUTURA OBRIGATÓRIA (HyperFrames):
- <html lang="pt-BR">, <meta name="viewport" content="width=${w}, height=${h}">, html/body com width:${w}px; height:${h}px; overflow:hidden; margin:0.
- Um elemento raiz: <div id="root" data-composition-id="main" data-start="0" data-duration="<duração total>" data-width="${w}" data-height="${h}">.
- Cada cena é um filho direto do raiz: <section id="cena-N" class="clip" data-start="<início>" data-duration="<fim-início>" data-track-index="0"> com os tempos EXATOS do storyboard.
- .clip { position:absolute; inset:0 } — cada cena ocupa o quadro inteiro. Camadas com z-index, não com data-track-index.
- Scripts, nesta ordem, no fim do <body>:
    <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
    <script src="assets/motion-kit.js"></script>
    <script>
      const tl = MK.init({ … , total: <duração total> });
      … cenas com os métodos MK.* e tl.fromTo(alvo, {…}, {…}, <tempo absoluto>) …
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;   // linha obrigatória, literal
    </script>
  Tudo com tempo absoluto em segundos. Propriedades GSAP livres para transform 3D (x, y, z, rotationX, rotationY, scale, opacity, filter).
  Timelines filhas não podem ser paused. Nada de CSS @keyframes/animation/transition: todo movimento vem do timeline (o render busca quadros).
- PROIBIDO: Math.random, Date.now, new Date, fetch, XMLHttpRequest, WebSocket, import(), eval, iframe, imagens/vídeos externos,
  qualquer <script src> além dos dois acima. Fontes: pode usar Google Fonts (<link> para fonts.googleapis.com) ou fontes do sistema.
  Formas, gradientes, ícones e ilustrações: CSS e SVG inline.

${KIT_DOC}

DIREÇÃO DE ARTE DESTE VÍDEO (obrigatória, e diferente dos vídeos anteriores):
${!direcao ? "  Mantenha a linguagem visual da composição atual."
  : ajuste ? `  Num ajuste, mantenha a linguagem da composição atual, A MENOS que o pedido peça outro estilo, mais originalidade ou
  para tirar elementos visuais: aí refaça o visual inteiro nesta direção: "${direcao.nome}": ${direcao.descricao}
  O pedido do cliente manda: se ele pede para tirar algo, tire de verdade (inclusive opções do MK.init).`
  : `  "${direcao.nome}": ${direcao.descricao}`}
${referencia ? `- ESTILO SALVO pelo cliente: a composição em <estilo_referencia> é o vídeo que ele aprovou. Repita a MESMA linguagem
  visual (texturas, formas, tipografia, paleta, camadas, tipo de movimento, transições, easings e ritmo), reaproveitando
  as técnicas de CSS/SVG/GSAP dela, mas com o CONTEÚDO deste storyboard e adaptada a ${w}×${h} (reorganize o layout
  para o formato; nada pode ficar fora do quadro nem na área da interface). Não copie textos nem imagens dela.
<estilo_referencia>
${referencia.slice(0, 60_000)}
</estilo_referencia>
` : ""}- Construa a linguagem inteira a partir dela: composição, tipografia, texturas, formas, ritmo, transições e easings próprios.
  Nada de "template": se a direção pede papel, colagem, isométrico ou tipografia suíça, o vídeo PARECE isso.
- PROIBIDO (clichês que já se repetiram): alvo/anéis concêntricos com mira, faixas de texto atravessando a tela
  (marquee), moldura HUD com cantos e timecode, grade + partículas + bolhas desfocadas como fundo, sweep de luz em
  toda transição. Só use algum disso se a direção acima pedir explicitamente.
- Movimento com intenção: cada cena tem uma ideia visual (metáfora do que é dito), não só texto entrando. Varie o
  tipo de transição entre as cenas (corte seco, máscara, wipe com forma, zoom através de um elemento, morph de cor…).
- A narração aparece como legenda sincronizada (MK.words ou o seu próprio sistema; se a cena tiver "words", use os
  tempos), com 1–2 palavras-chave destacadas, numa faixa própria acima da margem inferior. A headline entra do jeito da direção.
- Layout sem sobreposição: texto nunca fica em cima de outro texto nem de imagem; quando um elemento novo ocupa a
  zona, o anterior já saiu. Não repita na legenda a frase da headline.
- Ritmo: entradas importantes caem nas batidas da música (lista abaixo, quando houver).
- Margem de segurança de 8% nas bordas (no 9:16 deixe livre os 12% de cima e os 15% de baixo para a interface do Reels).
- A "animation" de cada cena é só uma sugestão.
- Cores: ${b.cores || "as da identidade visual, se houver (obrigatórias); senão, uma paleta coerente com a direção"}. Estilo pedido: ${b.estilo || "premium e moderno"}.
${REGRAS_CONTEXTO}
- Texto exatamente como no storyboard (pode quebrar linha). A narração vai na tela só como legenda cinética (MK.words).
- Nome do produto/marca SEMPRE escrito exatamente “${b.produto}”, letra por letra. Para colorir só parte do nome, divida o
  texto original sem repetir nem acrescentar letras (ex.: “SIAPLUS” → <span>SIA</span><span>PLUS</span>, nunca SIAP + PLUS).
  Confira a ortografia de toda palavra na tela antes de responder.`;
}

/**
 * Direções de arte do modo Livre: cada vídeo sorteia uma que não foi usada nos últimos vídeos do workspace, para a IA
 * não cair sempre no mesmo visual.
 */
export interface Direcao { nome: string; descricao: string }
export const DIRECOES: Direcao[] = [
  { nome: "Colagem editorial", descricao: "recortes de papel com bordas irregulares e sombra, fotos/prints recortados, fita adesiva, tipografia de revista misturando serifa e grotesca; elementos entram como se fossem colados (pequenos giros, quique seco)." },
  { nome: "Suíço cinético", descricao: "grade tipográfica rígida, fundo claro, preto + 1 cor forte, tipografia enorme em caixa alta alinhada à esquerda, réguas e números grandes; movimentos lineares precisos, cortes secos em grade." },
  { nome: "Neo-brutalismo", descricao: "blocos chapados de cor saturada, contornos pretos grossos, sombras duras deslocadas, botões e cartões quadrados; movimento com estalo (back.out), objetos caindo e travando no lugar." },
  { nome: "Isométrico 3D", descricao: "cena isométrica construída em CSS 3D (cubos, plataformas, telas flutuando), câmera girando ao redor; cores pastel ou da marca, sombras suaves." },
  { nome: "Gradiente líquido", descricao: "fundos de gradiente em malha que se transformam devagar, formas orgânicas (blobs SVG) que se fundem, vidro fosco, tipografia limpa grande; transições por morph de forma." },
  { nome: "Minimal monocromático", descricao: "uma cor só (tons da marca) e muito espaço vazio, tipografia fina e elegante, linhas finas desenhando formas; ritmo calmo, revelações por máscara." },
  { nome: "Cromado Y2K", descricao: "tipografia cromada/metálica com reflexo, estrelas e brilhos, gradientes iridescentes, formas infladas; movimento elástico e brincalhão." },
  { nome: "Stop-motion de papel", descricao: "formas de papel recortado com textura, movimento em passos (ease steps, 12 fps aparente), leve tremido de mão, sombras de papel em camadas." },
  { nome: "Interface em close", descricao: "a história contada dentro de telas e componentes de UI ampliados (cursor clicando, toggles, cards, notificações chegando), câmera passeando pela interface; sem moldura HUD." },
  { nome: "Tipografia gigante", descricao: "palavras enormes ocupando a tela inteira, cortadas nas bordas, trocando de escala e direção; contraste máximo, quase sem outros elementos." },
  { nome: "Risografia", descricao: "2 ou 3 cores chapadas com textura granulada, desalinhamento de registro proposital, ilustrações simples em SVG; movimentos curtos e secos." },
  { nome: "Cinema escuro", descricao: "fundo quase preto, iluminação de holofote (gradiente radial) revelando o texto, grão de filme sutil, tipografia serifada elegante, letterbox; movimentos lentos e dramáticos." },
  { nome: "Split-screen", descricao: "tela dividida em 2–3 painéis que se reorganizam a cada cena (antes/depois, problema/solução), divisórias animadas; cores contrastantes por painel." },
  { nome: "Ilustração em traço", descricao: "ícones e cenas desenhados em SVG com traço contínuo sendo desenhado (stroke-dashoffset), preenchimentos que surgem depois; fundo claro, cores da marca." },
];

/** Como usar identidade visual e anexos (vale para vídeo e imagem). */
export const REGRAS_CONTEXTO = `- Identidade visual (quando vier no pedido): cores, fontes, tom e regras dela são obrigatórios.
- Arquivos marcados "COLOCAR NA ARTE" entram com <img src="assets/…"> (object-fit: contain, sem distorcer) ou
  <video src="assets/…" muted playsinline> como clip com data-start/data-duration. Site ou sistema real só aparece pelo PRINT REAL
  (em <referencias_visuais>), nunca por uma imitação desenhada. Print de tela vai num mockup
  (moldura, cantos arredondados, sombra). Arquivos "só inspiração" NÃO entram: servem de referência de estilo.
- Antes de compor, abra e olhe cada imagem da pasta assets (leia o arquivo) para decidir cor, recorte e posição.
- Só caminhos relativos "assets/<arquivo>" exatamente como listados; nada de ".." nem caminho absoluto.`;

export function promptComposicao(sb: Storyboard, contexto = "", ritmo: { bpm: number; batidas: number[]; compassos: number[] } | null = null): string {
  const r = ritmo ? `\n\n<musica bpm="${ritmo.bpm}">\nInícios de compasso (s): ${ritmo.compassos.map((t) => t.toFixed(2)).join(", ")}\nBatidas (s): ${ritmo.batidas.slice(0, 160).map((t) => t.toFixed(2)).join(", ")}\n</musica>` : "";
  return `${contexto ? `${contexto}\n\n` : ""}<storyboard>\n${JSON.stringify(sb, null, 2)}\n</storyboard>${r}\n\nEscreva o index.html completo para este storyboard com o Motion Kit. Duração total: ${sb.duration} s.`;
}

export function promptCorrecao(html: string, erros: string[]): string {
  return `A composição abaixo tem problemas. Corrija TODOS e devolva o index.html completo (só o bloco \`\`\`html).

<problemas>
${erros.map((e) => `- ${e}`).join("\n")}
</problemas>

<index.html>
${html}
</index.html>`;
}

export function promptAjuste(html: string, sb: Storyboard, pedido: string, contexto = ""): string {
  return `${contexto ? `${contexto}

` : ""}Ajuste a composição existente conforme o pedido, mantendo os tempos das cenas (a narração já está sincronizada com eles).
Devolva o index.html completo (só o bloco \`\`\`html).

<pedido>
${pedido}
</pedido>

<storyboard>
${JSON.stringify(sb, null, 2)}
</storyboard>

<index.html>
${html}
</index.html>`;
}

export { violacoes } from "@domus-ads/core";

/** Ajuste de uma composição feita pelo motor de cenas prontas (assets/cenas.js): a IA mexe no CSS/HTML, não no motor. */
export function sistemaAjusteCenas(b: Brief): string {
  const [w, h] = FORMATOS[b.formato];
  return `Você é motion designer sênior. A composição abaixo (${w}×${h}, HyperFrames) foi montada pelo motor de cenas prontas
do DOMUS: cada <section class="clip cena"> tem papéis marcados (data-a="titulo|sub|item|numero|card|mock|cta|logo|kicker|quote"),
o CSS no <style> define a pele do estilo e o script assets/cenas.js faz o encaixe do texto e toda a animação a partir do JSON em C.init(...).
Responda APENAS com um bloco \`\`\`html com o documento completo, ajustado conforme o pedido.

Regras:
- Mantenha: os <script> (GSAP, assets/cenas.js, C.init e a linha window.__timelines["main"] = tl), os ids c0, c1…, os atributos
  data-start/data-duration/data-track-index, os data-a e as classes .conteudo/.area/.legenda/.leg (o encaixe depende delas).
- Para mudar cores, fontes, tamanhos, espaçamentos, fundo e aparência: edite o CSS (variáveis em :root, classes .estilo-…).
- Para mudar textos: edite o HTML da cena (dentro de cada .wi fica uma palavra do título). Para mudar tempos: edite o JSON do C.init
  (s/e de cada cena e legendas) e os data-start/data-duration juntos.
- PROIBIDO: Math.random, Date, fetch, import(), eval, iframe, @keyframes/animation/transition, scripts externos novos.
- Texto curto e legível: nada pode sair da área segura nem ficar por cima de outro texto.
${REGRAS_CONTEXTO}`;
}
