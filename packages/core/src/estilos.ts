import { z } from "zod";

/**
 * Biblioteca de estilos do Studio: estilos prontos (aqui, no código) + os do workspace (ads.estilos, com referências).
 * O "prompt" de cada estilo vai para a IA como direção de arte; a prévia de um pronto é uma amostra curta renderizada
 * uma vez pelo worker (job ESTILOS) e guardada no R2 + Drive.
 */
export const FAMILIAS = { "2d": "Motion 2D", "3d": "3D", video: "Vídeo", post: "Post", stories: "Stories", banner: "Banner", arte: "Arte" } as const;
export type Familia = keyof typeof FAMILIAS;

export interface EstiloPronto { chave: string; nome: string; familia: Familia; resumo: string; tags: string[]; prompt: string }

const e = (chave: string, nome: string, familia: Familia, resumo: string, tags: string[], prompt: string): EstiloPronto => ({ chave, nome, familia, resumo, tags, prompt });

export const ESTILOS_PRONTOS: EstiloPronto[] = [
  // ── Motion 2D ──
  e("papel-recortado", "Papel recortado", "2d", "Camadas de papel com sombra, movimento de stop-motion", ["papel", "artesanal", "colagem"],
    "Ilustração em camadas de papel recortado com bordas levemente irregulares e textura de fibra; sombras suaves entre as camadas dando profundidade; paleta de 3-4 cores chapadas e quentes; movimento em passos (aparência de 12 fps), pequenos giros e quiques secos como se as peças fossem colocadas à mão."),
  e("suico-cinetico", "Suíço cinético", "2d", "Grade rígida, tipografia enorme, preto + 1 cor", ["tipografia", "minimal", "grid"],
    "Design suíço: grade tipográfica rígida, fundo claro (off-white), preto e UMA cor forte de destaque, tipografia grotesca enorme em caixa alta alinhada à esquerda, réguas, números grandes e linhas finas; movimentos lineares precisos, cortes secos que respeitam a grade, máscaras retangulares."),
  e("neo-brutalismo", "Neo-brutalismo", "2d", "Blocos saturados, contornos grossos, sombra dura", ["brutalista", "bold", "ui"],
    "Neo-brutalismo: blocos chapados de cor saturada (amarelo, rosa, azul), contornos pretos de 4px, sombras duras deslocadas sem desfoque, cartões e botões quadrados, tipografia pesada; elementos caem e travam no lugar com estalo (back.out), leve tremida no impacto."),
  e("gradiente-liquido", "Gradiente líquido", "2d", "Malha de gradiente, blobs que se fundem, vidro fosco", ["gradiente", "suave", "premium"],
    "Fundo de gradiente em malha que se transforma devagar, formas orgânicas (blobs SVG) que se fundem e se separam, painéis de vidro fosco com borda clara, tipografia limpa grande; transições por morph de forma e desfoque; ritmo calmo e premium."),
  e("traco-nanquim", "Traço de nanquim", "2d", "Linha preta que se desenha sozinha sobre papel", ["desenho", "linha", "minimal"],
    "Fundo de papel creme com textura sutil; tudo nasce de um traço de nanquim preto que se desenha sozinho (stroke-dashoffset em SVG), com espessura variável como pincel; pequenas manchas de tinta; quase nenhuma cor (um único acento vermelho); ritmo contemplativo."),
  e("interface-close", "Interface em close", "2d", "Telas e componentes de UI ampliados, cursor clicando", ["ui", "produto", "saas"],
    "A história contada dentro de uma interface: cards, toggles, gráficos e notificações em close, cursor que se move e clica, câmera passeando pela tela (pan e zoom suaves); UI limpa com cantos arredondados, sombras macias e a cor da marca nos destaques; sem moldura HUD."),
  e("risografia", "Risografia", "2d", "2-3 cores chapadas, grão, registro desalinhado", ["print", "retrô", "textura"],
    "Estética de impressão risográfica: 2 ou 3 cores chapadas (rosa fluor, azul, amarelo) com grão pontilhado, desalinhamento proposital de registro entre as cores, ilustrações simples em SVG; movimentos curtos e secos, trocas de cor por camada."),
  e("tipografia-gigante", "Tipografia gigante", "2d", "Palavras enormes cortadas nas bordas, contraste máximo", ["tipografia", "impacto", "bold"],
    "Palavras enormes ocupando a tela inteira, cortadas nas bordas, trocando de escala, peso e direção a cada batida; contraste máximo (preto/branco + 1 cor), quase sem outros elementos; cortes rápidos sincronizados com o ritmo."),
  // ── 3D ──
  e("estudio-3d", "Produto em estúdio 3D", "3d", "Objeto brilhante girando, luz de estúdio, câmera lenta", ["3d", "produto", "premium"],
    "Cena 3D de estúdio: um objeto sólido central (forma que represente o produto ou a marca) com material metálico/vidro, fundo escuro com degradê, luz principal suave + contraluz recortando a silhueta, reflexos; câmera orbitando devagar e aproximando; tipografia limpa por cima."),
  e("isometrico-3d", "Isométrico 3D", "3d", "Cidade/plataformas isométricas, câmera girando", ["3d", "isométrico", "ilustrado"],
    "Mundo isométrico em 3D low-poly: plataformas, blocos e pequenos objetos (telas, prédios, árvores) em cores pastel ou da marca, luz suave com sombras de contato; câmera ortográfica girando ao redor; objetos sobem do chão em sequência com quique."),
  e("formas-flutuando", "Formas flutuando", "3d", "Esferas, toros e cápsulas suspensos com luz neon", ["3d", "abstrato", "neon"],
    "Composição abstrata 3D: esferas, toros e cápsulas suspensos no ar, materiais brilhantes e emissivos (neon da cor da marca), névoa ao fundo, profundidade de campo; as formas flutuam, se reorganizam e abrem espaço para o texto; câmera em travelling lento."),
  e("massinha-3d", "Massinha 3D", "3d", "Objetos inflados, cores pastel, quique elástico", ["3d", "clay", "fofo"],
    "Claymorphism 3D: objetos com cara de massinha (cantos muito arredondados, superfícies foscas), cores pastel, luz macia de cima e sombras suaves; movimento elástico com squash and stretch, objetos que caem, quicam e se acomodam."),
  e("terreno-wireframe", "Terreno wireframe", "3d", "Grade de linhas em ondas, câmera voando, synthwave", ["3d", "retrô", "tech"],
    "Terreno em wireframe (malha de linhas brilhantes) ondulando como montanhas, sol/gradiente no horizonte, névoa; câmera voando rente ao terreno em direção ao horizonte; paleta synthwave ou da marca; texto entra com brilho."),
  e("particulas-logo", "Partículas formando logo", "3d", "Milhares de pontos que se juntam numa forma", ["3d", "partículas", "reveal"],
    "Nuvem de milhares de partículas (pontos brilhantes) espalhadas no espaço 3D que se movem em fluxo e se juntam formando a forma do logo/símbolo ou uma palavra, depois se dispersam; fundo escuro, cor da marca, leve rotação de câmera."),
  // ── Vídeo ──
  e("cinema-escuro", "Cinema escuro", "video", "Holofote, grão de filme, serifada elegante, letterbox", ["cinema", "dramático", "premium"],
    "Fundo quase preto, iluminação de holofote (gradiente radial) revelando o texto, grão de filme sutil, faixas pretas de letterbox, tipografia serifada elegante; movimentos lentos e dramáticos, fades longos, zoom quase imperceptível."),
  e("ugc-dinamico", "UGC dinâmico", "video", "Legendas grandes palavra a palavra, cortes rápidos, emojis", ["tiktok", "reels", "legenda"],
    "Estilo de vídeo nativo de TikTok/Reels: legendas enormes palavra por palavra com a palavra-chave em cor de destaque, cortes rápidos, zoom de impacto nas frases importantes, emojis e setas desenhadas pontuando; energia alta, ritmo de 2-3 cortes por segundo."),
  e("explicativo-flat", "Explicativo flat", "video", "Ícones e personagens flat, passo a passo didático", ["explicativo", "didático", "ícones"],
    "Vídeo explicativo em ilustração flat: ícones e personagens simples, cores da marca, fundo limpo; cada ideia é um passo numerado que entra com animação clara (desenhar, crescer, deslizar); setas e conectores mostram a lógica; ritmo didático."),
  e("antes-depois", "Antes e depois", "video", "Tela dividida, problema vs solução, transição de wipe", ["comparação", "vendas", "conversão"],
    "Narrativa de antes e depois: primeiro a dor (cores dessaturadas, elementos bagunçados, tremidos), depois a solução (cores da marca, tudo alinhado e calmo); transição por wipe diagonal ou tela dividida que desliza; números grandes mostrando o ganho."),
  // ── Post ──
  e("post-editorial", "Editorial de revista", "post", "Serifada grande, foto recortada, muito respiro", ["editorial", "elegante", "feed"],
    "Post com cara de capa de revista: tipografia serifada grande, chamada curta, muito espaço em branco, foto ou forma recortada, fios finos e numeração; paleta neutra com uma cor de destaque; hierarquia clara."),
  e("post-carrossel-dicas", "Carrossel de dicas", "post", "Numeração grande, cards limpos, fácil de ler", ["carrossel", "dicas", "educativo"],
    "Carrossel educativo: cada slide com número grande, título curto e 1-2 linhas de apoio, ícone simples, fundo da cor da marca alternando claro/escuro; seta indicando para arrastar; último slide com chamada para ação."),
  e("post-citacao", "Citação forte", "post", "Frase grande entre aspas, fundo sólido, assinatura", ["citação", "frase", "minimal"],
    "Post de frase: aspas gigantes decorativas, citação em tipografia forte centralizada, fundo sólido ou gradiente sutil da marca, nome/assinatura pequeno embaixo; nada além disso."),
  e("post-oferta", "Oferta de varejo", "post", "Preço em destaque, selo, cores vibrantes", ["promoção", "varejo", "vendas"],
    "Post de oferta: produto em destaque, selo circular com o desconto, preço grande (só se estiver no briefing), cores vibrantes e contrastantes, faixa com o prazo, botão de chamada; composição diagonal com energia."),
  // ── Stories ──
  e("stories-enquete", "Stories interativo", "stories", "Cara de enquete/caixa de pergunta, vertical", ["stories", "interativo", "vertical"],
    "Stories vertical com cara de interação nativa: título em cima, área central imitando enquete ou caixa de perguntas, stickers e setas desenhadas à mão, fundo com foto desfocada ou gradiente; respeitar as áreas seguras do topo e da base."),
  e("stories-bastidores", "Bastidores", "stories", "Foto crua + rabiscos e marca-texto", ["stories", "bastidores", "autêntico"],
    "Visual de bastidores: foto em tela cheia com recorte de fita adesiva, anotações à mão, marca-texto amarelo em palavras-chave, setas e círculos rabiscados; aparência autêntica e pouco produzida."),
  // ── Banner ──
  e("banner-saas", "Banner SaaS", "banner", "Print do produto em mockup, título curto, botão", ["anúncio", "saas", "produto"],
    "Banner de anúncio de software: mockup de tela (notebook ou celular) mostrando o produto inclinado em perspectiva, título curto à esquerda, 1 benefício, botão de chamada; fundo escuro com brilho da cor da marca."),
  e("banner-minimal", "Banner minimalista", "banner", "Uma mensagem, uma imagem, muito espaço", ["minimal", "anúncio", "limpo"],
    "Banner minimalista: uma frase curta, uma imagem/forma central, logo pequeno, muito espaço vazio; tipografia sem serifa de peso médio, 2 cores; leitura em menos de 2 segundos."),
  // ── Arte ──
  e("arte-colagem", "Colagem pop", "arte", "Recortes de fotos, tipografia mista, fita adesiva", ["colagem", "pop", "criativo"],
    "Arte de colagem pop: recortes de fotos em preto e branco com contorno branco, tipografia misturando serifa e grotesca, fita adesiva, formas geométricas de cor forte, rabiscos; composição em camadas sobrepostas."),
  e("arte-vetorial-flat", "Vetorial flat", "arte", "Ilustração vetorial com personagens e cenário", ["ilustração", "flat", "personagem"],
    "Ilustração vetorial flat: personagens estilizados sem contorno, cenário simples com formas geométricas, sombras em tons planos, paleta harmônica de 5 cores (incluindo a da marca); composição narrativa com o texto integrado."),
  e("arte-cromado-y2k", "Cromado Y2K", "arte", "Letras metálicas, brilhos, iridescente", ["y2k", "cromado", "jovem"],
    "Estética Y2K: tipografia cromada/metálica com reflexo, estrelas e brilhos, gradientes iridescentes, formas infladas, fundo escuro ou holográfico; acabamento brilhante e jovem."),
];

export const estiloPronto = (chave: string) => ESTILOS_PRONTOS.find((x) => x.chave === chave) ?? null;

/** Texto que entra nas orientações da IA quando o usuário escolhe um estilo. */
export const textoDoEstilo = (s: { nome: string; prompt: string }) => `Estilo visual "${s.nome}": ${s.prompt}`;

export const estiloSchema = z.object({
  nome: z.string().trim().min(2, "Dê um nome ao estilo").max(60, "Nome com até 60 caracteres"),
  familia: z.enum(Object.keys(FAMILIAS) as [Familia, ...Familia[]], { message: "Escolha a categoria" }),
  resumo: z.string().trim().max(140, "Resumo com até 140 caracteres").default(""),
  prompt: z.string().trim().min(10, "Descreva o estilo (cores, formas, tipografia, movimento)").max(4000, "Descrição com até 4000 caracteres"),
  tags: z.array(z.string().trim().toLowerCase().max(24)).max(8, "Até 8 tags").default([]),
  referencias: z.array(z.string().uuid("Referência inválida")).max(12, "Até 12 referências").default([]),
});
export type EstiloInput = z.infer<typeof estiloSchema>;
