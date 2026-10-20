-- Estilos de vídeo salvos: a linguagem visual de um vídeo do modo Livre vira estilo reutilizável (a IA repete o visual
-- com conteúdo novo, em qualquer formato).
create table if not exists ads.estilos_video (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  nome text not null,
  descricao text not null default '',
  referencia text not null,         -- composição (index.html) de origem: o exemplo que a IA imita
  projeto_origem uuid references ads.video_projects(id) on delete set null,
  capa_id uuid references ads.creatives(id) on delete set null, -- vídeo de origem (prévia no seletor)
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists estilos_video_ws_idx on ads.estilos_video (workspace_id, created_at desc);
alter table ads.estilos_video enable row level security;
