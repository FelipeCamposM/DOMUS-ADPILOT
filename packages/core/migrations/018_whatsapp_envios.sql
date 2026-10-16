-- Histórico dos avisos mandados pelo WhatsApp (Configurações → WhatsApp)
create table if not exists ads.whatsapp_envios (
  id uuid primary key default gen_random_uuid(),
  para text not null,
  texto text not null,
  status text not null, -- ENVIADO | FALHOU
  erro text,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_envios_data_idx on ads.whatsapp_envios (created_at desc);
alter table ads.whatsapp_envios enable row level security;
