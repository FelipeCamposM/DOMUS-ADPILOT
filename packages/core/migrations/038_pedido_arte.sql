-- Pedidos de mudança feitos na aprovação pelo WhatsApp: vão também para a IA da arte (ex.: "use o balão dos materiais").
alter table ads.calendario_itens add column if not exists pedido_arte text;
