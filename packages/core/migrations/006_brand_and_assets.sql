-- Identidade visual por workspace (cores, fontes, logo, tom, regras, referências), aplicada em tudo que a IA cria.
alter table ads.workspaces add column if not exists brand jsonb not null default '{}';

-- Anexos de cada projeto do Studio: arquivos da biblioteca (para incluir na arte ou como inspiração) e links.
-- Arquivos enviados viram criativos IMAGE/VIDEO com a tag 'asset'.
alter table ads.video_projects add column if not exists assets jsonb not null default '[]'; -- [{creativeId, uso, nota}]
alter table ads.video_projects add column if not exists links jsonb not null default '[]';  -- [{url, nota}]
