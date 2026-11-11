-- Prospecção de leads (vinda do CAMPS-UTILS): busca no Google Maps pelo worker (IP de casa), auditoria dos sites,
-- score, análise com IA e pipeline próprio. É ferramenta da plataforma (como o CRM): só o admin da plataforma vê.
-- Prospect frio NÃO é contato do WhatsApp (sem consentimento): só vira contato quando o admin clica em "Transformar em lead".

create table if not exists ads.prosp_etapas (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  nome text not null check (length(btrim(nome)) between 1 and 30),
  cor text not null check (cor ~ '^#[0-9a-f]{6}$'),
  posicao int not null default 0,
  terminal boolean not null default false
);
alter table ads.prosp_etapas enable row level security;
insert into ads.prosp_etapas (id, nome, cor, posicao, terminal) values
  ('new', 'Novo', '#64748b', 0, false),
  ('qualified', 'Qualificado', '#38bdf8', 1, false),
  ('contacted', 'Contatado', '#a78bfa', 2, false),
  ('replied', 'Respondeu', '#f59e0b', 3, false),
  ('meeting', 'Reunião', '#14b8a6', 4, false),
  ('proposal', 'Proposta', '#f97316', 5, false),
  ('won', 'Ganho', '#22c55e', 6, true),
  ('lost', 'Perdido', '#ef4444', 7, true)
on conflict (id) do nothing;

-- uma linha só: a oferta (usada pela IA) e os pesos do score (0 a 50)
create table if not exists ads.prosp_config (
  id int primary key default 1 check (id = 1),
  oferta text not null default 'Criação de sites profissionais, SEO local no Google e gestão de anúncios para pequenas empresas.' check (length(oferta) <= 2000),
  peso_sem_site int not null default 30 check (peso_sem_site between 0 and 50),
  peso_site_quebrado int not null default 28 check (peso_site_quebrado between 0 and 50),
  peso_site_fraco int not null default 18 check (peso_site_fraco between 0 and 50),
  peso_so_redes int not null default 24 check (peso_so_redes between 0 and 50),
  peso_redes int not null default 12 check (peso_redes between 0 and 50),
  peso_contato int not null default 10 check (peso_contato between 0 and 50),
  peso_avaliacoes int not null default 6 check (peso_avaliacoes between 0 and 50),
  peso_distancia int not null default 4 check (peso_distancia between 0 and 50),
  peso_anuncios int not null default 8 check (peso_anuncios between 0 and 50),
  updated_at timestamptz not null default now()
);
alter table ads.prosp_config enable row level security;
insert into ads.prosp_config (id) values (1) on conflict (id) do nothing;

create table if not exists ads.prosp_campanhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 1 and 160),
  nichos text[] not null check (cardinality(nichos) between 1 and 20),
  local text not null default '',
  lat double precision,
  lng double precision,
  raio_km numeric(5, 1) not null check (raio_km > 0 and raio_km <= 50),
  max_leads int not null check (max_leads between 1 and 500),
  ritmo text not null default 'balanced' check (ritmo in ('slow', 'balanced', 'fast')),
  auditar boolean not null default true,
  foco text not null default 'no_site_first' check (foco in ('no_site_first', 'balanced', 'all')),
  status text not null default 'running', -- running | completed | failed | cancelled
  -- andamento gravado pelo worker durante a busca (o aviso da tela lê daqui)
  progresso int not null default 0,
  etapa_texto text not null default '',
  encontrados int not null default 0,
  a_auditar int not null default 0,
  auditados int not null default 0,
  bloqueado boolean not null default false,
  erro text,
  job_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prosp_campanhas_recentes on ads.prosp_campanhas (created_at desc);
alter table ads.prosp_campanhas enable row level security;

create table if not exists ads.prosp_leads (
  id text primary key, -- hash estável do Python (campanha + nome + endereço + telefone)
  campanha_id uuid not null references ads.prosp_campanhas(id) on delete cascade,
  nome text not null,
  categoria text not null default '',
  endereco text not null default '',
  pais text not null default 'BR',
  lat double precision,
  lng double precision,
  distancia_km numeric(6, 2),
  telefone text not null default '',
  email text not null default '',
  whatsapp text not null default '',
  site text not null default '',
  situacao text not null default 'unknown' check (situacao in ('unknown', 'no_site', 'social_only', 'broken', 'weak', 'healthy')),
  instagram_handle text not null default '',
  instagram_url text not null default '',
  place_id text,
  nota numeric(2, 1),
  avaliacoes int,
  score int not null default 0,
  motivos text[] not null default '{}',
  fontes text[] not null default '{}',
  -- sinais de quem já investe em marketing (lidos no HTML do site)
  pixel_meta boolean not null default false,
  google_ads boolean not null default false,
  analytics boolean not null default false,
  pixel_tiktok boolean not null default false,
  cms text,
  -- análise da IA
  ia_resumo text,
  ia_dores text[],
  ia_oferta text,
  ia_whatsapp text,
  ia_email_assunto text,
  ia_email_corpo text,
  ia_em timestamptz,
  -- trabalho comercial
  etapa text not null default 'new' references ads.prosp_etapas(id) on update cascade,
  notas text not null default '',
  tags text[] not null default '{}',
  proxima_acao timestamptz,
  contato_numero text, -- virou contato do CRM (Mensagens) por "Transformar em lead"
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prosp_leads_campanha on ads.prosp_leads (campanha_id, score desc);
create index if not exists prosp_leads_etapa on ads.prosp_leads (etapa) where deleted_at is null;
alter table ads.prosp_leads enable row level security;

create table if not exists ads.prosp_redes (
  lead_id text not null references ads.prosp_leads(id) on delete cascade,
  rede text not null check (rede in ('instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'x')),
  url text not null,
  primary key (lead_id, rede)
);
alter table ads.prosp_redes enable row level security;

create table if not exists ads.prosp_diagnosticos (
  lead_id text not null references ads.prosp_leads(id) on delete cascade,
  ordem int not null,
  codigo text not null,
  rotulo text not null,
  gravidade text not null check (gravidade in ('info', 'opportunity', 'critical')),
  valor text,
  primary key (lead_id, ordem)
);
alter table ads.prosp_diagnosticos enable row level security;
