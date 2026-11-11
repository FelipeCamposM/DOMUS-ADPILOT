-- Financeiro pessoal e da empresa (Open Finance pela Pluggy). Ferramenta da plataforma: só o admin da plataforma vê.
-- O worker lê as contas da Pluggy (credenciais só no .env do worker) e grava tudo aqui; a web só lê e classifica.
-- Cada conta é PF ou PJ; as telas Pessoa física e Pessoa jurídica filtram por isso.

-- uma linha por conexão (item) da Pluggy: o banco inteiro (conta + cartão)
create table if not exists ads.fin_conexoes (
  item_id uuid primary key,
  apelido text check (apelido is null or length(apelido) <= 60),
  banco text,
  banco_logo text,
  banco_cor text,
  pessoa text not null default 'PF' check (pessoa in ('PF', 'PJ')),
  status text,
  erro text,
  ultima_sync timestamptz,
  atualizado_no_banco timestamptz,
  created_at timestamptz not null default now()
);
alter table ads.fin_conexoes enable row level security;

create table if not exists ads.fin_categorias (
  id serial primary key,
  nome text not null unique check (length(btrim(nome)) between 1 and 40),
  tipo text not null check (tipo in ('gasto', 'renda')),
  cor text not null default '#a855ff' check (cor ~ '^#[0-9a-f]{6}$'),
  icone text not null default 'circle',
  orcamento numeric(14, 2) check (orcamento is null or orcamento >= 0),
  posicao int not null default 0
);
alter table ads.fin_categorias enable row level security;
insert into ads.fin_categorias (nome, tipo, cor, icone, posicao) values
  ('Mercado', 'gasto', '#22c55e', 'shopping-cart', 1),
  ('Restaurantes', 'gasto', '#f97316', 'utensils', 2),
  ('Delivery', 'gasto', '#fb923c', 'bike', 3),
  ('Transporte', 'gasto', '#38bdf8', 'car', 4),
  ('Combustível', 'gasto', '#0ea5e9', 'fuel', 5),
  ('Moradia', 'gasto', '#a78bfa', 'house', 6),
  ('Contas da casa', 'gasto', '#8b5cf6', 'zap', 7),
  ('Saúde', 'gasto', '#f43f5e', 'heart-pulse', 8),
  ('Academia e esporte', 'gasto', '#10b981', 'dumbbell', 9),
  ('Lazer', 'gasto', '#eab308', 'party-popper', 10),
  ('Streaming e apps', 'gasto', '#ec4899', 'tv', 11),
  ('Compras', 'gasto', '#d946ef', 'shopping-bag', 12),
  ('Roupas e beleza', 'gasto', '#f472b6', 'shirt', 13),
  ('Eletrônicos', 'gasto', '#6366f1', 'cpu', 14),
  ('Educação', 'gasto', '#14b8a6', 'graduation-cap', 15),
  ('Viagem', 'gasto', '#06b6d4', 'plane', 16),
  ('Impostos', 'gasto', '#ef4444', 'landmark', 17),
  ('Tarifas e juros', 'gasto', '#dc2626', 'percent', 18),
  ('Seguros', 'gasto', '#64748b', 'shield', 19),
  ('Pets', 'gasto', '#a3e635', 'paw-print', 20),
  ('Presentes e doações', 'gasto', '#fb7185', 'gift', 21),
  ('Ferramentas e software', 'gasto', '#7c3aed', 'wrench', 22),
  ('Outros gastos', 'gasto', '#94a3b8', 'circle', 99),
  ('Salário PJ', 'renda', '#22c55e', 'briefcase', 1),
  ('SIAPLUS', 'renda', '#a855ff', 'building-2', 2),
  ('Rendimentos', 'renda', '#14b8a6', 'trending-up', 3),
  ('Retirada da PJ', 'renda', '#c084fc', 'arrow-left-right', 3),
  ('Reembolsos', 'renda', '#38bdf8', 'undo-2', 4),
  ('Outras rendas', 'renda', '#94a3b8', 'circle', 99)
on conflict (nome) do nothing;

create table if not exists ads.fin_contas (
  id uuid primary key, -- id da conta na Pluggy
  item_id uuid not null references ads.fin_conexoes (item_id) on delete cascade,
  tipo text not null check (tipo in ('BANK', 'CREDIT')),
  subtipo text,
  nome text not null,
  apelido text check (apelido is null or length(apelido) <= 60),
  numero text,
  pessoa text not null default 'PF' check (pessoa in ('PF', 'PJ')),
  saldo numeric(14, 2),
  moeda text not null default 'BRL',
  limite numeric(14, 2),
  limite_usado numeric(14, 2),
  dia_fechamento int check (dia_fechamento between 1 and 31),
  dia_vencimento int check (dia_vencimento between 1 and 31),
  bandeira text,
  -- entradas nesta conta caem nesta categoria (ex.: Inter PJ = Salário PJ, Mercado Pago PJ = SIAPLUS)
  categoria_renda_id int references ads.fin_categorias (id) on delete set null,
  oculta boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table ads.fin_contas enable row level security;
create index if not exists fin_contas_item on ads.fin_contas (item_id);

create table if not exists ads.fin_etiquetas (
  id serial primary key,
  nome text not null unique check (length(btrim(nome)) between 1 and 30),
  cor text not null default '#e879f9' check (cor ~ '^#[0-9a-f]{6}$'),
  emoji text check (emoji is null or length(emoji) <= 8)
);
alter table ads.fin_etiquetas enable row level security;
insert into ads.fin_etiquetas (nome, cor, emoji) values ('Juju', '#f472b6', '💜') on conflict (nome) do nothing;

create table if not exists ads.fin_assinaturas (
  id serial primary key,
  padrao text not null unique,
  nome text not null,
  valor_medio numeric(14, 2) not null check (valor_medio > 0),
  valor_ultimo numeric(14, 2),
  dia_cobranca int check (dia_cobranca between 1 and 31),
  periodicidade text not null default 'mensal' check (periodicidade in ('mensal', 'anual')),
  categoria_id int references ads.fin_categorias (id) on delete set null,
  conta_id uuid references ads.fin_contas (id) on delete set null,
  pessoa text not null default 'PF' check (pessoa in ('PF', 'PJ')),
  status text not null default 'sugerida' check (status in ('sugerida', 'confirmada', 'ignorada')),
  ocorrencias int not null default 0,
  primeira date,
  ultima date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table ads.fin_assinaturas enable row level security;

create table if not exists ads.fin_transacoes (
  id uuid primary key, -- id da transação na Pluggy
  conta_id uuid not null references ads.fin_contas (id) on delete cascade,
  pessoa text not null check (pessoa in ('PF', 'PJ')),
  descricao text not null,
  descricao_raw text,
  padrao text not null default '', -- descrição sem números/acentos/símbolos: é o que as regras e as assinaturas comparam
  valor numeric(14, 2) not null check (valor >= 0), -- sempre positivo: quem manda é o tipo
  tipo text not null check (tipo in ('debito', 'credito')),
  data date not null,
  competencia date not null, -- mês ao qual pertence (no cartão: o mês da fatura)
  categoria_pluggy text,
  categoria_id int references ads.fin_categorias (id) on delete set null,
  categoria_manual boolean not null default false,
  merchant text,
  status text not null default 'confirmada' check (status in ('pendente', 'confirmada')),
  natureza text not null check (natureza in ('gasto', 'renda', 'estorno', 'transferencia', 'fatura', 'investimento', 'ignorado')),
  natureza_manual boolean not null default false,
  encargo boolean not null default false,
  compra_em date,
  parcela int,
  total_parcelas int,
  fatura_id uuid,
  assinatura_id int references ads.fin_assinaturas (id) on delete set null,
  nota text check (nota is null or length(nota) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table ads.fin_transacoes enable row level security;
create index if not exists fin_tx_pessoa_comp on ads.fin_transacoes (pessoa, competencia);
create index if not exists fin_tx_conta_data on ads.fin_transacoes (conta_id, data desc);
create index if not exists fin_tx_padrao on ads.fin_transacoes (padrao);
create index if not exists fin_tx_parcelas on ads.fin_transacoes (compra_em) where total_parcelas > 1;

create table if not exists ads.fin_transacao_etiquetas (
  transacao_id uuid not null references ads.fin_transacoes (id) on delete cascade,
  etiqueta_id int not null references ads.fin_etiquetas (id) on delete cascade,
  primary key (transacao_id, etiqueta_id)
);
alter table ads.fin_transacao_etiquetas enable row level security;
create index if not exists fin_tx_etq on ads.fin_transacao_etiquetas (etiqueta_id);

-- "aplicar a todas parecidas": vale para as transações que já existem e para as que chegarem nos próximos syncs
create table if not exists ads.fin_regras (
  id serial primary key,
  padrao text not null check (length(padrao) between 2 and 120), -- descrição normalizada (sem números, acentos, caixa)
  conta_id uuid references ads.fin_contas (id) on delete cascade,
  categoria_id int references ads.fin_categorias (id) on delete cascade,
  etiqueta_id int references ads.fin_etiquetas (id) on delete cascade,
  natureza text check (natureza is null or natureza in ('gasto', 'renda', 'estorno', 'transferencia', 'fatura', 'investimento', 'ignorado')),
  created_at timestamptz not null default now(),
  check (categoria_id is not null or etiqueta_id is not null or natureza is not null)
);
alter table ads.fin_regras enable row level security;

create table if not exists ads.fin_analises (
  id uuid primary key default gen_random_uuid(),
  pessoa text not null check (pessoa in ('PF', 'PJ')),
  mes date not null,
  pergunta text check (pergunta is null or length(pergunta) <= 1000),
  resposta text,
  status text not null default 'gerando' check (status in ('gerando', 'pronta', 'erro')),
  erro text,
  job_id uuid,
  created_at timestamptz not null default now()
);
alter table ads.fin_analises enable row level security;
create index if not exists fin_analises_recentes on ads.fin_analises (pessoa, created_at desc);
