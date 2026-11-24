-- Marca por post do calendário: vazio = usa a marca do planejamento (post avulso pode escolher a sua).
alter table ads.calendario_itens add column if not exists brand_id uuid references ads.brands(id) on delete set null;
