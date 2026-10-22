-- Sistemas conectados: outros apps do dono (ex.: admin do SIAPLUS) pedem respostas da IA ao worker pela API
-- /api/externo/v1, com uma chave por sistema. Só o hash da chave fica no banco.
create table if not exists ads.sistemas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  chave_hash text not null unique,      -- sha256 (hex) da chave
  chave_fim text not null,              -- 4 últimos caracteres, para reconhecer a chave na tela
  ativo boolean not null default true,
  limite_pct numeric(5,1) check (limite_pct > 0 and limite_pct <= 100), -- não usa conta com a janela de 5 h acima disto
  contas uuid[],                        -- contas de IA que podem atender; null = todas
  ultimo_uso timestamptz,
  created_at timestamptz not null default now()
);

-- Um pedido = uma resposta. Instruções e prompt são apagados quando a resposta termina; o pedido inteiro some em 7 dias
-- (o consumo fica em ai_usage).
create table if not exists ads.sistema_pedidos (
  id uuid primary key default gen_random_uuid(),
  sistema_id uuid not null references ads.sistemas(id) on delete cascade,
  job_id uuid references ads.jobs(id) on delete set null,
  status text not null default 'FILA', -- FILA | RODANDO | PRONTO | ERRO | CANCELADO
  instrucoes text,
  prompt text,
  texto text not null default '',
  erro text,
  conta text,
  provider text,
  modelo text,
  tokens_entrada bigint,
  tokens_saida bigint,
  duracao_ms int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sistema_pedidos_sistema_idx on ads.sistema_pedidos (sistema_id, created_at desc);

-- consumo por sistema; pct_5h = quanto a janela de 5 h da conta subiu nesta resposta (estimativa: a janela é da conta)
alter table ads.ai_usage add column if not exists sistema_id uuid references ads.sistemas(id) on delete set null;
alter table ads.ai_usage add column if not exists pct_5h numeric(5,1);
create index if not exists ai_usage_sistema_idx on ads.ai_usage (sistema_id, created_at) where sistema_id is not null;

alter table ads.sistemas enable row level security;
alter table ads.sistema_pedidos enable row level security;
