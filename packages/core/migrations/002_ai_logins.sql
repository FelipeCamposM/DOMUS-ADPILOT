-- Login de contas de IA pela plataforma: o worker roda o login do CLI e a web mostra link/código ao usuário.
alter table ads.ai_accounts add column if not exists email text;
alter table ads.ai_accounts add column if not exists plan text;

create table if not exists ads.ai_logins (
  id uuid primary key default gen_random_uuid(),
  provider text not null, -- claude | codex
  name text not null,
  ai_account_id uuid references ads.ai_accounts(id) on delete cascade, -- refazer login de uma conta existente
  status text not null default 'STARTING', -- STARTING | AWAITING_USER | CODE_SUBMITTED | DONE | FAILED | CANCELLED
  url text,
  user_code text, -- Codex: código para digitar no site da OpenAI
  code text,      -- Claude: código colado pelo usuário; o worker apaga assim que usa
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table ads.ai_logins enable row level security;
