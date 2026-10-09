-- Rascunhos de campanha (escritos pela IA ou à mão). Nada vai para o Google/Meta até o usuário publicar.
create table if not exists ads.campaign_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  ad_account_id uuid references ads.ad_accounts(id) on delete set null,
  provider text not null default 'GOOGLE',
  kind text not null default 'SEARCH',
  name text not null,
  status text not null default 'DRAFT', -- GENERATING | DRAFT | PUBLISHING | PUBLISHED | FAILED
  source text not null default 'MANUAL', -- AI | MANUAL
  prompt text,
  spec jsonb not null default '{}',
  validated_at timestamptz,
  campaign_id uuid references ads.campaigns(id) on delete set null,
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists campaign_drafts_ws_idx on ads.campaign_drafts(workspace_id, created_at desc);
alter table ads.campaign_drafts enable row level security;
