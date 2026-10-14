-- Consumo de IA por projeto do Studio (vídeo/imagem): tokens e custo de cada chamada ligados ao projeto
alter table ads.ai_usage add column if not exists video_project_id uuid references ads.video_projects(id) on delete set null;
create index if not exists ai_usage_projeto_idx on ads.ai_usage (video_project_id) where video_project_id is not null;
