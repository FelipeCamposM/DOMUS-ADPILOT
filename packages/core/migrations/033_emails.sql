-- E-mails (Gmail) dentro do AdPilot: contas Google conectadas por OAuth (escopo gmail.modify), só do admin da plataforma.
-- O refresh token fica cifrado (AES-256-GCM, como as conexões de anúncios). Os e-mails não são copiados para o banco:
-- a tela lê direto da API do Gmail. Com o app do Google em modo de teste o token expira em 7 dias: status EXPIRADA
-- aparece no sino e a pessoa reconecta.
create table if not exists ads.email_contas (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nome text,
  foto text,
  credentials_enc text not null,
  status text not null default 'ACTIVE', -- ACTIVE | EXPIRADA
  erro text,
  conectado_em timestamptz not null default now(),
  verificado_em timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table ads.email_contas enable row level security;
