"""Ponto de entrada da prospecção no worker do AdPilot.

leads.py, maps_batch.py e test_leads.py são cópias SEM MUDANÇA do CAMPS-UTILS
(D:/PROGRAMACAO/PROJETOS/python/PDF-TO-MARKDOWN/python). Corrigiu lá? Copie de novo para cá.

Uso: python prospectar.py entrada.json
- stdout: UMA linha de JSON com o resultado de search_leads;
- stderr: o andamento, uma linha por evento: LEADEVENT:{json} · STEP: texto · PROGRESS:n.
"""

from __future__ import annotations

import asyncio
import json
import sys

import leads
from leads import _lead_id, search_leads

# Site que trava (JS em loop, evaluate sem resposta) segurava a vaga da auditoria para sempre e a busca toda estourava o
# tempo. Aqui cada site tem um teto total; passou, vira "Site excedeu o tempo limite" e a fila anda.
TETO_SITE_S = 45
leads.AUDIT_WORKERS = 8
_auditar = leads.audit_website


async def _auditar_com_teto(context, url, timeout_ms=15000):
    tarefa = asyncio.ensure_future(_auditar(context, url, timeout_ms))
    # asyncio.wait não espera o cancelamento terminar (wait_for esperaria um page.close() travado)
    feito, _ = await asyncio.wait({tarefa}, timeout=TETO_SITE_S)
    if feito:
        return tarefa.result()
    tarefa.cancel()
    return {"status": "broken", "email": "", "socials": {}, "whatsapp": "", "tech": {},
            "findings": [{"code": "timeout", "label": "Site excedeu o tempo limite", "severity": "critical"}]}


leads.audit_website = _auditar_com_teto


async def auditar_existentes(data: dict, step, progress) -> dict:
    """Busca que caiu na auditoria: audita os leads já guardados (sem ir de novo ao Maps) e recalcula o score."""
    from playwright.async_api import async_playwright

    lista = [l for l in data.get("auditLeads") or [] if isinstance(l, dict) and l.get("name")]
    pesos = {**leads.DEFAULT_WEIGHTS, **(data.get("scoreWeights") or {})}
    raio = max(0.1, min(50.0, float(data.get("radiusKm") or 10)))
    step(f"Auditando {len(lista)} sites e calculando prioridades")
    feitos = [0]
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge", headless=True)
        try:
            context = await browser.new_context(locale="pt-BR", user_agent=await leads._real_user_agent(browser), viewport={"width": 1280, "height": 900})
            vaga = asyncio.Semaphore(leads.AUDIT_WORKERS)

            async def um(lead: dict) -> None:
                async with vaga:
                    a = await leads.audit_website(context, lead.get("websiteUrl") or "")
                lead["websiteStatus"] = a["status"]
                lead["auditFindings"] = a["findings"]
                lead["email"] = lead.get("email") or a.get("email", "")
                lead["socials"] = {k: v for k, v in (a.get("socials") or {}).items() if v} or lead.get("socials") or {}
                lead["tech"] = a.get("tech") or {}
                lead["whatsapp"] = lead.get("whatsapp") or a.get("whatsapp", "")
                lead["instagramUrl"] = lead.get("instagramUrl") or lead["socials"].get("instagram", "")
                lead["score"], lead["scoreReasons"] = leads.score_lead(lead, pesos, raio)
                feitos[0] += 1
                progress(60 + round(feitos[0] / max(1, len(lista)) * 40))  # mesma escala da busca: 60–100% = auditoria

            await asyncio.gather(*(um(l) for l in lista))
        finally:
            await browser.close()
    return {"success": True, "found": len(lista), "audited": len(lista), "leads": lista}


def log(texto: str) -> None:
    sys.stderr.write(texto.replace("\n", " ") + "\n")
    sys.stderr.flush()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    campanha = str(data.get("campaignId") or "")

    def event(evt: dict) -> None:
        lead = evt.get("lead")
        # o evento "lead" sai antes do id (o Python só calcula no fim): manda o mesmo id que o resultado terá,
        # para o worker guardar o que já achou se a busca for parada no meio
        if isinstance(lead, dict) and not lead.get("id"):
            evt = {**evt, "lead": {**lead, "id": _lead_id(campanha, lead.get("name", ""), lead.get("address", ""), lead.get("phone", ""))}}
        log("LEADEVENT:" + json.dumps(evt, ensure_ascii=False, default=str))

    try:
        passo, prog = (lambda t: log(f"STEP: {t}")), (lambda v: log(f"PROGRESS:{v}"))
        result = asyncio.run(auditar_existentes(data, passo, prog) if data.get("auditLeads") is not None else search_leads(data, event=event, step=passo, progress=prog))
    except Exception as e:  # noqa: BLE001 — qualquer falha vira resposta legível para a tela
        log(f"LEAD_SEARCH_FAILED: {type(e).__name__}: {e}")
        result = {"success": False, "errorCode": "CONVERSION_FAILED", "message": f"Não foi possível concluir a busca de leads ({type(e).__name__}: {e})"[:400]}
    sys.stdout.write(json.dumps(result, ensure_ascii=False, default=str) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
