-- Créditos gastos no ElevenLabs por geração de narração (header character-cost da API), para histórico em Configurações → Vozes
create table if not exists ads.tts_usage (
  id bigserial primary key,
  workspace_id uuid references ads.workspaces(id) on delete set null,
  video_project_id uuid references ads.video_projects(id) on delete set null,
  provider text not null default 'elevenlabs',
  voice_id text not null,
  voice_name text,
  characters int not null default 0,
  credits int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists tts_usage_ws_created_idx on ads.tts_usage(workspace_id, created_at desc);
alter table ads.tts_usage enable row level security;
