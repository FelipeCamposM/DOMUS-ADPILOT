-- Calendário de conteúdo: a IA sugere os posts do período (tema, roteiro, legenda, hashtags), o usuário ajusta e aprova;
-- perto da hora o worker gera a arte, agenda a publicação e o Instagram recebe sozinho.
create table if not exists ads.calendarios (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  ig_account_id uuid not null references ads.instagram_accounts(id) on delete cascade,
  brand_id uuid references ads.brands(id) on delete set null,
  inicio date not null,
  fim date not null,
  objetivo text not null default '',
  mix jsonb not null default '{}', -- quantos por semana: { FEED, CARROSSEL, REELS }
  status text not null default 'GERANDO', -- GERANDO | PRONTO | ERRO
  erro text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendarios_ws_idx on ads.calendarios (workspace_id, ig_account_id, inicio desc);
alter table ads.calendarios enable row level security;

create table if not exists ads.calendario_itens (
  id uuid primary key default gen_random_uuid(),
  calendario_id uuid not null references ads.calendarios(id) on delete cascade,
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  data_hora timestamptz not null,
  formato text not null, -- FEED | CARROSSEL | REELS
  tema text not null default '',
  objetivo text not null default '',
  roteiro jsonb not null default '{}', -- roteiroSchema: headline/apoio/cta/visual, slides, narração e duração
  legenda text not null default '',
  hashtags text[] not null default '{}',
  status text not null default 'SUGERIDO', -- SUGERIDO | APROVADO | GERANDO | AGENDADO | PUBLICADO | FALHOU
  refazendo text, -- campo que a IA está refazendo agora ("item" = o post inteiro)
  project_id uuid references ads.video_projects(id) on delete set null,
  post_id uuid references ads.instagram_posts(id) on delete set null,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendario_itens_cal_idx on ads.calendario_itens (calendario_id, data_hora);
create index if not exists calendario_itens_fila_idx on ads.calendario_itens (status, data_hora) where status in ('APROVADO', 'GERANDO', 'AGENDADO');
alter table ads.calendario_itens enable row level security;
