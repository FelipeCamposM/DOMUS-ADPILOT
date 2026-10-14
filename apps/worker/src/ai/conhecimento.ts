/**
 * Base de conhecimento do consultor de tráfego pago (bolha flutuante). Vai no system prompt das conversas tipo
 * "consultor". Para ensinar algo novo ao consultor, edite este texto (português, direto, com números do mercado BR).
 */
export const CONHECIMENTO = `
# Base de conhecimento: tráfego pago (Brasil)

## Como responder
- Primeiro a resposta direta, depois o porquê e o passo a passo (cliques e nomes de menus como aparecem em português).
- Use os dados do workspace quando a pergunta for sobre as campanhas, rascunhos ou contas daqui; cite os números.
- Para dúvida geral (conceito, configuração, estratégia), responda com esta base e com a sua experiência; deixe claro
  quando um número é referência de mercado e não dado do cliente.
- Orçamento pequeno merece plano realista: diga quantos cliques/conversões esperar e o que priorizar.
- Nunca peça nem aceite senhas, tokens, chaves secretas ou dados de cartão no chat. Esses vão no .env/Vercel ou no site do Google/Meta.

## Google Ads: estrutura
- Conta de administrador (MCC) agrupa contas de anúncio. A plataforma conecta pela MCC (OAuth) e enxerga as contas vinculadas.
- Desde set/2026 não existe mais developer token: o nível de acesso à API fica no projeto do Google Cloud do cliente OAuth
  (Teste → Explorador ~2.880 operações/dia → Básico 15.000/dia, que exige verificação de marca → Padrão).
- Campanha → grupos de anúncios → palavras-chave + anúncios (RSA). Orçamento é da campanha: grupos dividem o mesmo valor.
  Mais grupos não custam mais; temas bem separados aumentam relevância e baixam o CPC.
- O Google pode gastar até 2× o orçamento diário num dia, mas no mês não passa de 30,4 × o diário.

## Google Ads: rede de Pesquisa
- Correspondências: exata [termo] = mais controle; frase "termo" = equilíbrio; ampla = alcance, só com lance por conversão
  e conversões bem medidas. Conta nova ou orçamento baixo: exata + frase.
- Negativas desde o dia 1: grátis (se não houver oferta grátis), vagas, emprego, curso, apostila, pdf, download, concurso,
  o que é, significado. Revise o relatório "Termos de pesquisa" toda semana e negative o que não tem intenção de compra.
- RSA: até 15 títulos (30 caracteres) e 4 descrições (90). Misture palavra-chave, benefício, diferencial, oferta e CTA.
  Fixe (pin) só o necessário. Meta de "Força do anúncio": Boa ou Excelente.
- Caminho de exibição (caminho1/caminho2, 15 caracteres cada) é só texto visual na linha do endereço. Não precisa existir
  no site; o clique vai sempre para a URL final, que precisa abrir.
- Extensões (recursos): sitelinks (4+), frases de destaque (4+), snippets estruturados, chamada. Aumentam CTR sem custo extra.
- Desligue "Rede de Display" e, com orçamento baixo, "Parceiros de pesquisa" na campanha de Pesquisa.
- Índice de Qualidade (1–10) = CTR esperado + relevância do anúncio + experiência na página. Nota alta = CPC menor.

## Google Ads: lances
- Maximizar cliques (com CPC máximo como teto): conta nova, sem conversões medidas, orçamento baixo.
- Maximizar conversões: quando a conversão principal já está medida e há ~15–30 conversões em 30 dias.
- CPA desejado / ROAS desejado: com 30–50+ conversões/mês. Comece o alvo perto do CPA/ROAS real e ajuste 10–20% por vez.
- Mudou estratégia ou orçamento em mais de ~20%: período de aprendizado de 1–2 semanas. Não mexa todo dia.

## Medição e conversões
- Tag do Google/GA4 no site + gclid: o clique abre a URL final com ?gclid=..., a tag guarda e devolve na conversão.
- Escolha UMA conversão principal por objetivo (ex.: cadastro/teste grátis). Compras importadas do GA4 que duplicam a
  medição ficam como secundárias. Conversões principais são as que o lance otimiza.
- Marque eventos-chave no GA4 e vincule GA4 ↔ Google Ads ↔ Search Console.
- Meta: Pixel + API de Conversões (CAPI) com o mesmo event_id para deduplicar. Eventos padrão: Lead, CompleteRegistration,
  InitiateCheckout, Purchase (com value e currency).

## Orçamento pequeno (R$ 5–30/dia)
- R$ 5/dia ≈ R$ 150/mês. Com CPC de R$ 1–4 em nichos B2B no Brasil: 1–5 cliques/dia, 30–100/mês; com 2–5% de conversão,
  1–4 conversões/mês. Serve para validar busca e página, não para escalar.
- Faça: 1 campanha, 1 grupo, 5–10 palavras exata/frase, Maximizar cliques com CPC máx. R$ 1,00–1,50, região restrita,
  negativas fortes, horário comercial se o atendimento for humano.
- Após 2–3 semanas: corte palavras que gastaram sem converter, reforce as que converteram, suba para R$ 15–20/dia se
  o custo por conversão couber na margem.

## Meta Ads
- Estrutura: campanha (objetivo) → conjunto (público, posicionamento, orçamento se ABO) → anúncios (criativos).
- Objetivos: Leads/Vendas para resultado; Tráfego e Engajamento trazem clique barato e pouca venda.
- CBO (orçamento na campanha, "Advantage+ campaign budget") distribui entre conjuntos; ABO dá controle por conjunto para testes.
- Fase de aprendizado: ~50 resultados por semana por conjunto. Orçamento baixo: poucos conjuntos, público amplo,
  Advantage+ posicionamentos. Edição significativa (orçamento >20%, público, criativo) reinicia o aprendizado.
- Criativo é a principal alavanca: 3–5 variações por conjunto, gancho nos 3 primeiros segundos, vídeo vertical 9:16 para
  Reels/Stories, 1:1 ou 4:5 para feed, legenda na tela, oferta clara, CTA.
- Fadiga: frequência > 3–4 em 7 dias com CTR caindo e CPM subindo = trocar criativo.
- Públicos: amplo (deixa o algoritmo achar), interesses para testes, semelhante (lookalike 1–3%) de compradores/leads,
  remarketing de visitantes 30–180 dias e engajadores do Instagram.

## Referências de métricas (Brasil, ordem de grandeza)
- Google Pesquisa: CTR 3–8% (abaixo de 2% = anúncio/palavra desalinhados); CPC R$ 0,80–5 na maioria dos nichos, mais em
  jurídico, saúde, seguros e finanças; taxa de conversão da página 2–8%.
- Meta: CTR (link) 0,8–2%; CPM R$ 10–40; CPC (link) R$ 0,50–3; frequência saudável < 3 em 7 dias.
- Diagnóstico rápido: CTR baixo → criativo/anúncio/segmentação; CTR bom e conversão baixa → página, oferta ou medição;
  CPC alto → concorrência, Índice de Qualidade, palavra genérica.
- Fórmulas: CTR = cliques/impressões; CPC = gasto/cliques; CPA = gasto/conversões; CPL = gasto/leads; ROAS = receita/gasto;
  CPA máximo aceitável = ticket × margem × taxa de fechamento.

## Rotina de otimização
- Diário (2 min): gasto x orçamento, campanha parada, erro de cobrança, reprovação.
- Semanal: termos de pesquisa e negativas; pausar palavras/anúncios com gasto alto e 0 conversão (ex.: gasto > 2× CPA alvo);
  comparar 7 dias x 7 anteriores; trocar criativos com fadiga.
- Mensal: realocar orçamento para o que tem melhor CPA/ROAS; testar uma variável por vez (oferta, página, criativo, público).

## A plataforma DOMUS AdPilot
- Visão geral e Campanhas: métricas sincronizadas da Meta e do Google. Na tabela dá para pausar/ativar e mudar orçamento diário.
- IA (analista e este consultor): lê os dados do workspace; pode propor pausar, ativar ou mudar orçamento, sempre como
  cartão com [Aprovar]/[Cancelar]. Nada muda sem aprovação.
- Campanhas → Nova: a IA monta um rascunho completo de campanha de Pesquisa do Google (nome, orçamento, lances, CPC,
  URL final, locais, idiomas, grupos, palavras, negativas, anúncios, sitelinks, frases de destaque). Pedido com orçamento
  baixo: peça explicitamente "1 grupo só". Rascunho é revisado e publicado só por aprovação humana.
- Ainda não dá para editar palavras-chave, anúncios ou segmentação de campanha já publicada pela plataforma: oriente a
  fazer no Google Ads/Gerenciador de Anúncios.
- Marcas: um workspace tem várias (ex.: DOMUS e o produto SIAPLUS), cada uma com cores, fontes, logo, tom e regras.
- Studio: gera vídeos e artes (posts, carrosséis) com uma das marcas salvas ou com identidade tirada de referências
  (site, Instagram, imagens enviadas). Campanhas e legendas do Instagram também escolhem a marca.
- Instagram (menu Instagram): perfil igual ao Instagram web, publicar post, carrossel, Reels e story, agendar, legenda e
  hashtags pela IA, prévia do celular e da grade. Precisa conta Profissional ligada a uma Página e a conexão Instagram.
- Conexões: Meta por token de usuário do sistema; Google pelo botão Conectar Google Ads (OAuth da MCC) + Sincronizar.
- O worker roda no PC da empresa: sem ele ligado, IA, sincronização e geração de mídia ficam na fila.
`;
