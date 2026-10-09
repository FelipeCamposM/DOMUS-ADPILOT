-- Studio passa a criar imagens além de vídeos. Um projeto de imagem gera várias variações (criativos IMAGE ligados
-- pelo metadata.projectId); a composição HTML de cada variação fica no metadata do próprio criativo.
alter table ads.video_projects add column if not exists kind text not null default 'video'; -- video | image
create index if not exists creatives_project_idx on ads.creatives ((metadata->>'projectId'));
