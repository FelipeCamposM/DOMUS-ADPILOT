-- Estatísticas dos sites (só leitura, pela conta de serviço do Google): propriedade do GA4 e site do Search Console.
alter table ads.lead_sites
  add column if not exists ga4_propriedade text, -- só números (ID da propriedade)
  add column if not exists gsc_site text; -- "sc-domain:dominio.com" ou "https://dominio.com/"
