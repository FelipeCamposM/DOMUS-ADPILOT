-- Conversa removida da caixa de Mensagens (gente que não é lead). Volta sozinha se a pessoa mandar mensagem depois.
create table if not exists ads.whatsapp_ocultas (
  numero text primary key,
  oculta_em timestamptz not null default now(),
  created_by uuid
);
alter table ads.whatsapp_ocultas enable row level security;

-- Prospecção (DOMUS): buscas no Google Maps feitas pelo worker (Google Maps Scraper Kit, MIT) para achar empresas
-- que precisam de site. Da plataforma, só o admin vê. Nada aqui é lead do CRM até alguém mandar para lá.
create table if not exists ads.prospeccoes (
  id uuid primary key default gen_random_uuid(),
  nicho text not null check (length(btrim(nicho)) between 2 and 80),
  cidade text not null check (length(btrim(cidade)) between 2 and 120),
  bairros text[] not null default '{}', -- cada bairro vira uma busca a mais (passa do teto de ~120 do Google)
  profundidade int not null default 3 check (profundidade between 1 and 6), -- lotes de ~20 por busca
  status text not null default 'FILA', -- FILA | RODANDO | PRONTO | ERRO | CANCELADO
  progresso int not null default 0,
  encontrados int not null default 0,
  novos int not null default 0,
  erro text,
  job_id uuid references ads.jobs(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prospeccoes_data_idx on ads.prospeccoes (created_at desc);
alter table ads.prospeccoes enable row level security;

create table if not exists ads.prospectos (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique, -- place_id do Google (ou o link): a mesma empresa nunca entra duas vezes
  prospeccao_id uuid references ads.prospeccoes(id) on delete set null, -- busca que achou primeiro
  nome text not null,
  categoria text,
  endereco text,
  telefone text,
  whatsapp text, -- só dígitos com DDI quando o telefone é celular brasileiro
  site text,
  tipo_site text not null default 'NENHUM', -- NENHUM | REDE_SOCIAL (só Instagram/Facebook/Linktree…) | PROPRIO
  emails text[] not null default '{}',
  redes jsonb not null default '{}', -- { instagram, facebook, linkedin, tiktok, youtube, x }
  nota numeric(2,1),
  avaliacoes int,
  link text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  pontos int not null default 0, -- 0–100: quanto a empresa parece precisar de um site e ter como pagar
  status text not null default 'NOVO', -- NOVO | CONTATADO | DESCARTADO | LEAD
  nota_interna text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prospectos_busca_idx on ads.prospectos (prospeccao_id);
create index if not exists prospectos_pontos_idx on ads.prospectos (pontos desc, created_at desc);
alter table ads.prospectos enable row level security;
