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
        result = asyncio.run(search_leads(data, event=event, step=lambda t: log(f"STEP: {t}"), progress=lambda v: log(f"PROGRESS:{v}")))
    except Exception as e:  # noqa: BLE001 — qualquer falha vira resposta legível para a tela
        log(f"LEAD_SEARCH_FAILED: {type(e).__name__}: {e}")
        result = {"success": False, "errorCode": "CONVERSION_FAILED", "message": f"Não foi possível concluir a busca de leads ({type(e).__name__}: {e})"[:400]}
    sys.stdout.write(json.dumps(result, ensure_ascii=False, default=str) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
