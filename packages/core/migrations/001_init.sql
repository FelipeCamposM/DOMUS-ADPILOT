-- DOMUS Ads — MVP 1 + núcleo de IA. Tudo no schema `ads`, isolado do resto do Supabase.
-- O app conecta como postgres (bypass de RLS); RLS ligado sem policies bloqueia acesso via PostgREST/anon.

create schema if not exists ads;

create table if not exists ads.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists ads.workspace_members (
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor', -- owner | admin | editor | viewer
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on ads.workspace_members(user_id);

create table if not exists ads.ad_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  provider text not null, -- META | GOOGLE
  label text not null,
  credentials_enc text not null, -- AES-256-GCM (TOKEN_ENCRYPTION_KEY); nunca sai do servidor
  status text not null default 'ACTIVE', -- ACTIVE | ERROR | REVOKED
  last_error text,
  last_synced_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists ad_connections_ws_idx on ads.ad_connections(workspace_id);

create table if not exists ads.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  connection_id uuid not null references ads.ad_connections(id) on delete cascade,
  provider text not null,
  external_id text not null,
  name text not null,
  currency text not null default 'BRL',
  timezone text,
  status text not null default 'ACTIVE',
  provider_data jsonb not null default '{}',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (connection_id, external_id)
);
create index if not exists ad_accounts_ws_idx on ads.ad_accounts(workspace_id);

create table if not exists ads.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  ad_account_id uuid not null references ads.ad_accounts(id) on delete cascade,
  provider text not null,
  external_id text not null,
  name text not null,
  objective text,
  status text not null, -- DRAFT | ACTIVE | PAUSED | ARCHIVED | ERROR
  daily_budget numeric(14,2),
  lifetime_budget numeric(14,2),
  started_at timestamptz,
  ended_at timestamptz,
  provider_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  unique (ad_account_id, external_id)
);
create index if not exists campaigns_ws_idx on ads.campaigns(workspace_id);

create table if not exists ads.metrics_daily (
  campaign_id uuid not null references ads.campaigns(id) on delete cascade,
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  date date not null,
  spend numeric(14,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  leads numeric(14,2) not null default 0,
  conversions numeric(14,2) not null default 0,
  revenue numeric(14,2) not null default 0,
  primary key (campaign_id, date)
);
create index if not exists metrics_daily_ws_date_idx on ads.metrics_daily(workspace_id, date);

create table if not exists ads.jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references ads.workspaces(id) on delete cascade,
  type text not null, -- SYNC_META | SYNC_GOOGLE | AI_CHAT | ...
  payload jsonb not null default '{}',
  status text not null default 'PENDING', -- PENDING | RUNNING | COMPLETED | FAILED | CANCELLED
  progress int not null default 0,
  result jsonb,
  error text,
  attempts int not null default 0,
  max_attempts int not null default 3,
  run_after timestamptz not null default now(),
  locked_by text,
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists jobs_pending_idx on ads.jobs(run_after) where status = 'PENDING';
create index if not exists jobs_ws_idx on ads.jobs(workspace_id, created_at desc);

create table if not exists ads.job_logs (
  id bigserial primary key,
  job_id uuid not null references ads.jobs(id) on delete cascade,
  level text not null default 'info',
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists job_logs_job_idx on ads.job_logs(job_id);

-- Contas de IA (assinaturas Claude Code / Codex logadas no PC do worker, uma pasta de config por conta)
create table if not exists ads.ai_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null, -- claude | codex
  name text not null,
  config_dir text not null,
  status text not null default 'ACTIVE', -- ACTIVE | DISABLED
  priority int not null default 0,
  limited_until timestamptz,
  usage jsonb not null default '{}',
  last_used_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (provider, config_dir)
);

create table if not exists ads.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  user_id uuid not null,
  title text not null default 'Nova conversa',
  provider_pref text not null default 'auto', -- auto | claude | codex
  status text not null default 'IDLE', -- IDLE | RUNNING | ERROR
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_conversations_ws_idx on ads.ai_conversations(workspace_id, updated_at desc);

create table if not exists ads.ai_messages (
  id bigserial primary key,
  conversation_id uuid not null references ads.ai_conversations(id) on delete cascade,
  role text not null, -- user | assistant | system
  content text not null default '',
  status text not null default 'DONE', -- STREAMING | DONE | ERROR
  provider text,
  ai_account_id uuid references ads.ai_accounts(id) on delete set null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_conv_idx on ads.ai_messages(conversation_id, id);

-- Sessão do CLI por (conversa, conta): permite --resume na mesma conta
create table if not exists ads.ai_sessions (
  conversation_id uuid not null references ads.ai_conversations(id) on delete cascade,
  ai_account_id uuid not null references ads.ai_accounts(id) on delete cascade,
  session_id text not null,
  last_message_id bigint not null default 0, -- última mensagem que essa sessão já conhece
  primary key (conversation_id, ai_account_id)
);

create table if not exists ads.ai_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  conversation_id uuid references ads.ai_conversations(id) on delete set null,
  message_id bigint references ads.ai_messages(id) on delete set null,
  type text not null, -- PAUSE_CAMPAIGN | ACTIVATE_CAMPAIGN | UPDATE_BUDGET
  payload jsonb not null,
  summary text not null,
  reason text,
  status text not null default 'PENDING_APPROVAL', -- PENDING_APPROVAL | EXECUTED | REJECTED | FAILED
  decided_by uuid,
  decided_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ai_actions_ws_idx on ads.ai_actions(workspace_id, status);

-- Uso das IAs por turno (tokens, custo informado pelo CLI, duração, conta)
create table if not exists ads.ai_usage (
  id bigserial primary key,
  ai_account_id uuid references ads.ai_accounts(id) on delete set null,
  workspace_id uuid references ads.workspaces(id) on delete set null,
  conversation_id uuid references ads.ai_conversations(id) on delete set null,
  provider text not null,
  model text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(12,6),
  duration_ms int,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_created_idx on ads.ai_usage(created_at);

-- Uso das IAs por turno (tokens, custo informado pelo CLI, duração, conta)
create table if not exists ads.ai_usage (
  id bigserial primary key,
  ai_account_id uuid references ads.ai_accounts(id) on delete set null,
  workspace_id uuid references ads.workspaces(id) on delete set null,
  conversation_id uuid references ads.ai_conversations(id) on delete set null,
  provider text not null,
  model text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(12,6),
  duration_ms int,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_created_idx on ads.ai_usage(created_at);

create table if not exists ads.audit_logs (
  id bigserial primary key,
  workspace_id uuid references ads.workspaces(id) on delete cascade,
  user_id uuid,
  user_email text,
  action text not null,
  entity_type text,
  entity_id text,
  entity_name text,
  before jsonb,
  after jsonb,
  source text not null default 'USER', -- USER | AI_RECOMMENDATION | SYNC | SYSTEM
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_ws_idx on ads.audit_logs(workspace_id, created_at desc);

create table if not exists ads.worker_status (
  id text primary key,
  last_seen timestamptz not null default now(),
  info jsonb not null default '{}'
);

do $$
declare t text;
begin
  foreach t in array array['workspaces','workspace_members','ad_connections','ad_accounts','campaigns','metrics_daily',
    'jobs','job_logs','ai_accounts','ai_conversations','ai_messages','ai_sessions','ai_usage','ai_actions','audit_logs','worker_status']
  loop
    execute format('alter table ads.%I enable row level security', t);
  end loop;
end $$;

revoke all on schema ads from anon, authenticated;
