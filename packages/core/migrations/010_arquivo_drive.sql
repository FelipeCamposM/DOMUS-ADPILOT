-- Arquivo no Google Drive: o arquivo principal sai do R2 e fica só na pasta do Drive do PC (DRIVE_DIR).
-- A miniatura (thumbnail_key) continua no R2. usado_em decide o que arquivar primeiro (o menos usado).
alter table ads.creatives add column if not exists arquivado boolean not null default false;
alter table ads.creatives add column if not exists usado_em timestamptz;
create index if not exists creatives_arquivar_idx on ads.creatives (storage, arquivado, coalesce(usado_em, created_at)) where status = 'READY';
