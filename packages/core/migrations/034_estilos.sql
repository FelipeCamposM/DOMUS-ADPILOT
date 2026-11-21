-- Biblioteca de estilos do Studio. Estilos prontos ficam no código (@domus-ads/core/estilos); aqui só a prévia
-- renderizada deles (linha com chave, sem workspace) e os estilos do workspace, com as referências (criativos, que o
-- worker copia para o Google Drive). A prévia mora no R2 (previa_key) e tem cópia no Drive.
create table if not exists ads.estilos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references ads.workspaces(id) on delete cascade, -- null = prévia de um estilo pronto
  chave text unique, -- estilo pronto
  nome text not null check (length(btrim(nome)) between 1 and 60),
  familia text not null, -- 2d | 3d | video | post | stories | banner | arte
  resumo text not null default '',
  prompt text not null default '' check (length(prompt) <= 4000),
  tags text[] not null default '{}',
  referencias uuid[] not null default '{}',
  previa_key text,
  previa_status text, -- GERANDO | PRONTA | FALHOU
  previa_erro text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists estilos_ws_idx on ads.estilos (workspace_id, created_at desc);
alter table ads.estilos enable row level security;
