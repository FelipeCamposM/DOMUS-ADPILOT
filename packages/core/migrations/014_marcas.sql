-- Marcas: um workspace tem várias (ex.: DOMUS com os produtos SIAPLUS, ...), cada uma com a própria identidade visual.
-- Studio, campanhas e legendas escolhem a marca na hora; nada mais vem de "identidade do workspace".
create table if not exists ads.brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references ads.workspaces(id) on delete cascade,
  nome text not null,
  brand jsonb not null default '{}', -- brandSchema: cores, fontes, logo, tom, sobre, regras, referências
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, nome)
);
alter table ads.brands enable row level security;

alter table ads.video_projects add column if not exists brand_id uuid references ads.brands(id) on delete set null;
alter table ads.campaign_drafts add column if not exists brand_id uuid references ads.brands(id) on delete set null;
alter table ads.instagram_posts add column if not exists brand_id uuid references ads.brands(id) on delete set null;

-- a identidade que estava no workspace vira a primeira marca dele; o que já foi criado com ela continua apontando para ela
insert into ads.brands (workspace_id, nome, brand)
  select id, name, brand from ads.workspaces where brand <> '{}'::jsonb
  on conflict (workspace_id, nome) do nothing;
update ads.video_projects p set brand_id = b.id from ads.brands b
  where b.workspace_id = p.workspace_id and p.brand_id is null and coalesce(p.brief->>'identidade', 'workspace') = 'workspace';
update ads.campaign_drafts d set brand_id = b.id from ads.brands b where b.workspace_id = d.workspace_id and d.brand_id is null;

-- ponytail: ads.workspaces.brand fica sem uso (o código no ar ainda lê até o deploy); apagar numa migração futura
