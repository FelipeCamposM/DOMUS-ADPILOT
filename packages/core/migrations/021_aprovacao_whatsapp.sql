-- Aprovação pelo WhatsApp: com a arte pronta o post fica em REVISAO e vai para o número dos avisos (um por vez).
-- "sim" agenda; "não" pede o que mudar e a IA refaz o post e a arte.
alter table ads.calendario_itens add column if not exists aprovacao text; -- null (na fila) | ENVIADO (esperando sim/não) | MUDANCA (esperando o pedido) | APROVADA
drop index if exists ads.calendario_itens_fila_idx;
create index if not exists calendario_itens_fila_idx on ads.calendario_itens (status, data_hora) where status in ('APROVADO', 'GERANDO', 'REVISAO', 'AGENDADO');
