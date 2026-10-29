-- Mensagem agendada: fica PENDENTE com agendado_para no futuro; o job do worker só roda nessa hora (jobs.run_after).
-- created_at = hora agendada, para a bolha entrar no lugar certo da conversa quando sair.
alter table ads.whatsapp_envios add column if not exists agendado_para timestamptz;
create index if not exists whatsapp_envios_agendadas_idx on ads.whatsapp_envios (agendado_para) where agendado_para is not null and status = 'PENDENTE';

-- Modelos ganham categoria e contador de uso (os mais usados aparecem primeiro no seletor)
alter table ads.whatsapp_templates
  add column if not exists categoria text not null default 'Geral' check (length(btrim(categoria)) between 2 and 30),
  add column if not exists usos int not null default 0,
  add column if not exists usado_em timestamptz;

-- Sininho do topo: até quando cada pessoa já viu as notificações ("marcar todas como lidas")
create table if not exists ads.notificacoes_lidas (
  user_id uuid primary key,
  lidas_em timestamptz not null default now()
);
alter table ads.notificacoes_lidas enable row level security;

insert into ads.whatsapp_templates (nome, categoria, texto)
select 'SIAPLUS · oferta pós-teste', 'Ofertas', $t$Oi {primeiro_nome}, tudo bem? Aqui é o Felipe, do *SIAPLUS* 👋

Vi que você usou o teste grátis de 24 horas. Deu para conhecer o sistema? Se ficou alguma dúvida, me conta que eu te ajudo.

Para quem fez o teste, liberei uma condição especial: *o último bimestre do ano (novembro e dezembro) por só R$ 20*. Você continua de onde parou, com tudo que já cadastrou.

Quer que eu deixe ativo para você?$t$
where not exists (select 1 from ads.whatsapp_templates where nome = 'SIAPLUS · oferta pós-teste');
