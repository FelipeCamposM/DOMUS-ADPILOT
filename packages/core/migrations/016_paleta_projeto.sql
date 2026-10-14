-- Paleta que o vídeo vai usar, resolvida junto com o roteiro e aprovada (ou corrigida) pelo usuário antes do render
alter table ads.video_projects add column if not exists paleta jsonb;
