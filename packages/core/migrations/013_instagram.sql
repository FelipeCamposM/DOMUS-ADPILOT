-- Instagram (conta Profissional ligada a uma Página do Facebook): perfis descobertos pela conexão INSTAGRAM
create table if not exists ads.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  connection_id uuid not null references ads.ad_connections(id) on delete cascade,
  ig_user_id text not null,
  page_id text,
  username text not null,
  nome text,
  foto text,
  bio text,
  site text,
  seguidores int,
  seguindo int,
  publicacoes int,
  atualizado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (connection_id, ig_user_id)
);
create index if not exists instagram_accounts_ws_idx on ads.instagram_accounts (workspace_id);
alter table ads.instagram_accounts enable row level security;

-- Publicações feitas pela plataforma: rascunho → agendado → publicando → publicado (ou falhou)
create table if not exists ads.instagram_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  ig_account_id uuid not null references ads.instagram_accounts(id) on delete cascade,
  tipo text not null default 'FEED', -- FEED | CARROSSEL | REELS | STORY
  legenda text not null default '',
  midias jsonb not null default '[]', -- [{ "creativeId": uuid }] na ordem
  opcoes jsonb not null default '{}', -- { compartilharNoFeed, capaMs }
  status text not null default 'RASCUNHO', -- RASCUNHO | AGENDADO | PUBLICANDO | PUBLICADO | FALHOU
  agendado_para timestamptz,
  publicado_em timestamptz,
  ig_media_id text,
  permalink text,
  erro text,
  sugestao jsonb, -- legenda da IA: { gerando, legenda, hashtags, erro }
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists instagram_posts_ws_idx on ads.instagram_posts (workspace_id, ig_account_id, updated_at desc);
create index if not exists instagram_posts_fila_idx on ads.instagram_posts (status, agendado_para) where status = 'AGENDADO';
alter table ads.instagram_posts enable row level security;
