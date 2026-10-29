-- CRM: colunas do funil configuráveis (nome, cor, ordem, tipo). whatsapp_contatos.etapa guarda a chave.
-- NOVO é a entrada (todo lead chega nela) e não pode ser apagada; GANHO/PERDIDO marcam o fim do funil.
create table if not exists ads.crm_etapas (
  chave text primary key check (chave ~ '^[A-Z0-9_]{2,40}$'),
  nome text not null check (length(btrim(nome)) between 1 and 30),
  cor text not null check (cor ~ '^#[0-9a-f]{6}$'),
  ordem int not null default 0,
  tipo text not null default 'ABERTO' check (tipo in ('ABERTO', 'GANHO', 'PERDIDO')),
  dica text check (length(dica) <= 80),
  created_at timestamptz not null default now()
);
alter table ads.crm_etapas enable row level security;

insert into ads.crm_etapas (chave, nome, cor, ordem, tipo, dica) values
  ('NOVO', 'Novo', '#c084fc', 0, 'ABERTO', 'Chegou e ninguém falou ainda'),
  ('CONTATO', 'Em contato', '#5b8cff', 1, 'ABERTO', 'Você já mandou mensagem'),
  ('NEGOCIANDO', 'Negociando', '#ffb020', 2, 'ABERTO', 'Proposta na mesa'),
  ('GANHO', 'Fechou', '#3ddc97', 3, 'GANHO', 'Virou cliente'),
  ('PERDIDO', 'Perdeu', '#9696a8', 4, 'PERDIDO', 'Não fechou')
on conflict (chave) do nothing;

alter table ads.whatsapp_contatos
  add column if not exists lead_valor numeric(12, 2) check (lead_valor >= 0), -- quanto vale o negócio (R$)
  add column if not exists etapa_em timestamptz; -- quando entrou na etapa atual (lead parado = alerta)
update ads.whatsapp_contatos set etapa_em = coalesce(lead_em, updated_at) where etapa is not null and etapa_em is null;

-- Filtros salvos do funil (visões). Um só favorito: abre já aplicado e aparece com estrela.
create table if not exists ads.crm_filtros (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 1 and 40),
  filtros jsonb not null,
  favorito boolean not null default false,
  padrao boolean not null default false, -- veio pronto (pode apagar)
  created_at timestamptz not null default now()
);
create unique index if not exists crm_filtros_um_favorito on ads.crm_filtros ((true)) where favorito;
alter table ads.crm_filtros enable row level security;

insert into ads.crm_filtros (nome, filtros, padrao)
select v.nome, v.filtros::jsonb, true from (values
  ('Sua vez de responder', '{"periodo":"tudo","situacao":"esperando"}'),
  ('Esfriando agora', '{"periodo":"tudo","situacao":"esfriando"}'),
  ('Leads de hoje', '{"periodo":"hoje"}'),
  ('Maiores negócios', '{"periodo":"tudo","valor":"com","ordem":"valor"}'),
  ('Parados há +7 dias', '{"periodo":"tudo","situacao":"parado","ordem":"parado"}'),
  ('Sem valor definido', '{"periodo":"90","valor":"sem"}')
) as v(nome, filtros)
where not exists (select 1 from ads.crm_filtros where padrao);
