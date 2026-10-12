-- Quem autorizou a conexão (nome, e-mail e foto do Google), para mostrar no seletor de contas
alter table ads.ad_connections add column if not exists perfil jsonb not null default '{}';
