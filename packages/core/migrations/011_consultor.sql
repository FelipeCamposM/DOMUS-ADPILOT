-- Conversas do consultor (bolha flutuante) ficam separadas das do analista (/ai), com histórico próprio
alter table ads.ai_conversations add column if not exists tipo text not null default 'analista'; -- analista | consultor
create index if not exists ai_conversations_tipo_idx on ads.ai_conversations (workspace_id, tipo, updated_at desc);
