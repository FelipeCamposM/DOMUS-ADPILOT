-- Materiais: arquivos de apoio (logos, fotos de produto, fundos, texturas) para usar nos posts.
-- Ficam separados dos posts em Arquivos e Criativos, com uma "pasta" por marca (brand_id null = sem marca).
alter table ads.creatives add column if not exists material boolean not null default false;
alter table ads.creatives add column if not exists brand_id uuid references ads.brands(id) on delete set null;
create index if not exists creatives_material_idx on ads.creatives (workspace_id, brand_id) where material;
