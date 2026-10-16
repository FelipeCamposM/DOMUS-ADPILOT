-- Pastas da biblioteca (Arquivos) e prévia leve que fica no R2 quando o original vai para o Drive
create table if not exists ads.pastas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, nome)
);
alter table ads.pastas enable row level security;

alter table ads.creatives add column if not exists pasta_id uuid references ads.pastas(id) on delete set null;
alter table ads.creatives add column if not exists preview_key text; -- versão leve (imagem 1080px / vídeo 480p) no R2
create index if not exists creatives_pasta_idx on ads.creatives (pasta_id) where pasta_id is not null;
