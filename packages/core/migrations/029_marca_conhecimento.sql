-- Base de conhecimento da marca: a IA vasculha o site e organiza fatos, produtos, público, provas e linguagem.
-- Entra no contexto de roteiros, legendas, calendário e campanhas. O cliente pode revisar o texto.
alter table ads.brands add column if not exists conhecimento text not null default '';
alter table ads.brands add column if not exists conhecimento_em timestamptz;
alter table ads.brands add column if not exists conhecimento_fontes jsonb not null default '[]';
