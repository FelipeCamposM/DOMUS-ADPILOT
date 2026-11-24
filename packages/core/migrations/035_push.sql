-- Notificações push do PWA: um registro por aparelho (navegador/iPhone) que ativou.
create table if not exists ads.push_inscricoes (
  endpoint text primary key,
  user_id uuid not null,
  p256dh text not null,
  auth text not null,
  aparelho text,
  confirmada_em timestamptz, -- worker manda "notificações ativadas" uma vez e marca aqui
  created_at timestamptz not null default now()
);
create index if not exists push_inscricoes_user_idx on ads.push_inscricoes (user_id);
alter table ads.push_inscricoes enable row level security;

-- Tipos que a pessoa desligou nas Configurações (lead, acao, falha, email). Vazio = tudo ligado.
create table if not exists ads.push_preferencias (
  user_id uuid primary key,
  desligados text[] not null default '{}'
);
alter table ads.push_preferencias enable row level security;

-- Cada evento vira push uma vez só (chave = tipo:id). Limpo depois de 30 dias.
create table if not exists ads.push_enviados (
  chave text primary key,
  enviado_em timestamptz not null default now()
);
alter table ads.push_enviados enable row level security;
