-- Conversa removida da caixa de Mensagens (gente que não é lead). Volta sozinha se a pessoa mandar mensagem depois.
create table if not exists ads.whatsapp_ocultas (
  numero text primary key,
  oculta_em timestamptz not null default now(),
  created_by uuid
);
alter table ads.whatsapp_ocultas enable row level security;
