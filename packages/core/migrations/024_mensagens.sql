-- Mensagens (WhatsApp do DOMUS) viram caixa de conversa: o histórico guarda o que sai, o que chega e as notas internas,
-- com mídia; contatos têm nome obrigatório; modelos de mensagem reutilizáveis. Tudo da plataforma (só o admin vê).
alter table ads.whatsapp_envios
  add column if not exists direcao text not null default 'OUT', -- OUT (enviada) | IN (recebida) | NOTA (interna, nunca enviada)
  add column if not exists tipo text not null default 'texto', -- texto | imagem | video | audio | documento
  add column if not exists midia_storage text,
  add column if not exists midia_key text,
  add column if not exists midia_mime text,
  add column if not exists midia_nome text,
  add column if not exists wa_id text, -- id da mensagem no WhatsApp (evita duplicar o eco do que nós mesmos mandamos)
  add column if not exists autor text; -- quem mandou/escreveu pela plataforma
-- status: PENDENTE (na fila do worker) | ENVIADO | FALHOU | RECEBIDO | NOTA
create unique index if not exists whatsapp_envios_wa_id_idx on ads.whatsapp_envios (wa_id) where wa_id is not null;
create index if not exists whatsapp_envios_para_idx on ads.whatsapp_envios (para, created_at desc);

create table if not exists ads.whatsapp_contatos (
  numero text primary key, -- só dígitos, com DDI (5531999999999)
  nome text not null check (length(btrim(nome)) >= 2),
  salvo boolean not null default false, -- false = nome que veio do WhatsApp (quem mandou mensagem e não foi salvo)
  lido_em timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table ads.whatsapp_contatos enable row level security;

create table if not exists ads.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) >= 2),
  texto text not null check (length(btrim(texto)) >= 1),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table ads.whatsapp_templates enable row level security;
