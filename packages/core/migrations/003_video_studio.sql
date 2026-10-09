-- Video Studio (MVP 3). Binários ficam no R2 (ads/workspaces/{workspaceId}/...); aqui só chave, metadata e relações.

-- Criativos: vídeos gerados e a biblioteca de áudio (músicas e efeitos licenciados enviados pelo usuário).
create table if not exists ads.creatives (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  name text not null,
  type text not null,              -- IMAGE | VIDEO | AUDIO | VOICE | MUSIC | SFX
  status text not null default 'READY', -- UPLOADING | PROCESSING | READY | FAILED
  r2_key text,                     -- nunca URL absoluta
  thumbnail_key text,
  mime text,
  size_bytes bigint,
  width int,
  height int,
  duration_ms int,
  tags text[] not null default '{}', -- MUSIC: corporate, technology… / SFX: whoosh, impact…
  license text,                      -- origem/licença declarada (músicas e efeitos)
  metadata jsonb not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists creatives_ws_idx on ads.creatives(workspace_id, type, created_at desc);

-- Projeto de vídeo: o briefing, o storyboard (editável) e a composição HTML que o Claude escreveu.
create table if not exists ads.video_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  title text not null,
  brief jsonb not null,            -- produto, objetivo, duração, formato, estilo, público, CTA, voz, música, efeitos
  storyboard jsonb,                -- cenas com tempos, narração, animação e SFX
  composition text,                -- index.html da HyperFrames (texto pequeno; o vídeo vai para o R2)
  status text not null default 'QUEUED', -- QUEUED | SCRIPTING | VOICE | COMPOSING | RENDERING | MIXING | UPLOADING | READY | FAILED
  step_detail text,
  creative_id uuid references ads.creatives(id) on delete set null,
  job_id uuid,
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists video_projects_ws_idx on ads.video_projects(workspace_id, created_at desc);

alter table ads.creatives enable row level security;
alter table ads.video_projects enable row level security;
