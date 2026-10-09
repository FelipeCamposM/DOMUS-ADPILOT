# SPEC - DOMUS Ads + Video Studio

## 1. Objetivo

Construir uma plataforma web interna para centralizar:

1. Gestão de tráfego pago no Meta Ads e Google Ads.
2. Criação e gerenciamento de campanhas.
3. Análise de métricas e performance.
4. Uso do Claude CLI como agente para analisar, planejar e gerar campanhas.
5. Criação automática de vídeos motion via código.
6. Geração de voz, efeitos sonoros e composição final dos vídeos.
7. Publicação dos criativos gerados diretamente nas campanhas.

A plataforma deve inicialmente atender:

- SIAPLUS
- DOMUS
- futuros produtos/clientes

A arquitetura deve ser multitenant, permitindo vários workspaces.

---

# 2. Stack

## Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- hospedado na Vercel

## Banco e autenticação

Utilizar o projeto Supabase já existente.

Usar:

- PostgreSQL
- Supabase Auth

Não utilizar Supabase Storage.

Sempre que possível, criar as tabelas dentro de um schema próprio:

```sql
ads
```

Exemplo:

```text
ads.workspaces
ads.campaigns
ads.creatives
ads.jobs
```

---

# 3. Storage

Utilizar Cloudflare R2 como storage principal.

O R2 armazenará:

- imagens
- vídeos
- thumbnails
- arquivos de áudio
- narrações
- músicas
- efeitos sonoros
- renders temporários ou finais
- assets usados nos vídeos

O banco deve armazenar apenas:

- chave do arquivo
- URL
- metadata
- tamanho
- tipo
- duração
- dimensões
- relacionamentos

Nunca armazenar binários diretamente no PostgreSQL.

---

# 4. Worker local

O processamento pesado não deve ocorrer na Vercel.

Existe um computador local que ficará ligado quase 24 horas por dia.

Criar um serviço chamado:

```text
DOMUS Worker
```

Esse serviço rodará localmente e será responsável por:

- Claude CLI
- HyperFrames
- GSAP
- FFmpeg
- TTS local
- processamento de vídeos
- processamento de áudio
- jobs longos
- sincronização pesada com APIs
- execução de tarefas solicitadas pelo frontend

Tecnologias sugeridas:

```text
Node.js
TypeScript
Fastify ou NestJS
```

O worker deverá iniciar automaticamente junto com o Windows.

Pode utilizar:

```text
PM2
```

ou serviço equivalente.

---

# 5. Comunicação com o worker

O worker não deve ter nenhuma porta pública diretamente exposta.

Utilizar:

```text
Cloudflare Tunnel
```

Fluxo:

```text
Next.js / Vercel
       ↓
Cloudflare Tunnel
       ↓
DOMUS Worker
       ↓
Claude CLI / HyperFrames / FFmpeg
```

Toda comunicação deve exigir autenticação.

Criar um segredo como:

```env
WORKER_SECRET=
```

Toda requisição deverá utilizar algo como:

```http
Authorization: Bearer WORKER_SECRET
```

Também implementar validação de origem e rate limiting.

---

# 6. Claude CLI

O Claude CLI rodará exclusivamente no computador local.

Não tentar instalar ou executar Claude CLI dentro da Vercel.

O Claude será utilizado principalmente para:

## Ads

- analisar campanhas
- analisar métricas
- sugerir otimizações
- gerar estrutura de campanha
- gerar copies
- gerar headlines
- gerar descrições
- sugerir públicos
- sugerir keywords
- sugerir orçamento
- gerar planos de teste A/B
- detectar campanhas ruins
- detectar criativos com fadiga

## Video Studio

- gerar roteiro
- gerar storyboard
- definir cenas
- criar texto da narração
- definir animações
- definir efeitos
- gerar código HTML/CSS/JS
- gerar código GSAP
- gerar código HyperFrames
- ajustar vídeos existentes

O Claude nunca deverá executar alterações críticas sem aprovação do usuário.

Exemplo:

```text
Claude sugere:
Aumentar orçamento de R$100 para R$130/dia.

[Cancelar]
[Aprovar]
```

Somente após aprovação chamar a API correspondente.

---

# 7. Meta Ads

Criar integração com:

```text
Meta Marketing API
```

Permitir:

- conectar conta de anúncios
- listar campanhas
- criar campanhas
- editar campanhas
- pausar campanhas
- ativar campanhas
- duplicar campanhas
- consultar métricas
- criar conjuntos
- editar conjuntos
- criar anúncios
- associar criativos
- alterar orçamento
- consultar públicos
- consultar anúncios
- consultar performance
- sincronizar dados

Estrutura:

```text
Campaign
   ↓
Ad Set
   ↓
Ad
```

---

# 8. Google Ads

Criar integração com:

```text
Google Ads API
```

Permitir inicialmente:

- conectar conta
- listar campanhas
- criar campanhas
- editar campanhas
- pausar campanhas
- ativar campanhas
- alterar orçamento
- Search Campaigns
- keywords
- responsive search ads
- grupos de anúncios
- assets
- métricas
- conversões

Performance Max pode entrar posteriormente.

---

# 9. Provider abstraction

Não acoplar a aplicação diretamente às APIs.

Criar uma interface genérica:

```ts
interface AdsProvider {
  getCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign>;

  createCampaign(input: CreateCampaignInput): Promise<Campaign>;
  updateCampaign(id: string, input: UpdateCampaignInput): Promise<void>;

  pauseCampaign(id: string): Promise<void>;
  activateCampaign(id: string): Promise<void>;

  updateBudget(id: string, budget: number): Promise<void>;

  getAds(): Promise<Ad[]>;
  getInsights(input: InsightsInput): Promise<Metrics>;
}
```

Implementações:

```text
MetaAdsProvider
GoogleAdsProvider
```

A interface interna do sistema deve trabalhar com modelos normalizados.

Informações específicas de cada provider podem ser armazenadas em:

```text
provider_data JSONB
```

---

# 10. Workspaces

O sistema deve ser multitenant.

Criar conceito de:

```text
Workspace
```

Exemplos:

```text
SIAPLUS
DOMUS
Cliente A
Cliente B
```

Cada workspace pode possuir:

- uma ou mais contas Meta
- uma ou mais contas Google Ads
- criativos
- campanhas
- membros
- configurações
- métricas
- automações

---

# 11. Banco de dados

Criar inicialmente:

```text
ads.workspaces

ads.workspace_members

ads.ad_connections

ads.ad_accounts

ads.campaigns

ads.ad_groups

ads.ads

ads.creatives

ads.creative_assets

ads.audiences

ads.metrics_daily

ads.jobs

ads.job_logs

ads.ai_conversations

ads.ai_actions

ads.automation_rules

ads.audit_logs
```

---

# 12. Estrutura básica de campanhas

Exemplo:

```ts
Campaign {
  id
  workspaceId

  provider
  externalId

  name
  objective
  status

  dailyBudget
  lifetimeBudget

  startedAt
  endedAt

  providerData

  createdAt
  updatedAt
  lastSyncedAt
}
```

Providers:

```text
META
GOOGLE
```

Status:

```text
DRAFT
ACTIVE
PAUSED
ARCHIVED
ERROR
```

---

# 13. Criativos

Estrutura aproximada:

```ts
Creative {
  id
  workspaceId

  name

  type

  r2Key
  publicUrl

  thumbnailUrl

  width
  height
  duration

  status

  metadata

  createdAt
}
```

Tipos:

```text
IMAGE
VIDEO
AUDIO
VOICE
MUSIC
SFX
```

---

# 14. Jobs

Toda tarefa pesada deve utilizar uma fila.

Exemplos:

```text
SYNC_META
SYNC_GOOGLE
GENERATE_VIDEO
RENDER_VIDEO
GENERATE_VOICE
UPLOAD_R2
ANALYZE_CAMPAIGN
CREATE_CAMPAIGN
```

Status:

```text
PENDING
RUNNING
COMPLETED
FAILED
CANCELLED
```

Cada job deve possuir:

```text
id
workspace_id
type
payload
status
progress
result
error
created_at
started_at
finished_at
```

---

# 15. Video Studio

Criar um módulo chamado:

```text
Video Studio
```

O usuário poderá informar:

- produto
- objetivo
- descrição
- duração
- formato
- estilo
- público
- CTA
- voz
- música
- efeitos

Formatos:

```text
9:16
1:1
16:9
4:5
```

Durações comuns:

```text
10s
15s
20s
30s
45s
60s
```

---

# 16. Fluxo de geração de vídeo

Fluxo:

```text
Prompt
 ↓
Claude CLI
 ↓
Roteiro
 ↓
Storyboard estruturado
 ↓
Código HTML/CSS/JS
 ↓
GSAP
 ↓
HyperFrames
 ↓
TTS
 ↓
SFX
 ↓
Música
 ↓
FFmpeg
 ↓
MP4
 ↓
Cloudflare R2
 ↓
Creative registrado no Supabase
```

---

# 17. HyperFrames

Utilizar HyperFrames como motor principal de motion.

O Claude deverá ser instruído a gerar:

```text
HTML
CSS
JavaScript
GSAP
```

Evitar dependências desnecessárias.

Permitir uso futuro de:

```text
Three.js
Lottie
SVG
Canvas
WebGL
```

---

# 18. Timeline do vídeo

Antes de gerar código, o Claude deverá gerar um storyboard estruturado.

Exemplo:

```json
{
  "duration": 15,
  "fps": 30,
  "scenes": [
    {
      "start": 0,
      "end": 3,
      "headline": "Cansado de preencher o SIAP?",
      "animation": "fade-up"
    },
    {
      "start": 3,
      "end": 8,
      "headline": "Faça em minutos com o SIAPLUS",
      "animation": "scale"
    },
    {
      "start": 8,
      "end": 13,
      "headline": "Planejamento e frequência automatizados",
      "animation": "slide"
    },
    {
      "start": 13,
      "end": 15,
      "headline": "Conheça o SIAPLUS",
      "animation": "cta"
    }
  ]
}
```

Depois gerar o código.

Isso permitirá editar o vídeo posteriormente.

---

# 19. Voz

Implementar inicialmente TTS local.

A arquitetura deve permitir trocar o provider futuramente.

Interface:

```ts
interface TTSProvider {
  generateVoice(input: {
    text: string;
    voice: string;
  }): Promise<AudioResult>;
}
```

Inicial:

```text
LocalTTSProvider
```

Futuramente:

```text
ElevenLabsProvider
OpenAITTSProvider
```

---

# 20. Efeitos sonoros

Criar biblioteca local/R2 de efeitos.

Categorias:

```text
whoosh
impact
click
pop
notification
typing
success
transition
bass
interface
```

O Claude deverá retornar algo como:

```json
{
  "time": 2.3,
  "effect": "whoosh",
  "volume": 0.7
}
```

O sistema selecionará um arquivo disponível da categoria.

---

# 21. Música

Criar biblioteca de músicas autorizadas/licenciadas.

Cada música deverá possuir tags:

```text
corporate
technology
dark
energetic
emotional
minimal
premium
```

O Claude poderá escolher a categoria.

Nunca utilizar automaticamente músicas protegidas sem licença.

---

# 22. FFmpeg

Usar FFmpeg para composição final.

Responsabilidades:

- combinar vídeo
- combinar narração
- adicionar música
- adicionar SFX
- normalizar áudio
- gerar thumbnail
- compressão
- converter formatos

Saída principal:

```text
H.264
MP4
AAC
```

---

# 23. Tela principal

Dashboard deve mostrar:

```text
Investimento
Impressões
Cliques
CTR
CPC
CPM
Leads
Conversões
CPA
Receita
ROAS
```

Permitir filtros:

```text
Workspace
Provider
Conta
Campanha
Período
```

---

# 24. Ads Manager

Criar tela com campanhas de todos os providers.

Exemplo:

```text
Campanha
Provider
Status
Budget
Gasto
CTR
CPA
Conversões
ROAS
```

Permitir:

```text
Editar
Pausar
Ativar
Duplicar
Analisar com Claude
```

---

# 25. Criação de campanha

Criar wizard.

Etapas:

```text
1. Workspace
2. Objetivo
3. Plataforma
4. Público
5. Orçamento
6. Criativos
7. Copy
8. Conversão
9. Revisão
10. Publicação
```

O Claude pode preencher automaticamente a maior parte.

---

# 26. AI Campaign Builder

Permitir prompt como:

```text
Crie uma campanha para vender o SIAPLUS para professores de Goiás.

Meta:
R$100/dia

Google:
R$70/dia
```

O Claude deverá gerar uma proposta estruturada.

Nunca publicar diretamente.

Mostrar:

```text
Campanha Meta
Campanha Google
Públicos
Keywords
Copies
Criativos
Budget
```

E botões:

```text
Editar
Aprovar
Publicar
```

---

# 27. AI Analyst

Criar uma interface de chat.

Exemplos:

```text
Como está o SIAPLUS hoje?

Quais campanhas estão desperdiçando dinheiro?

Qual criativo tem melhor CPA?

Qual anúncio devo pausar?

Aumente 20% das campanhas com ROAS acima de 4.
```

Quando houver alteração real, gerar:

```text
AI Action
```

A action deve ficar:

```text
PENDING_APPROVAL
```

até confirmação.

---

# 28. Audit log

Toda alteração deve ser registrada.

Exemplo:

```text
07/10/2026 14:21

Usuário:
Felipe

Ação:
Alteração de orçamento

Campanha:
SIAPLUS | Professores GO

Anterior:
R$100

Novo:
R$130

Origem:
AI_RECOMMENDATION
```

---

# 29. Segurança do Claude CLI

O frontend nunca poderá enviar comandos de shell diretamente.

Errado:

```json
{
  "command": "qualquer comando"
}
```

Correto:

```json
{
  "task": "GENERATE_AD_CAMPAIGN",
  "payload": {}
}
```

O worker decide internamente qual comando executar.

Implementar allowlist de operações.

Nunca permitir execução arbitrária via interface web.

---

# 30. Segurança de arquivos

Cada job deverá possuir diretório próprio.

Exemplo:

```text
/workspace/jobs/{jobId}/
```

O Claude deve trabalhar apenas dentro desse diretório quando estiver gerando vídeo.

Bloquear acesso desnecessário ao restante do computador.

---

# 31. R2

Criar estrutura:

```text
ads/
  workspaces/
    {workspaceId}/
      images/
      videos/
      audio/
      voices/
      music/
      sfx/
      thumbnails/
      renders/
```

---

# 32. MVP

Não tentar implementar tudo inicialmente.

## MVP 1

Implementar:

```text
Auth

Workspaces

Meta connection

Google connection

Listagem de campanhas

Dashboard básico

Pause / Resume

Alteração de orçamento

Sync

Audit log
```

---

## MVP 2

Adicionar:

```text
Claude CLI

AI Analyst

AI Campaign Builder

Criação de campanha

Sistema de aprovação
```

---

## MVP 3

Adicionar:

```text
Video Studio

HyperFrames

GSAP

TTS

SFX

FFmpeg

Upload R2

Preview
```

---

## MVP 4

Integrar tudo:

```text
Gerar vídeo
 ↓
Salvar como creative
 ↓
Criar campanha
 ↓
Associar creative
 ↓
Publicar
 ↓
Monitorar performance
```

---

# 33. Interface

Visual:

```text
premium
dark
minimal
dashboard profissional
```

Evitar aparência genérica de SaaS.

Referência conceitual:

```text
Linear
Vercel
Stripe
Meta Business Suite
Raycast
```

Layout principal:

```text
Sidebar
Topbar
Workspace selector
Command palette
Global search
Notifications
```

Sidebar:

```text
Overview

Campaigns

Creatives

Video Studio

Audiences

Analytics

AI

Automations

Jobs

Connections

Settings
```

---

# 34. Realtime

Utilizar Supabase Realtime para atualizar:

```text
job progress
render progress
campaign sync
AI actions
notifications
```

Exemplo:

```text
Renderizando

████████████░░░░
67%
```

---

# 35. Princípios técnicos

Sempre seguir:

1. TypeScript strict.
2. Código modular.
3. Separação provider/domain.
4. Não acoplar Meta ou Google diretamente à UI.
5. Nunca executar Claude CLI diretamente pelo navegador.
6. Nunca permitir shell arbitrário.
7. Toda alteração de campanha deve gerar audit log.
8. Toda ação gerada por IA deve exigir aprovação quando puder alterar gastos.
9. Todos os jobs devem ser recuperáveis após falha.
10. Toda integração externa deve possuir tratamento de rate limit.
11. Tokens e credenciais nunca devem ir para o frontend.
12. Criativos devem ficar no R2.
13. PostgreSQL deve guardar apenas dados e metadata.

---

# 36. Estrutura sugerida do repositório

Preferencialmente monorepo:

```text
/apps

  /web
    Next.js

  /worker
    Node.js
    Claude CLI
    HyperFrames
    FFmpeg

/packages

  /database

  /ads-core

  /providers

    /meta

    /google

  /ai

  /video

  /shared

  /ui
```

---

# 37. Resultado esperado

Ao final o usuário deve conseguir fazer algo como:

```text
"Crie três vídeos para vender o SIAPLUS para professores de Goiás.

Use R$20/dia para cada criativo no Meta.

Crie uma campanha de teste A/B."
```

Fluxo:

```text
Claude
 ↓
3 roteiros
 ↓
3 vídeos
 ↓
voz + música + SFX
 ↓
HyperFrames
 ↓
FFmpeg
 ↓
R2
 ↓
Campanha Meta
 ↓
A/B test
 ↓
métricas
 ↓
Claude analisa resultado
```

Após alguns dias:

```text
O criativo B possui CPA 46% menor que A.

Sugestão:

Pausar A
Manter C
Aumentar B de R$20 para R$30/dia.

Impacto máximo:
+R$300/mês

[Aprovar]
[Cancelar]
```

Esse deve ser o objetivo principal do sistema.

# 38. Instrução inicial de implementação

Antes de programar:

1. Analisar o projeto existente.
2. Não alterar funcionalidades existentes sem necessidade.
3. Identificar como Supabase, Auth e Cloudflare R2 já estão configurados.
4. Reutilizar integrações existentes.
5. Criar migrations sem destruir dados.
6. Apresentar a arquitetura proposta.
7. Criar plano de implementação.
8. Implementar inicialmente somente o MVP 1.
9. Não implementar etapas futuras de forma improvisada.
10. Manter a arquitetura preparada para os módulos seguintes.