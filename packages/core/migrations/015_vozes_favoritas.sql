-- Vozes do ElevenLabs favoritas de cada membro (ids do ElevenLabs): aparecem primeiro no Studio
alter table ads.workspace_members add column if not exists vozes_favoritas text[] not null default '{}';
