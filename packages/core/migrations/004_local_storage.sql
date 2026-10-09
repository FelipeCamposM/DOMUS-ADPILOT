-- Onde está o binário de cada criativo: 'local' (disco do PC do worker, MEDIA_DIR) ou 'r2' (Cloudflare R2).
-- r2_key passa a ser a chave do arquivo nos dois casos (mesma estrutura ads/workspaces/{id}/...).
alter table ads.creatives add column if not exists storage text not null default 'r2';
