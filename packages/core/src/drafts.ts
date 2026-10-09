import { audit, type Actor } from "./audit";
import { db, type Json } from "./db";
import { googleSearchSchema } from "./google-search";
import { toDecimal } from "./money";
import { GoogleAdsProvider, providerFor } from "./providers";

interface Rascunho { id: string; name: string; status: string; spec: unknown; ad_account_id: string | null; account_external_id: string | null; credentials_enc: string | null; provider: string }

/** Carrega o rascunho + a conta de anúncio + a credencial, SEMPRE filtrando pelo workspace. */
async function carregar(workspaceId: string, draftId: string): Promise<Rascunho> {
  const [d] = await db()<Rascunho[]>`
    select d.id, d.name, d.status, d.spec, d.ad_account_id, d.provider, a.external_id as account_external_id, k.credentials_enc
    from ads.campaign_drafts d
    left join ads.ad_accounts a on a.id = d.ad_account_id and a.workspace_id = d.workspace_id
    left join ads.ad_connections k on k.id = a.connection_id and k.status <> 'REVOKED'
    where d.id = ${draftId} and d.workspace_id = ${workspaceId}`;
  if (!d) throw new Error("Rascunho não encontrado");
  if (!d.account_external_id || !d.credentials_enc) throw new Error("Escolha uma conta do Google Ads conectada para este rascunho");
  if (d.provider !== "GOOGLE") throw new Error("Por enquanto só campanhas de pesquisa do Google podem ser publicadas daqui");
  return d;
}

function google(d: Rascunho): GoogleAdsProvider {
  const p = providerFor("GOOGLE", d.credentials_enc!);
  if (!(p instanceof GoogleAdsProvider)) throw new Error("Provider do Google indisponível");
  return p;
}

/** "Validar no Google": o Google confere a campanha inteira sem criar nada. */
export async function validarRascunho(p: { workspaceId: string; draftId: string }) {
  const d = await carregar(p.workspaceId, p.draftId);
  const spec = googleSearchSchema.parse(d.spec);
  await google(d).createSearchCampaign(d.account_external_id!, spec, { validateOnly: true });
  await db()`update ads.campaign_drafts set validated_at = now(), error = null, updated_at = now() where id = ${d.id}`;
}

/**
 * Publica: cria a campanha no Google (PAUSADA), já registra na lista de campanhas e na auditoria.
 * Trava atômica no status: dois cliques não criam duas campanhas.
 */
export async function publicarRascunho(p: { workspaceId: string; draftId: string; actor: Actor }) {
  const sql = db();
  const trava = await sql`update ads.campaign_drafts set status = 'PUBLISHING', error = null, updated_at = now()
    where id = ${p.draftId} and workspace_id = ${p.workspaceId} and status in ('DRAFT', 'FAILED')`;
  if (!trava.count) throw new Error("Este rascunho já está sendo publicado ou já foi publicado");
  try {
    const d = await carregar(p.workspaceId, p.draftId);
    const spec = googleSearchSchema.parse(d.spec);
    const { campaignId } = await google(d).createSearchCampaign(d.account_external_id!, spec);
    if (!campaignId) throw new Error("O Google não devolveu o id da campanha criada");
    await sql.begin(async (tx) => {
      const [c] = await tx<{ id: string }[]>`
        insert into ads.campaigns (workspace_id, ad_account_id, provider, external_id, name, objective, status, daily_budget, provider_data)
        values (${p.workspaceId}, ${d.ad_account_id}, 'GOOGLE', ${campaignId}, ${spec.nome}, 'SEARCH', 'PAUSED', ${toDecimal(spec.orcamentoDiario)}, ${tx.json({ criadaPeloDomus: true } as Json)})
        on conflict (ad_account_id, external_id) do update set name = excluded.name
        returning id`;
      await tx`update ads.campaign_drafts set status = 'PUBLISHED', campaign_id = ${c!.id}, published_at = now(), updated_at = now() where id = ${d.id}`;
      await audit(tx, {
        workspaceId: p.workspaceId, actor: p.actor, action: "Criar campanha (Google Pesquisa)", entityType: "campaign", entityId: c!.id, entityName: spec.nome,
        after: { orcamentoDiario: spec.orcamentoDiario, grupos: spec.grupos.length, palavras: spec.grupos.reduce((a, g) => a + g.palavras.length, 0), status: "PAUSED" },
      });
    });
    return { campaignId };
  } catch (e) {
    await sql`update ads.campaign_drafts set status = 'FAILED', error = ${(e as Error).message.slice(0, 2000)}, updated_at = now() where id = ${p.draftId} and workspace_id = ${p.workspaceId}`;
    throw e;
  }
}
