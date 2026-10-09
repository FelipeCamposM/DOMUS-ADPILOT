-- Configurações globais da plataforma com valor cifrado (AES-256-GCM, TOKEN_ENCRYPTION_KEY). Ex.: chave do ElevenLabs.
create table if not exists ads.settings (
  key text primary key,
  value_enc text not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table ads.settings enable row level security;
