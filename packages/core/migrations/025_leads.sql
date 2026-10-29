-- Mini-CRM: o formulário de cada site manda o lead para a caixa de Mensagens (POST /api/leads).
-- A chave do site vai no HTML do formulário: não é segredo, só diz de qual site veio. Os domínios travam quem pode mandar.
create table if not exists ads.lead_sites (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) >= 2),
  chave text not null unique,
  dominios text[] not null default '{}', -- vazio = qualquer domínio
  mensagem_inicial text not null default 'Olá! Vim pelo site {site} e quero saber mais.', -- texto que o lead manda ao abrir o WhatsApp
  ativo boolean not null default true,
  ultimo_lead timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table ads.lead_sites enable row level security;

-- lead = contato com etapa no funil
alter table ads.whatsapp_contatos
  add column if not exists etapa text, -- null = não é lead | NOVO | CONTATO | NEGOCIANDO | GANHO | PERDIDO
  add column if not exists lead_site uuid references ads.lead_sites(id) on delete set null,
  add column if not exists lead_em timestamptz,
  add column if not exists lead_dados jsonb, -- { mensagem, pagina, utm }
  add column if not exists consentimento_em timestamptz, -- LGPD: quando marcou "aceito ser contatado pelo WhatsApp"
  add column if not exists consentimento_texto text;
create index if not exists whatsapp_contatos_lead_idx on ads.whatsapp_contatos (lead_em desc) where etapa is not null;

-- cada envio do formulário: limite por IP (só o hash) e por site
create table if not exists ads.lead_entradas (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references ads.lead_sites(id) on delete cascade,
  numero text not null,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists lead_entradas_site_idx on ads.lead_entradas (site_id, created_at desc);
create index if not exists lead_entradas_ip_idx on ads.lead_entradas (ip_hash, created_at desc);
alter table ads.lead_entradas enable row level security;
