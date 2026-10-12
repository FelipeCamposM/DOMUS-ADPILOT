# DOMUS AdPilot — Manual

Plataforma interna para gerenciar tráfego pago (Meta Ads e Google Ads) com uma IA analista que usa as suas assinaturas do
Claude Code e do Codex. Este manual descreve **o que existe hoje**, como usar, como configurar e o que ficou para depois.

Spec de origem: [`spec-bygpt.md`](spec-bygpt.md). Já existem: o **MVP 1** inteiro, o **núcleo de IA** do MVP 2 e o **MVP 3 (Studio de vídeos e imagens)**, com identidade visual por workspace e anexos.

---

## 1. Primeiros passos (uma vez só)

Pré-requisitos no PC:
- Node 22+ e pnpm 10.
- Claude Code (`claude`) e/ou Codex (`codex`).
- Python 3.10+, só para a voz local do Video Studio.

FFmpeg e HyperFrames vêm pelo `pnpm install`. Outras duas peças se instalam sozinhas na primeira vez que são usadas:
- o Chrome headless do render, baixado pela HyperFrames para `~/.cache/puppeteer`;
- a voz (Kokoro), num ambiente Python isolado em `.worker-data/py`.

Nada é instalado no sistema.

```bash
pnpm install
pnpm dev          # sobe a web (http://localhost:3200) e o worker juntos
```

Todo o resto é feito na plataforma:

1. **Banco**: o worker aplica as migrations sozinho ao iniciar. Ele cria e atualiza o schema `ads` e não toca no resto
   do Supabase.
2. **Primeiro acesso**: enquanto a plataforma não tem nenhum membro, a tela de login vira "Primeiro acesso". Use um
   e-mail de `ADMIN_EMAILS`. Você vira owner e os workspaces SIAPLUS e DOMUS são criados juntos. Se o e-mail já tem
   conta no Supabase (compartilhado com os sites Domus), use a senha dessa conta; a plataforma nunca troca senha de
   conta existente.
3. **Contas de IA**: **Configurações → Contas de IA** (seção 4).
4. **Contas de anúncio**: **Conexões** (seção 5).
5. **Iniciar com o Windows**: **Configurações → Worker local → Iniciar com o Windows**. Só acontece quando você clica.

O `.env` da raiz já foi gerado com o Supabase, o R2 e o Resend do projeto `SITE_BASE_ADMIN/domus`, mais uma
`TOKEN_ENCRYPTION_KEY` nova. Todas as chaves estão explicadas em [`.env.example`](.env.example). Os e-mails em
`ADMIN_EMAILS` administram o que é global da plataforma (contas de IA e worker).

Comandos de terminal antigos (`pnpm db:migrate`, `pnpm user:create`, `pnpm worker:account …`, `pnpm worker:startup`)
continuam existindo como alternativa, mas não são necessários.

---

## 2. Como a plataforma funciona

```
Navegador ──► Next.js (Vercel)  ──►  Supabase Postgres (schema ads)  ◄──  DOMUS Worker (seu PC)
              telas + ações             fila de jobs, dados, chat           Claude Code / Codex
              Meta/Google (pausar,                                           sincronização Meta/Google
              orçamento, aprovar)
```

- **Web**: telas, login (Supabase Auth) e mudanças rápidas (pausar, ativar, orçamento, aprovar proposta da IA), que vão
  direto para a API da Meta ou do Google.
- **Worker**: processo no seu PC. Ele **busca** trabalho na tabela `ads.jobs` (sincronizações e respostas da IA) e
  grava progresso e resultado no banco. A tela de chat lê o texto chegando.
- **Banco**: tudo no schema `ads` do Supabase compartilhado, com RLS ligado e sem policies (a API pública do Supabase
  não lê nada dele). Só o servidor e o worker acessam.

> **Diferença em relação à spec:** a spec pedia Cloudflare Tunnel + `WORKER_SECRET` para a web chamar o worker. Eu
> inverti: o worker é que vai buscar o trabalho no banco. Assim o PC **não expõe nenhuma porta**, não precisa de túnel
> nem de segredo compartilhado, e um job sobrevive se o PC estiver desligado (roda quando o worker voltar). A web nunca
> manda comando: cada tipo de job tem um código fixo no worker (allowlist `SYNC_META`, `SYNC_GOOGLE`, `AI_CHAT`).

---

## 3. Telas

### Login
E-mail e senha. Não existe cadastro público: a primeira conta nasce no "Primeiro acesso" (seção 1); as demais, por um admin em
**Configurações → Membros**.

### Topo (em todas as telas)
- **Seletor de workspace** (SIAPLUS, DOMUS, clientes…): tudo o que você vê e faz vale para o workspace escolhido.
- **Buscar (Ctrl+K)**: paleta para ir a qualquer tela, achar campanha pelo nome ou abrir "Nova conversa com a IA".
  Setas + Enter.
- **Worker online/offline**: luz verde se o worker deu sinal nos últimos 90 s.
- **Sininho**: propostas da IA aguardando aprovação e jobs que falharam nas últimas 24 h.
- Contadores e status se atualizam sozinhos a cada 30 s.

### Visão geral
- Filtros numa linha: **período** (7, 14, 30, 90 dias), **plataforma**, **conta**, **campanha**. Ficam na URL (dá para
  mandar o link).
- 11 indicadores: Investimento, Impressões, Cliques, CTR, CPC, CPM, Leads, Conversões, CPA, Receita, ROAS. Cada um
  compara com o período anterior do mesmo tamanho. Em CPC, CPM e CPA, cair é bom (verde).
- Gráfico diário de uma métrica por vez (Investimento, Cliques, Resultados, Receita), com valor exato no hover e opção
  "Ver como tabela".
- Campanhas que mais investiram e um atalho "Pergunte à IA".

Definições: CTR = cliques/impressões · CPC = gasto/cliques · CPM = gasto/impressões × 1000 · CPA = gasto/conversões ·
ROAS = receita/gasto. "Resultados" no gráfico = conversões + leads.

### Campanhas
Todas as campanhas das duas plataformas: nome, conta, plataforma, status, orçamento diário, gasto, CTR, CPA, conversões,
ROAS. Ações por linha (papel Editor ou acima):
- **Pausar / Ativar**: vai direto para a Meta ou o Google e entra na auditoria.
- **Alterar orçamento**: mostra atual → novo e a variação em %. Avisa quando o aumento passa de 50% (pode reiniciar o
  aprendizado). Só aparece quando o orçamento é da campanha. Na Meta com orçamento nos conjuntos (ABO) aparece "no
  conjunto"; no Google com orçamento compartilhado a edição fica bloqueada para não afetar outras campanhas.
- **Analisar com IA**: abre uma conversa já com o pedido de análise daquela campanha.
- **Sincronizar agora**: põe na fila a sincronização de todas as conexões do workspace.

#### Nova campanha (Google Pesquisa)
Botão **Nova campanha** (Editor ou acima). Precisa de uma conta do Google Ads conectada no workspace.
- **Com IA**: escolha a conta e o orçamento diário, escreva o que quer anunciar (produto, público, oferta, região) e,
  se quiser, a página de destino (a IA lê o texto público dela). O worker monta a proposta em cerca de 1 minuto:
  2 a 5 grupos por intenção, 8 a 20 palavras-chave por grupo (frase e exata), anúncio responsivo com 12 a 15 títulos e
  4 descrições dentro dos limites do Google, negativas, frases de destaque e sitelinks (só com URLs reais).
  A IA não inventa preço, número ou depoimento e nunca negativa algo que a oferta tem.
- **Manual**: cria um rascunho em branco com nome, orçamento e URL para você preencher.

A proposta vira um **rascunho** (lista "Rascunhos" no topo de Campanhas). **Nada vai para o Google até você publicar.**
No editor:
- Campanha: nome, orçamento (com estimativa mensal), URL, conta, estratégia de lances (Maximizar cliques, com teto de
  CPC opcional; Maximizar conversões, só se as conversões já são medidas; CPC manual), localizações por nome
  ("Brasil", "Goiás", "Goiânia"), idiomas e parceiros de pesquisa.
- Grupos: palavras-chave uma por linha na notação do Google (`[exata]`, `"frase"`, ampla), negativas do grupo, títulos e
  descrições com contador de caracteres (fica vermelho ao passar do limite) e o caminho exibido.
- Negativas da campanha, frases de destaque e sitelinks.
- **Prévia na busca**: o anúncio como aparece no Google, com os títulos girando de 3 em 3.
- A lista de ajustes pendentes aparece em tempo real; os botões só liberam quando tudo está dentro das regras.
- **Ajustar com IA**: peça mudanças em texto ("mais palavras de cauda longa", "um grupo só para Goiânia").
- **Validar no Google**: o Google confere a campanha inteira sem criar nada (modo "validateOnly" da API).
- **Publicar (pausada)** (Admin/Owner): cria tudo numa única operação atômica (se algo falhar, nada é criado) e a
  campanha nasce **PAUSADA**. Ela aparece na lista de Campanhas; ative quando quiser que rode. Fica na auditoria.
  Se o Google recusar algo, a mensagem diz qual item (ex.: "palavra-chave “…”: …").

Por enquanto a criação é só de campanhas de **Pesquisa do Google**. Performance Max, Meta e edição de grupos e anúncios
de campanhas já publicadas ficam para as próximas etapas; nelas, continue usando o Google Ads.

### IA (chat)
Interface no estilo do terminal do Claude Code: a lista de conversas (histórico) fica à esquerda e o chat à direita.
- Escolha **Auto**, **Claude** ou **Codex** no seletor do composer. Auto usa a conta disponível de maior prioridade.
- A resposta chega em tempo real. Abaixo dela aparecem a conta, o modelo, os tokens, o tempo e o custo informado pelo
  CLI.
- A IA recebe a cada mensagem um retrato atualizado do workspace: campanhas com 7 dias, 7 dias anteriores e 30 dias
  (gasto, CTR, CPC, conversões, CPA, leads, receita, ROAS).
- **A IA não altera nada sozinha.** Quando sugere uma mudança, ela aparece como cartão com **[Aprovar]** e
  **[Cancelar]**. Só a aprovação chama a API da Meta ou do Google, e a auditoria registra a origem "Recomendação da IA".
  Uma proposta só pode ser decidida uma vez. Se a API recusar, o cartão mostra o motivo e nada muda.
- Propostas permitidas: pausar campanha, ativar campanha e alterar orçamento diário. A IA só propõe para campanhas
  deste workspace; propostas para campanhas de outro workspace são descartadas.
- **Troca automática de conta:** se a conta em uso bater o limite de 5 h ou o semanal, ou estiver deslogada, aparece
  um aviso acima da resposta ("… atingiu o limite; volta às 18:00. Continuando em outra conta…") e a **mesma
  pergunta** segue na próxima conta (Claude ou Codex), levando o histórico que a nova conta ainda não viu. A conta
  esgotada sai do rodízio até o horário de reset e volta sozinha.
- O título da conversa vem da primeira pergunta. Conversas podem ser apagadas, e a resposta pode ser parada no meio (botão **Parar**).

Exemplos que funcionam bem:
- "Como está o SIAPLUS hoje?"
- "Quais campanhas estão desperdiçando dinheiro?"
- "Qual campanha tem o melhor CPA?"
- "Aumente 20% das campanhas com ROAS acima de 4." (vira uma proposta por campanha, para aprovar)

### Consultor de tráfego (bolha no canto direito)
Botão redondo no canto inferior direito de todas as telas. É um gestor de tráfego sênior para tirar dúvidas a qualquer
hora: conceitos (correspondência, lances, Índice de Qualidade), configuração do Google Ads e da Meta, orçamento pequeno,
medição de conversões e diagnóstico. Também lê os dados do workspace (campanhas com métricas, rascunhos, conexões e o
"Sobre a marca") e pode deixar propostas de pausar/ativar/orçamento para aprovar, como o chat da IA.
- **Histórico** (ícone de relógio): conversas do consultor, separadas das do chat IA. Abrir retoma de onde parou.
- **+**: nova conversa. **Esc** fecha. A última conversa reabre sozinha.
- **Vê a tela aberta**: cada pergunta leva a rota, o texto visível e os campos preenchidos da página. Num rascunho de
  campanha, ele recebe a campanha completa (versão salva) e faz o ajuste que você pedir, por exemplo "deixe só 1 grupo,
  o orçamento vai ser R$ 5/dia": a proposta aparece como cartão **[Aprovar]/[Cancelar]** e só muda o rascunho depois de
  aprovada. Salve o editor antes de pedir, senão ele trabalha sobre a última versão salva.
- A base de conhecimento fica em `apps/worker/src/ai/conhecimento.ts`: edite para ensinar algo novo (reinicie o worker).

### Studio (vídeos e imagens)
Gera vídeos e imagens de anúncio a partir de um briefing. Tudo roda no PC do worker, sem custo de API: usa as suas
contas de IA, a voz local e o render local. O seletor **Vídeo | Imagem** fica no topo de "Novo".

**Em todo vídeo e imagem entram:**
- **A identidade visual do workspace** (Configurações → Identidade visual): cores, fontes, logo, tom de voz, regras e
  referências. A IA segue isso sem precisar repetir no briefing.
- **Arquivos** enviados na hora ou escolhidos da biblioteca, cada um marcado como:
  - **Colocar na arte**: logo, print do sistema, foto ou vídeo do produto. Entra no vídeo/imagem (prints viram mockup).
  - **Inspiração**: serve de referência de estilo e não entra.

  Cada arquivo aceita uma nota (ex.: "print na cena 2"). A IA **abre e olha cada imagem** antes de criar. Ela só
  consegue ler arquivos da pasta daquele projeto; fora dela o acesso é negado.
- **Links** (site do produto, post ou perfil do Instagram, referência): o worker lê a página e passa para a IA o texto,
  **até 6 fotos** (salvas na pasta do projeto como `assets/refN-M.jpg`, que a IA olha e pode colocar na arte) e as
  **cores** (do CSS do site e as predominantes de cada foto). Links escritos no meio das **orientações** também valem
  (até 6 no total). Links para a rede local (localhost, 192.168…, 10…) são recusados.
  - **Instagram:** de um **post** (`instagram.com/p/…`) vem a foto do post. De um **perfil**, sem login, vêm só a bio
    e miniaturas pequenas (240 px) dos últimos posts: boas para a paleta, fracas para usar na arte. Para fotos grandes,
    cole links de posts ou envie as imagens.
  - As fotos baixadas não aparecem na biblioteca; somem quando o projeto é apagado.
- **Imagens enviadas:** além de a IA olhar, o worker extrai as cores predominantes de cada uma.

**Identidade visual (vídeo e imagem):** escolha no topo da coluna da direita.
- **Do workspace:** usa a marca de Configurações → Marca (cores, logo, fontes, tom).
- **Das referências:** para criar peças de **outra marca** dentro do mesmo workspace (ex.: um carrossel para um
  cliente). A marca do workspace e o logo dela não entram; a paleta vem dos links e imagens, e as cenas prontas dos
  vídeos são pintadas com ela (fundo, destaque, texto). Workspace sem marca configurada já começa nesta opção.
- Peça nas orientações o que quiser, ex.: "use as fotos do site https://… e as cores do Instagram deles".

**Botão de gerar:** precisa do **produto** e do **objetivo ou das orientações** (o objetivo é opcional quando as
orientações explicam a peça). Enquanto faltar algo, aparece embaixo do botão o que preencher.

**Orientações para a IA (vídeo e imagem):** campo livre no topo do briefing (até 4000 caracteres). Escreva do que se
trata a peça como se falasse com um diretor de criação: história, tom, o que mostrar, o que evitar. A IA segue isso com
prioridade em todas as etapas (roteiro/conceitos, animação/arte e ajustes), sem inventar fatos.

**Arquivos, inspirações e links:** arraste arquivos (imagens e vídeos) para o quadro, ou clique para escolher. Cada um
mostra um mini-preview na hora, já durante o envio (vídeo toca ao passar o mouse). Arrastar um link do navegador para o
quadro adiciona o link. Até 12 arquivos e 8 links por projeto.

**Nova imagem:**
- **Tipo:** **Imagens avulsas** (1 a 4 variações, conceitos diferentes, para teste A/B) ou **Carrossel**.
- **Carrossel:** de 2 a 20 slides (o limite atual do Instagram), em 1:1 ou 4:5. Os slides contam uma história só:
  capa com gancho, desenvolvimento (um ponto por slide) e CTA no último, com o mesmo design (fundo, fontes, grade,
  indicador "1/N", sinal de "deslize" na capa e elementos que continuam de um slide para o outro). Na aprovação dá para
  editar o texto de cada slide, reordenar (setas), remover e **Adicionar slide** até 20. A IA desenha em lotes de 4,
  sempre a partir do visual do slide 1. Na tela do projeto os slides aparecem em sequência (role para o lado),
  **Baixar carrossel** baixa todos os PNG numerados e **Outro carrossel** planeja um novo (o atual só é trocado quando
  você aprovar o novo).
- **Briefing:** produto, objetivo, argumentos, público, CTA, texto obrigatório (opcional), cores e estilo.
- **Formato:** 1:1, 4:5, 9:16 ou 1,91:1 (anúncio com link). Carrossel: 1:1 ou 4:5.
- Cerca de 1 minuto por imagem ou slide, depois da aprovação.
- **Editor visual** (botão **Editar** em cada imagem ou slide): abre a própria arte gerada, sem conversão, então nada
  se perde (fontes, gradientes, vidro, brilho e ilustrações ficam iguais). Clique em qualquer elemento para
  selecionar e arraste para mover; a alça roxa no canto muda o tamanho; duplo clique num texto edita ali mesmo.
  No painel: tamanho, rotação, opacidade, fonte e cor do texto, trazer para frente/enviar para trás, duplicar,
  apagar, voltar ao original e **Grupo** (seleciona o bloco em volta, ex.: o card inteiro). **Adicionar texto**
  cria um texto novo no estilo da arte. Ao arrastar, uma linha rosa marca o centro do quadro. Atalhos: setas
  (Shift = 10 px), Esc, Delete, Ctrl+D, Ctrl+Z / Ctrl+Shift+Z. **Salvar e gerar PNG** manda a arte editada para o
  PC, que gera o PNG de novo **sem usar a IA**; "Ajustar com IA" depois continua a partir da versão editada.
- **Aprovação antes de gastar:** primeiro a IA só propõe os conceitos (ideia, headline, apoio, CTA e descrição
  visual) e o projeto fica em **Esperando aprovação**. Edite os textos, remova os conceitos que não quiser, peça
  **Outros conceitos** ou clique em **Aprovar e gerar**. Só então a IA desenha e o PC renderiza, usando os textos
  exatamente como você deixou. Em "Mais 2 variações" vale o mesmo, e **Descartar** volta às imagens que já existiam.
- Cada arte é desenhada em HTML/CSS, passa pela mesma barreira de segurança e pelo lint e é capturada em PNG na
  resolução cheia.
- **Na tela do projeto:** as variações (A, B, C…) lado a lado, **PNG** para baixar, **Ajustar com IA** em uma variação
  específica (ex.: "headline maior, logo no topo") e **Mais 2 variações** (sempre diferentes das que já existem), além de
  apagar uma variação ou o projeto.

**Novo vídeo:**
- **Briefing:** produto, objetivo, descrição/argumentos (a IA só afirma o que estiver aqui), público, CTA, cores e estilo.
- **Formato:** 9:16 (Reels/Stories/Shorts), 4:5, 1:1 ou 16:9.
- **Duração:** 10, 15, 20, 30, 45 ou 60 s.
- **Voz:** local e grátis (Dora feminina; Alex e Santa masculinas), sem voz, ou, se a chave estiver configurada
  (Configurações → Vozes), qualquer voz da sua conta ElevenLabs, inclusive clonadas. O botão ▶ toca a amostra.
  O ElevenLabs cobra pelos caracteres falados, na sua conta de lá.
- **Música:** **Automática** (padrão: a IA escolhe o clima), um clima específico ou sem música. Se houver música
  licenciada daquele clima em Criativos → Biblioteca, ela é usada; se não houver, o worker **compõe uma trilha
  original** para o vídeo (pad, baixo, bateria e arpejo no BPM do clima, com a duração exata do vídeo). A trilha é
  gerada no PC, então não há problema de licença.
- **Efeitos sonoros:** ligados ou desligados.
- **Estilo visual:**
  - **Tech HUD** (padrão): escuro, grade, neon, vidro; movimento rápido e preciso.
  - **Claymorphism 3D**: formas de massinha com volume e sombras suaves, cores pastel; movimento elástico com quique.
  - **Editorial**: visual de revista, serifada grande, fios finos, uma cor de destaque; movimento lento e elegante.
  - **Livre (IA)**: a IA escreve a animação do zero (mais variedade, resultado menos previsível).

  Nos três primeiros, o vídeo é montado com **cenas prontas**: a IA escolhe o tipo de cada cena e escreve os textos, e o
  layout e o movimento vêm de modelos testados. Os tipos são abertura, título, lista, número, antes/depois, produto
  (tela num celular ou navegador, com o print enviado se houver), depoimento e CTA. As cores e fontes da identidade
  visual do workspace substituem as do estilo.
- **Legenda da narração:** ligada ou desligada. Aparece em blocos curtos (até 5 palavras), cada um no ar enquanto é
  falado, com a palavra da vez acesa.

O que acontece, etapa por etapa (a tela do projeto mostra ao vivo):
1. **Roteiro e storyboard**: a IA escreve as cenas (tipo de cena, título, apoio, itens, narração e efeitos), em JSON
   validado, com texto curto: título até 7 palavras, apoio até 12, itens até 6. A primeira cena é o gancho e a última, o CTA.
   **Tempo de leitura é regra**: cada cena dura no mínimo o necessário para ler o texto fixo (cerca de 0,3 s por
   palavra, com entrada e saída). Por isso o vídeo pode ficar um pouco mais longo que a duração pedida.
   **Aqui o projeto para em "Esperando aprovação".** Revise as cenas (cada uma mostra o tipo), edite título, apoio,
   itens e narração, troque a música e
   clique em **Aprovar e gerar vídeo**. Narração (inclusive ElevenLabs), animação e render só rodam depois disso.
   Se não gostar, **Roteiro novo** pede outro roteiro (de novo para aprovar).
2. **Narração**: cada cena é gravada com a voz escolhida (Kokoro local ou ElevenLabs). A cena dura o maior entre a
   fala e o tempo de leitura; os efeitos acompanham. Com ElevenLabs, o worker também recebe o instante de cada palavra.
3. **Trilha**: música da biblioteca ou trilha composta. A trilha composta informa as batidas e os compassos.
4. **Animação**: nos estilos com cenas prontas, o worker monta a composição sozinho, sem IA e sem gastar crédito
   (`apps/worker/src/video/kit/cenas.ts` e `cenas-runtime.ts`). O texto **encolhe para caber** na área segura (no
   vertical, fora das faixas da interface do Reels), entra em sequência curta, fica parado para leitura e sai pouco antes
   do corte. Cada estilo tem fundo, moldura, transição e "personalidade" de movimento próprios.
   No estilo **Livre**, a IA escreve a composição em HTML + GSAP usando o **Motion Kit**
   (`apps/worker/src/video/kit/motion-kit.ts`), que traz:
   - fundo vivo com grade e partículas, moldura de HUD com cantos, timecode e barra de progresso;
   - câmera com profundidade 3D em toda cena, painéis de vidro, cartões em leque, prompt digitando, contadores,
     anéis, gráficos e partículas;
   - legenda cinética palavra a palavra, com palavras-chave destacadas e sincronizada com a voz;
   - transições no corte (flash, varredura, faixa de texto) e entradas importantes caindo nas batidas da música.

   Antes de renderizar, a composição passa por:
   - uma barreira de segurança: sem rede, sem aleatoriedade, scripts só do GSAP, do Motion Kit e das cenas prontas;
   - o `hyperframes lint`;
   - o **controle de qualidade visual**: o Chrome do PC abre o vídeo, avança a cada 0,2 s e mede o texto de verdade.
     Aponta texto saindo do quadro (ou entrando na faixa da interface do Reels), textos sobrepostos e texto que fica
     pouco tempo na tela para ser lido.

   No estilo Livre e no "Ajustar com IA", os problemas voltam para a IA corrigir (até 2 vezes). Nas cenas prontas, que já
   nascem testadas, um problema que ainda apareça vira aviso na tela do projeto.
5. **Render**: a HyperFrames gera o MP4 quadro a quadro (Chrome headless), em H.264 a 30 fps.
6. **Mixagem** (FFmpeg): junta voz, efeitos e música. A música abaixa sozinha quando a voz fala (ducking). O volume
   é normalizado em -16 LUFS e o áudio sai em AAC. Também é gerada uma miniatura.
7. **Armazenamento**: o MP4 e a miniatura são gravados no PC (seção "Armazenamento", abaixo). O vídeo vira um
   criativo pronto em **Criativos**. Cada nova versão (ajuste, novo render) apaga a anterior.

Tempo típico: 3 a 6 minutos para 15 s. A primeira narração do PC leva cerca de 1 minuto a mais, porque prepara a voz.

Na tela do projeto:
- **Player** e **Baixar MP4**.
- **Ajustar com IA**: descreva a mudança (ex.: "transições mais rápidas, CTA maior"). A IA altera a animação, mantendo
  os tempos e a narração já gravada. Leva cerca de 1,5 min.
- **Storyboard editável**: mude títulos, textos de apoio e narração, depois clique em **Salvar e gerar**. A voz é
  regravada e os tempos se ajustam.
- **Roteiro novo** (refaz tudo), **Cancelar** e **Apagar** (apaga também os arquivos).

A lista do Studio mostra o progresso de cada projeto. Passando o mouse, a miniatura de um vídeo vira prévia em
movimento.

**Armazenamento (R2 + arquivo no Google Drive):** com `STORAGE=r2` (o padrão em produção), vídeos, imagens e áudios
ficam no **Cloudflare R2**, de onde o site online mostra e baixa direto. A estrutura é
`ads/workspaces/<id>/videos|images|thumbnails|music|sfx/`; o banco guarda só a chave.

- **Cópia no Drive:** com `DRIVE_DIR` no `.env` (a pasta do Google Drive para computador, ex.:
  `G:\Meu Drive\AdPilot`), o worker guarda uma cópia de tudo que gera. O Google Drive para computador sobe para a nuvem.
- **Arquivamento automático:** a cada 30 min o worker soma o que o AdPilot ocupa no R2. Passou de `R2_LIMITE_GB`
  (padrão 6, porque o bucket grátis de 10 GB é dividido com a Domus), os arquivos **menos usados** (nada usado nas
  últimas 24 h) saem do R2 e ficam só no Drive. Miniaturas nunca saem.
- **Restauro automático:** abrir um arquivo arquivado pede ao worker que o traga de volta. Imagens mostram "Arquivado no
  Drive, restaurando…" e o vídeo mostra um aviso; recarregue em alguns segundos. **O worker do PC precisa estar ligado.**
- **Mídia antiga do PC:** `pnpm media:migrar` sobe para o R2 (e copia no Drive) o que ainda estava como armazenamento
  local. Pode rodar de novo sem problema. Depois, a pasta `MEDIA_DIR` pode ser apagada.
- `STORAGE=local` ainda existe (tudo no disco do PC, em `MEDIA_DIR`), mas aí a web só funciona no mesmo PC do worker.

### Criativos
- **Vídeos** e **Imagens**: tudo que o Studio gerou no workspace (clique para abrir o projeto).
- **Arquivos**: o que você enviou (logo, prints, fotos, vídeos do produto; imagem até 25 MB, vídeo até 300 MB). Podem
  ser anexados em qualquer projeto do Studio ou escolhidos como logo na identidade visual.
- **Músicas**: biblioteca de músicas **licenciadas**, com clima (corporate, technology, dark, energetic, emotional,
  minimal, premium). O envio exige declarar a licença ou origem. A IA escolhe a música pelo clima pedido; sem música
  daquele clima, o worker compõe uma trilha original. A plataforma nunca usa música de terceiros sem licença.
- **Efeitos sonoros**: whoosh, impact, click, pop, notification, typing, success, transition, bass e interface.
  Sem efeito enviado, o vídeo usa os efeitos padrão, sintetizados pelo próprio FFmpeg e livres de direitos.
  Efeitos enviados têm prioridade.
- **Uploads**: no armazenamento do PC, o arquivo vai do navegador para a própria plataforma, que grava em
  streaming no disco e confere o tamanho. Com `STORAGE=r2`, vai direto para o R2 por URL pré-assinada (as credenciais
  nunca chegam ao navegador; o CORS do bucket precisa aceitar a origem, seção 7).

### Jobs
Fila do worker: sincronizações e respostas da IA, com status, progresso, tentativas e erro. Clique numa linha para ver
o log ao vivo. Jobs pendentes ou rodando podem ser cancelados. Sincronizações que falham tentam de novo sozinhas (até 3
vezes, com espera crescente).

### Conexões (Admin)
- **Meta Ads**: cole o token de System User (seção 5). Ele é validado na hora, listando as contas, e salvo
  cifrado. Logo depois uma sincronização entra na fila.
- **Google Ads**: botão "Continuar com Google" (OAuth). Exige as variáveis do Google no servidor (seção 5).
- Cada conexão mostra as contas de anúncio e o número de campanhas, a última sincronização e o erro, se houver
  (ex.: token expirado). Botões **Sincronizar** e **Remover**. Remover apaga da plataforma as contas, campanhas e
  métricas daquela conexão; **nada muda na Meta nem no Google**.
- Sincronização automática: o worker sincroniza cada conexão a cada `SYNC_INTERVAL_MIN` minutos (padrão 60).
  Cada sincronização traz as campanhas e as métricas diárias dos últimos 30 dias.

### Auditoria
Toda alteração com data, usuário, ação, item, antes → depois e origem (Usuário, Recomendação da IA, Sistema). Entram:
pausar/ativar, orçamento, conexões, membros, workspace e contas de IA.

### Configurações
- **Workspace**: renomear (Admin) e criar um workspace novo para um cliente ou produto (quem cria vira owner).
- **Identidade visual** (Admin):
  - Cores com nome. A 1ª é o fundo, a 2ª o destaque e a 3ª o texto.
  - Fontes do Google Fonts para títulos e textos, com sugestões.
  - Logo, escolhida dos arquivos ou enviada na hora.
  - Sobre a marca, tom de voz, regras (faça/não faça) e links de referência.

  Uma prévia ao lado mostra a marca aplicada. Tudo isso entra automaticamente em todo vídeo e imagem do Studio daquele
  workspace.
- **Membros** (Admin): adicionar por e-mail com papel. Se a pessoa não tem conta, informe uma senha provisória e
  repasse a ela; nenhum e-mail é enviado, porque o Supabase é compartilhado com outros sites. Também dá para alterar o
  papel e remover.
  Papéis: **Owner/Admin** gerenciam conexões e membros · **Editor** opera campanhas e a IA · **Leitura** só consulta.
- **Contas de IA**: conectar, importar, refazer login, remover, prioridade e o uso de cada conta (5 h e semana,
  bloqueio até o reset, tokens e custo dos últimos 30 dias, último erro). Detalhes na seção 4.
- **Vozes** (admin da plataforma): cole a chave da API do ElevenLabs (elevenlabs.io → Developers → API Keys) e clique
  em **Salvar chave**. A chave é testada antes de salvar, fica cifrada no banco e nunca vai para o navegador. O status
  mostra quantas vozes a conta tem. **Remover** volta a usar só a voz local. Opcional: a variável
  `ELEVENLABS_API_KEY` no `.env` funciona como alternativa (a da tela tem prioridade).
- **Worker local**: online/offline, máquina, versão do Node, intervalo de sincronização e o botão **Iniciar com o
  Windows**.
- **Minha conta**: trocar a senha.

---

## 4. Contas de IA (tudo pela tela)

Em **Configurações → Contas de IA** (admin da plataforma, com o worker online):

- **Conectar conta**: escolha **Claude** (assinatura Pro/Max) ou **Codex** (assinatura ChatGPT), dê um nome e clique
  em Continuar. O worker abre o login no PC dele, numa pasta só desta conta, e a tela mostra o que fazer:
  - **Claude**: botão "Abrir página de login". Entre com a conta e, no fim, a página mostra um código. Cole o código na
    plataforma e clique em Conectar.
  - **Codex**: botão "Abrir página" (auth.openai.com) e um código como `KIXF-UOTYH`. Digite o código na página da
    OpenAI e pronto: a plataforma percebe sozinha.

  Nenhuma senha passa pela plataforma. O código do Claude é apagado do banco assim que o worker o usa. O login expira
  em 15 minutos se não for concluído.
- **Primeira vez**: se a plataforma ainda não tem nenhuma conta de IA, o worker importa sozinho as contas que já
  estão logadas neste PC (login padrão do Windows e perfis do OMNI). Não precisa clicar em nada.
- **Procurar contas já logadas neste PC**: o worker acha o login padrão do Windows (`~/.claude`, `~/.codex`) e os perfis
  do OMNI Agents. Cada conta encontrada aparece com e-mail e plano e um botão **Importar**. A conta importada continua
  funcionando normalmente no OMNI e no terminal. A busca também roda sozinha ao iniciar o worker e a cada 10 minutos.
- Em cada conta: **Refazer login** (quando expira; o worker também detecta e avisa "Login expirado"), **Ativar /
  Desativar**, **Prioridade** (menor número = usada primeiro), **Liberar** antes do reset e **Remover**. Ao remover,
  a pasta de login criada pela plataforma é apagada pelo worker depois de 1 hora. Pastas importadas (OMNI, padrão do
  Windows) nunca são apagadas.

Cada conta tem a sua própria pasta de configuração (`CLAUDE_CONFIG_DIR` ou `CODEX_HOME`, em `.worker-data/accounts/`
quando foi conectada pela plataforma). Assim várias assinaturas convivem sem uma deslogar a outra, como no OMNI Agents.

Ordem de escolha numa conversa: a conta que já tem sessão nessa conversa (retomada mais barata), depois a prioridade.

Onde o uso é lido:
- **Claude**: evento `rate_limit_event` que o próprio Claude Code emite a cada resposta (percentual e reset de 5 h e da
  semana).
- **Codex**: último `token_count` do arquivo de sessão (`sessions/…/rollout-*.jsonl`) da conta.

Isolamento (a IA só lê os dados que o worker manda):
- Claude roda com `--tools ""` e `--strict-mcp-config`: sem ferramentas, sem MCP, sem arquivos.
- Codex roda com `--ignore-user-config`, sandbox `read-only` e shell, navegador, computer use, apps e plugins
  desligados.
- Cada conversa tem a própria pasta de trabalho em `.worker-data/conversations/<id>/`.

---

## 5. Credenciais das plataformas de anúncio

### Meta Ads (token de System User)
1. Business Manager → **Configurações do negócio → Usuários → Usuários do sistema** → Adicionar (função Admin).
2. **Atribuir ativos**: as contas de anúncio, com controle total.
3. **Gerar token**: escolha o app do negócio e marque `ads_management` e `ads_read`. Sem expiração, se o app permitir.
4. Na plataforma: **Conexões → Conectar Meta Ads**, cole o token.
5. Opcional: `META_APP_SECRET` no `.env` faz toda chamada levar `appsecret_proof`.

### Google Ads (do zero)
São 2 coisas: uma **conta de administrador** (MCC) e um **cliente OAuth** num projeto do Google Cloud (para o botão
"Conectar Google Ads" funcionar). Use o mesmo e-mail Google da empresa em tudo. Desde setembro de 2026 o Google não usa
mais developer token: o nível de acesso à API fica no **projeto do Google Cloud** que tem o cliente OAuth.

1. **Conta de administrador (MCC)**: em `ads.google.com/home/tools/manager-accounts` → "Criar conta de administrador"
   (país Brasil, moeda BRL). Dentro dela, vincule as contas de anúncio que já existem (Contas → + → "Vincular conta
   existente"; o dono da conta aceita o convite) ou crie uma conta nova.
2. **Nível de acesso**: no Google Cloud, em **APIs e serviços → Google Ads API** (página de visão geral), peça o acesso
   **Explorador** (contas reais, cerca de 2.880 operações/dia, suficiente para uso interno). Para o **Básico** (15.000/dia)
   o Google exige antes a **verificação de marca** (Google Auth Platform → Central de verificação: página inicial e
   política de privacidade no domínio, domínio verificado no Search Console). A "Central de API" do Google Ads agora
   serve só para a API App Conversion Tracking: não use.
3. **Google Cloud** (`console.cloud.google.com`):
   - Crie um projeto (ex.: "DOMUS AdPilot").
   - Em **APIs e serviços → Biblioteca**, procure **Google Ads API** e clique em **Ativar**.
   - Em **Tela de consentimento OAuth** (Google Auth Platform): tipo **Externo** (ou **Interno**, se o e-mail for do
     Google Workspace), nome do app e e-mail de suporte. Em "Usuários de teste", adicione o e-mail que vai conectar.
     Com o app em modo **Teste**, o Google derruba a conexão a cada 7 dias. Para não precisar reconectar, clique em
     **Publicar app**. Para uso interno, dá para seguir com o aviso de "app não verificado".
   - Em **Credenciais → Criar credenciais → ID do cliente OAuth**: tipo **Aplicativo da Web**, e em "URIs de
     redirecionamento autorizados" adicione `http://localhost:3200/api/connections/google/callback` (e, quando houver,
     `https://SEU-DOMINIO/api/connections/google/callback`). Copie o **ID do cliente** e a **Chave secreta**.
4. `.env` (raiz do projeto):
   ```
   GOOGLE_ADS_CLIENT_ID=<ID do cliente OAuth>
   GOOGLE_ADS_CLIENT_SECRET=<chave secreta OAuth>
   GOOGLE_ADS_LOGIN_CUSTOMER_ID=<id da MCC, só números, sem traços>
   ```
   Reinicie o `pnpm dev` (o `.env` só é lido ao iniciar).
5. Na plataforma: **Conexões → Conectar Google Ads**, entre com o e-mail que acessa a MCC e autorize. As contas
   clientes da MCC entram sozinhas; depois clique em **Sincronizar**.

Versões das APIs: Meta `v26.0` e Google Ads `v25`, configuráveis em `META_API_VERSION` e `GOOGLE_ADS_API_VERSION`.
O Google lança versão nova todo mês e desativa as antigas depois de cerca de 1 ano; quando isso acontecer, troque a
variável.

Métricas por plataforma:
- Meta: leads = ação `lead`; conversões e receita = compras (`omni_purchase`/`purchase`).
- Google: conversões e receita = `metrics.conversions`/`conversions_value`; leads ficam 0, porque o Google não separa.

---

## 6. Worker iniciando com o Windows

Em **Configurações → Worker local**, clique em **Iniciar com o Windows**. O worker registra a tarefa "DOMUS Worker"
no Agendador de Tarefas (logon do seu usuário). O mesmo botão desliga.

- Só existe um worker por PC. Se a tarefa já estiver rodando e você usar `pnpm dev`, o segundo worker percebe e sai
  sozinho.
- Se o worker cair, o Agendador reinicia em 1 minuto.
- Log em `.worker-data/worker.log`.
- Para remover: `powershell -ExecutionPolicy Bypass -File apps/worker/scripts/inicializacao.ps1 -Remover`.
- Ao reiniciar, jobs que estavam rodando voltam para a fila. Uma resposta da IA interrompida fica marcada como erro e é
  respondida de novo.
- Com o PC desligado, a plataforma continua no ar: os dados ficam como estavam e a fila espera.

---

## 7. Deploy da web na Vercel

1. Importe o repositório. Em **Root Directory** use `apps/web`; o framework é Next.js.
2. Copie as variáveis do `.env` para o projeto: as de Supabase, `TOKEN_ENCRYPTION_KEY`, `ADMIN_EMAILS` e as de
   Meta/Google, **`DATABASE_URL`** (o pooler em modo transação, porta 6543; o modo sessão tem só 15 clientes e esgota) e as
   do **R2** com **`STORAGE=r2`** (a web assina as URLs de vídeo e de upload). **Não** são necessárias na Vercel: as do
   worker (`WORKER_*`, `MEDIA_DIR`, `DRIVE_DIR`).
   Em produção: projeto `domus-adpilot`, domínio `adpilot.digitaldomus.com.br` (CNAME `adpilot` → `cname.vercel-dns.com`
   na Cloudflare, sem proxy), funções em São Paulo (`gru1`).
3. Adicione o domínio de produção ao redirect do OAuth do Google (seção 5).
4. **CORS do bucket R2** (para enviar músicas e efeitos pelo navegador): no painel da Cloudflare, em R2 → bucket →
   Settings → CORS Policy, inclua `PUT`, `GET` e `HEAD` para a origem da plataforma (`http://localhost:3200` em
   desenvolvimento e o domínio de produção). Sem isso, ver e baixar vídeos funciona, mas o upload na biblioteca é recusado.
   **Já feito:** uma regra separada para `https://adpilot.digitaldomus.com.br` e `http://localhost:3200`; a regra dos
   sites da Domus ficou como estava.

---

## 8. Segurança (resumo)

- Tokens da Meta e do Google ficam cifrados (AES-256-GCM) e nunca vão para o navegador.
- O workspace atual vem de um cookie, mas toda ação confere se você é membro dele. Toda consulta filtra por workspace.
- Toda entrada é validada com Zod, com mensagens em português. Toda mudança de campanha gera auditoria.
- A IA não executa nada; mudança de gasto só com aprovação humana.
- O frontend não manda comando de shell; o worker não abre porta.
- Retry com espera em limite de API (Meta códigos 4/17/32/613/80000+, Google `RESOURCE_EXHAUSTED`, HTTP 429/5xx).

---

## 9. Para desenvolvedores

```
apps/web        Next.js 16 (App Router). modules/<feature>/ = componentes + Server Actions; lib/ = servidor
apps/worker     Node + tsx. src/index.ts (fila), src/ai/ (CLI, contexto, failover), src/accounts-cli.ts
packages/core   banco, cripto, dinheiro, providers Meta/Google (interface AdsProvider), sync, jobs, ações da IA
packages/core/migrations   SQL aplicado pelo worker ao iniciar (nunca editar uma já aplicada: criar 003_…)
```

```bash
pnpm typecheck   # TypeScript nas 3 partes
pnpm test        # dinheiro sem float, parser de propostas da IA, detecção de limite/uso
pnpm build       # build de produção da web
```

Design: estrutura do SIAPLUS Design System v2 (`apps/web/app/ds-*.css`) com a identidade DOMUS: roxo `#9B49F5` →
`#8030E7` → `#621CCB` (mesmo gradiente da landing DOMUS), lilás `#DDA9F6` para texto em destaque e a logo/favicon
DOMUS (`app/icon.png`). Fundo escuro `#0A0A0E`. Verde só para sucesso (alta, online, ativa). Tailwind v4 mapeado nos
mesmos tokens: para mudar a marca, troque os `--c-brand*` em `ds-tokens.css`. Movimento com GSAP:
- entrada em cascata a cada navegação (`data-enter`);
- indicador da sidebar que desliza;
- números que contam até o valor;
- gráfico que se desenha;
- modais e menus com mola;
- campo de pontos em WebGL no login (shader do hero do SIAPLUS);
- luz que segue o mouse nos cartões (`.spotlight`).

Com "reduzir movimento" ligado no sistema, tudo aparece sem animação.

---

## 10. O que ainda não existe (próximas etapas da spec)

| Etapa | Itens |
|---|---|
| MVP 2 (resto) | AI Campaign Builder, wizard de criação de campanha, duplicar campanha, editar conjuntos/grupos e anúncios |
| MVP 3 (resto) | voz da OpenAI (a interface `TTSProvider` já existe) |
| MVP 4 | vídeo → criativo → campanha → publicação → monitoramento |
| Outros | públicos, automações, Supabase Realtime (hoje: atualização por polling, 0,7 s no chat e 30 s no topo) |

Tabelas que a spec lista e que ainda não foram criadas, por não terem uso nesta etapa: `ad_groups`, `ads`,
`creative_assets`, `audiences`, `automation_rules`. Elas entram por migration quando a etapa correspondente começar.
