import "server-only";
import { db } from "@domus-ads/core";

export interface ContaGoogle {
  id: string; name: string; external_id: string; currency: string; timezone: string | null; status: string;
  last_synced_at: string | null; conexao: string; perfil: { nome?: string | null; email?: string | null; foto?: string | null }; campanhas: number;
}

/** Contas do Google Ads do workspace para os seletores de campanha, com quem conectou (nome, e-mail, foto). */
export function contasGoogle(workspaceId: string) {
  return db()<ContaGoogle[]>`
    select a.id, a.name, a.external_id, a.currency, a.timezone, a.status,
      to_char(coalesce(a.last_synced_at, k.last_synced_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_synced_at,
      k.label as conexao, k.perfil,
      (select count(*)::int from ads.campaigns c where c.ad_account_id = a.id and c.status <> 'ARCHIVED') as campanhas
    from ads.ad_accounts a join ads.ad_connections k on k.id = a.connection_id
    where a.workspace_id = ${workspaceId} and a.provider = 'GOOGLE' and k.status <> 'REVOKED' order by a.name`;
}
