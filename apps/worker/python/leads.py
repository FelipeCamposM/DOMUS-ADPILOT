"""Prospecção de leads no Google Maps com Playwright e auditoria comercial de sites.

Os dados das empresas vêm dos lotes JSON que a página do Maps baixa sozinha
(`maps_batch.py`): nenhuma página de empresa é aberta. A leitura pelo DOM fica só
como plano B, para o dia em que o Google mudar o formato dos lotes.
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import re
import time
from typing import Any, Callable
from urllib.parse import quote, urlparse

from playwright.async_api import Browser, BrowserContext, Page, Response, TimeoutError as PlaywrightTimeout

from maps_batch import (
    BATCH_URL, CONSENT_COOKIES, END_CLASS, END_MARKERS, find_emails, find_socials, find_tech,
    find_whatsapp, parse_batch, site_host,
)


DEFAULT_WEIGHTS = {
    "noSite": 30, "brokenSite": 28, "weakSite": 18, "socialOnly": 24,
    "instagram": 12, "contact": 10, "reviews": 6, "distance": 4, "ads": 8,
}
SOCIAL_HOSTS = {"instagram.com", "facebook.com", "m.facebook.com", "tiktok.com", "x.com", "twitter.com", "linktr.ee", "beacons.ai", "wa.me"}
AUDIT_WORKERS = 5
CONTACT_LINK = re.compile(r"contato|contact|fale-conosco|fale_conosco|atendimento|sobre|about", re.I)


def _clean(text: str | None) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _lead_id(campaign_id: str, name: str, address: str, phone: str) -> str:
    raw = "|".join((campaign_id, _clean(name).casefold(), _clean(address).casefold(), re.sub(r"\D", "", phone)))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _coords(url: str) -> tuple[float | None, float | None]:
    match = re.search(r"@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", url)
    return (float(match.group(1)), float(match.group(2))) if match else (None, None)


def _distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371.0088 * 2 * math.asin(math.sqrt(h))


def _social_only(url: str) -> bool:
    try:
        return urlparse(url).netloc.lower().removeprefix("www.") in SOCIAL_HOSTS
    except ValueError:
        return False


def zoom_for_radius(radius_km: float) -> int:
    """Zoom do Maps cuja janela (~1280 px) cobre o raio pedido."""
    for limit, zoom in ((0.6, 17), (1.2, 16), (2.5, 15), (5, 14), (10, 13), (20, 12), (40, 11)):
        if radius_km <= limit:
            return zoom
    return 10


def search_cells(center: tuple[float, float], radius_km: float) -> list[tuple[float, float, float]]:
    """Centros (lat, lng, raio da célula) que cobrem o círculo. Uma busca do Maps para em ~120
    empresas, então um raio grande vira uma grade 3x3 — a célula do meio primeiro, as que
    saem do círculo descartadas."""
    if radius_km <= 2.5:
        return [(center[0], center[1], radius_km)]
    step = radius_km * 2 / 3
    dlat = step / 111.32
    dlng = step / (111.32 * max(0.1, math.cos(math.radians(center[0]))))
    cells = [(center[0] + i * dlat, center[1] + j * dlng, step / 2 * 1.42) for i in (0, -1, 1) for j in (0, -1, 1)]
    cells.sort(key=lambda c: abs(c[0] - center[0]) + abs(c[1] - center[1]))
    return [c for c in cells if _distance_km(center, (c[0], c[1])) <= radius_km]


def maps_search_url(query: str, lat: float | None, lng: float | None, zoom: int, location: str = "") -> str:
    if lat is None or lng is None:
        return f"https://www.google.com/maps/search/{quote(query + ' perto de ' + location)}?hl=pt-BR&gl=br"
    return f"https://www.google.com/maps/search/{quote(query)}/@{lat:.6f},{lng:.6f},{zoom}z?hl=pt-BR&gl=br"


def lead_from_row(row: dict[str, Any]) -> dict[str, Any]:
    place_id = str(row.get("placeId") or "")
    maps = f"https://www.google.com/maps/place/?q=place_id:{place_id}" if place_id else ""
    return {
        "name": _clean(str(row.get("name") or "")), "category": _clean(str(row.get("category") or "")),
        "address": _clean(str(row.get("address") or "")), "phone": _clean(str(row.get("phone") or "")),
        "websiteUrl": str(row.get("website") or ""),
        "rating": float(row["rating"]) if isinstance(row.get("rating"), (int, float)) else None,
        "reviewCount": int(row["reviewCount"]) if isinstance(row.get("reviewCount"), (int, float)) else None,
        "latitude": row.get("latitude"), "longitude": row.get("longitude"), "placeId": place_id,
        "sourceUrls": [maps] if maps else [], "sources": ["google_maps"],
    }


def dedupe_key(lead: dict[str, Any]) -> str:
    return lead.get("placeId") or (_clean(lead.get("name")).casefold() + "|" + _clean(lead.get("address")).casefold())


async def _text(locator, timeout: int = 1200) -> str:
    try:
        return _clean(await locator.first.inner_text(timeout=timeout))
    except Exception:
        return ""


async def _attribute(locator, name: str, timeout: int = 1200) -> str:
    try:
        return _clean(await locator.first.get_attribute(name, timeout=timeout))
    except Exception:
        return ""


def _no_site(status: str, url: str = "") -> dict[str, Any]:
    if status == "no_site":
        finding = {"code": "no_site", "label": "Não possui site", "severity": "critical"}
    else:
        finding = {"code": "social_only", "label": "Possui apenas página em rede social", "severity": "opportunity"}
    socials = find_socials(url)
    return {"status": status, "email": "", "socials": socials, "whatsapp": find_whatsapp(url), "tech": {}, "findings": [finding]}


async def audit_website(context: BrowserContext, url: str, timeout_ms: int = 15000) -> dict[str, Any]:
    if not url:
        return _no_site("no_site")
    if _social_only(url):
        return _no_site("social_only", url)

    findings: list[dict[str, str]] = []
    console_errors: list[str] = []
    broken = lambda code, label, value="": {"status": "broken", "email": "", "socials": {}, "whatsapp": "", "tech": {},
                                            "findings": [{"code": code, "label": label, "severity": "critical", **({"value": value} if value else {})}]}
    page = await context.new_page()
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: console_errors.append(str(error)))
    try:
        await page.set_viewport_size({"width": 390, "height": 844})
        started = time.perf_counter()
        response = await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        load_ms = round((time.perf_counter() - started) * 1000)
        code = response.status if response else 0
        if code >= 400:
            return broken("http_error", f"Servidor respondeu HTTP {code}", str(code))
        await page.wait_for_timeout(800)
        html = await page.content()
        text = _clean(await page.locator("body").inner_text(timeout=3000))
        if len(text) < 40:
            return broken("blank_page", "Página vazia ou sem conteúdo útil")
        if not page.url.startswith("https://"):
            findings.append({"code": "no_https", "label": "Site sem HTTPS", "severity": "opportunity"})
        if load_ms > 5000:
            findings.append({"code": "slow_load", "label": f"Carregamento inicial lento ({load_ms / 1000:.1f}s)", "severity": "opportunity", "value": str(load_ms)})
        if not await page.locator('meta[name="viewport"]').count():
            findings.append({"code": "no_viewport", "label": "Sem configuração para celular", "severity": "opportunity"})
        if await page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 8"):
            findings.append({"code": "mobile_overflow", "label": "Conteúdo estoura a largura no celular", "severity": "opportunity"})
        title = _clean(await page.title())
        description = await _attribute(page.locator('meta[name="description"]'), "content")
        if not title or len(title) < 8:
            findings.append({"code": "weak_title", "label": "Título da página ausente ou genérico", "severity": "opportunity"})
        if not description:
            findings.append({"code": "no_description", "label": "Sem descrição para Google/SEO local", "severity": "opportunity"})
        if not await page.locator("form").count() and not re.search(r"contact|contato|orçamento|fale conosco", text, re.I):
            findings.append({"code": "no_cta", "label": "Sem formulário ou chamada clara para contato", "severity": "opportunity"})
        if not re.search(r"(?:\+?\d[\d\s().-]{7,}\d)|whatsapp|ligue|telefone", text, re.I):
            findings.append({"code": "no_phone", "label": "Telefone ou WhatsApp não está visível", "severity": "opportunity"})
        year_matches = [int(x) for x in re.findall(r"(?:©|copyright)\s*(20\d{2})", text, re.I)]
        if year_matches and max(year_matches) < time.gmtime().tm_year - 2:
            findings.append({"code": "old_copyright", "label": "Rodapé parece desatualizado", "severity": "opportunity", "value": str(max(year_matches))})
        if len(html) > 1_500_000:
            findings.append({"code": "heavy_html", "label": "Página inicial muito pesada", "severity": "opportunity"})
        broken_images = await page.locator("img").evaluate_all("imgs => imgs.filter(img => img.complete && img.naturalWidth === 0).length")
        if broken_images:
            findings.append({"code": "broken_images", "label": f"{broken_images} imagem(ns) quebrada(s)", "severity": "opportunity", "value": str(broken_images)})
        if console_errors:
            findings.append({"code": "js_errors", "label": "Erros de JavaScript detectados", "severity": "opportunity", "value": str(len(console_errors))})

        host = site_host(page.url)
        emails = find_emails(html, host)
        if not emails:
            # Sem e-mail na home: uma única visita à página de contato/sobre do próprio site.
            links = await page.locator("a[href]").evaluate_all("els => els.map(e => e.href)")
            contact = next((x for x in links if CONTACT_LINK.search(x) and site_host(x) == host), "")
            if contact:
                try:
                    await page.goto(contact, wait_until="domcontentloaded", timeout=timeout_ms)
                    extra = await page.content()
                    emails = find_emails(extra, host)
                    html += extra
                except Exception:
                    pass
        tech = find_tech(html)
        return {"status": "weak" if findings else "healthy", "email": emails[0] if emails else "",
                "socials": find_socials(html), "whatsapp": find_whatsapp(html), "tech": tech, "findings": findings}
    except PlaywrightTimeout:
        return broken("timeout", "Site excedeu o tempo limite")
    except Exception as exc:
        return broken("network_error", "Falha ao abrir o site", type(exc).__name__)
    finally:
        await page.close()


def score_lead(lead: dict[str, Any], weights: dict[str, float], radius_km: float) -> tuple[int, list[str]]:
    points = 0.0
    reasons: list[str] = []
    status_key = {"no_site": "noSite", "broken": "brokenSite", "weak": "weakSite", "social_only": "socialOnly"}.get(lead.get("websiteStatus"))
    if status_key:
        points += float(weights.get(status_key, 0)); reasons.append(f"Oportunidade de site: +{weights.get(status_key, 0)}")
    for finding in (lead.get("auditFindings") or [])[:3]:
        if finding.get("label"): reasons.append(str(finding["label"]))
    if lead.get("instagramUrl") or any((lead.get("socials") or {}).values()):
        points += float(weights.get("instagram", 0)); reasons.append(f"Ativo nas redes sociais: +{weights.get('instagram', 0)}")
    if lead.get("phone") or lead.get("email") or lead.get("whatsapp"):
        points += float(weights.get("contact", 0)); reasons.append(f"Contato disponível: +{weights.get('contact', 0)}")
    tech = lead.get("tech") or {}
    if tech.get("fbPixel") or tech.get("googleAds") or tech.get("tiktokPixel"):
        points += float(weights.get("ads", 0)); reasons.append(f"Já investe em anúncios: +{weights.get('ads', 0)}")
    reviews = int(lead.get("reviewCount") or 0)
    if reviews >= 10:
        bonus = float(weights.get("reviews", 0)) * min(1, math.log10(reviews + 1) / 3)
        points += bonus; reasons.append(f"Prova social: +{round(bonus)}")
    distance = lead.get("distanceKm")
    if distance is not None and radius_km > 0:
        points += float(weights.get("distance", 0)) * max(0, 1 - float(distance) / radius_km)
    total = max(1.0, sum(max(0.0, float(v)) for v in weights.values()))
    return min(100, round(points / total * 100)), reasons


def shortlist_candidates(candidates: list[dict[str, Any]], max_leads: int, focus: str) -> list[dict[str, Any]]:
    if focus == "all":
        return candidates[:max_leads]
    without_site = [item for item in candidates if not item.get("websiteUrl") or _social_only(str(item.get("websiteUrl")))]
    with_site = [item for item in candidates if item not in without_site]
    if focus == "balanced":
        no_site_limit = math.ceil(max_leads * 0.7)
        return [*without_site[:no_site_limit], *with_site[:max_leads]]
    return [*without_site[:max_leads], *with_site[:max_leads]]


def rank_opportunities(leads: list[dict[str, Any]], max_leads: int, focus: str) -> list[dict[str, Any]]:
    if focus == "all":
        return sorted(leads, key=lambda lead: -int(lead.get("score") or 0))[:max_leads]
    order = {"no_site": 0, "social_only": 1, "broken": 2, "weak": 3, "unknown": 4, "healthy": 5}
    return sorted(leads, key=lambda lead: (order.get(str(lead.get("websiteStatus")), 4), -int(lead.get("score") or 0)))[:max_leads]


async def _dismiss_google_consent(page: Page) -> None:
    if "consent.google" not in page.url:
        return
    for label in ("Rejeitar tudo", "Aceitar tudo", "Reject all", "Accept all"):
        try:
            button = page.get_by_role("button", name=label)
            if await button.count():
                await button.first.click(timeout=2000)
                await page.wait_for_url(re.compile(r"google\.[a-z.]+/maps"), timeout=15000)
                return
        except Exception:
            pass


JS_END = f"""(() => {{
  const f = document.querySelector('div[role="feed"]');
  return f ? (!!f.querySelector('.{END_CLASS}') || {list(END_MARKERS)!r}.some(m => f.innerText.includes(m))) : false;
}})()"""


async def collect_batches(page: Page, url: str, limit: int, pace_ms: int, max_seconds: float = 120) -> tuple[list[dict[str, Any]], str]:
    """Abre a busca, rola o feed e devolve (empresas lidas dos lotes, motivo da parada)."""
    responses: list[Response] = []
    limited = [0]

    def on_response(resp: Response) -> None:
        if BATCH_URL.match(resp.url):
            if resp.status == 429: limited[0] += 1
            else: responses.append(resp)

    page.on("response", on_response)
    seen: dict[str, dict[str, Any]] = {}

    async def take() -> int:
        before = len(seen)
        while responses:
            resp = responses.pop(0)
            try:
                body = await resp.text()
            except Exception:
                continue
            for row in parse_batch(body):
                seen.setdefault(str(row.get("placeId") or row.get("dataId") or row["name"]), row)
        return len(seen) - before

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await _dismiss_google_consent(page)
        if "/sorry/" in page.url:
            return [], "blocked"
        try:
            await page.wait_for_selector('div[role="feed"]', timeout=15000)
        except PlaywrightTimeout:
            return [], "single" if "/maps/place/" in page.url else "no-feed"
        started, stale, reason = time.monotonic(), 0, "limit"
        while len(seen) < limit:
            if time.monotonic() - started > max_seconds:
                reason = "timeout"; break
            if limited[0] or "/sorry/" in page.url:
                reason = "blocked"; break
            try:
                await page.evaluate("(() => { const f = document.querySelector('div[role=\"feed\"]'); if (f) f.scrollTo(0, f.scrollHeight); })()")
            except Exception:
                pass
            await page.wait_for_timeout(pace_ms)
            if await take():
                stale = 0
                continue
            if await page.evaluate(JS_END):
                await page.wait_for_timeout(600); await take()
                reason = "end-of-list"; break
            stale += 1
            # Um lote pode demorar vários segundos; 6 rolagens sem nada novo = acabou.
            if stale >= 6:
                reason = "no-growth"; break
        await take()
        return list(seen.values()), reason
    finally:
        page.remove_listener("response", on_response)


async def _maps_links(page: Page, limit: int, pace_ms: int) -> list[str]:
    """Plano B: os links de empresa visíveis no feed já aberto."""
    for _ in range(15):
        count = await page.locator('div[role="feed"] a[href*="/maps/place/"]').count()
        if count >= limit: break
        await page.evaluate("(() => { const f = document.querySelector('div[role=\"feed\"]'); if (f) f.scrollTo(0, f.scrollHeight); })()")
        await page.wait_for_timeout(pace_ms)
    links = await page.locator('a[href*="/maps/place/"]').evaluate_all("els => [...new Set(els.map(e => e.href))]")
    return [x for x in links if x][:limit]


async def _map_detail(context: BrowserContext, url: str) -> dict[str, Any] | None:
    page = await context.new_page()
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        await page.wait_for_timeout(1000)
        name = await _text(page.locator("h1")) or await _attribute(page.locator("h1"), "aria-label")
        if not name: return None
        body = _clean(await page.locator("body").inner_text(timeout=3000))
        address = await _attribute(page.locator('[data-item-id="address"]'), "aria-label")
        phone = await _attribute(page.locator('[data-item-id^="phone"]'), "aria-label")
        website = await _attribute(page.locator('a[data-item-id="authority"]'), "href")
        category = await _text(page.locator('button[jsaction*="category"]'))
        rating_text = await _attribute(page.locator('[role="img"][aria-label*="estrela"], [role="img"][aria-label*="star"]'), "aria-label")
        rating_match = re.search(r"(\d+[.,]\d+)", rating_text)
        review_match = re.search(r"([\d,.]+)\s+(?:avaliações|reviews)", body, re.I)
        lat, lng = _coords(page.url)
        return {"name": name, "category": category, "address": re.sub(r"^(Endereço|Address):\s*", "", address),
                "phone": re.sub(r"^(Telefone|Phone):\s*", "", phone), "websiteUrl": website,
                "rating": float(rating_match.group(1).replace(",", ".")) if rating_match else None,
                "reviewCount": int(re.sub(r"\D", "", review_match.group(1))) if review_match else None,
                "latitude": lat, "longitude": lng, "placeId": "", "sourceUrls": [url], "sources": ["google_maps"]}
    except Exception:
        return None
    finally:
        await page.close()


async def _real_user_agent(browser: Browser) -> str:
    """O agente do Edge sem o `Headless`: com ele o Google manda a versão limitada do Maps,
    sem número de avaliações."""
    context = await browser.new_context()
    try:
        page = await context.new_page()
        agent = await page.evaluate("navigator.userAgent")
        return str(agent).replace("HeadlessChrome/", "Chrome/").replace("HeadlessEdg/", "Edg/")
    finally:
        await context.close()


async def search_leads(data: dict[str, Any], event: Callable[[dict], None], step: Callable[[str], None], progress: Callable[[int], None]) -> dict[str, Any]:
    from playwright.async_api import async_playwright

    campaign_id = str(data.get("campaignId") or "")
    niches = [str(x).strip() for x in data.get("niches") or [] if str(x).strip()]
    location = str(data.get("location") or "").strip()
    radius_km = max(0.1, min(50.0, float(data.get("radiusKm") or 10)))
    max_leads = max(1, min(500, int(data.get("maxLeads") or 100)))
    opportunity_focus = str(data.get("opportunityFocus") or "no_site_first")
    pool_limit = max_leads if opportunity_focus == "all" else min(500, max_leads * 3)
    pace_ms = {"slow": 2200, "balanced": 1400, "fast": 800}.get(data.get("pace"), 1400)
    weights = {**DEFAULT_WEIGHTS, **(data.get("scoreWeights") or {})}
    try:
        center: tuple[float | None, float | None] = (float(data["centerLat"]), float(data["centerLng"]))
    except (KeyError, TypeError, ValueError):
        center = (None, None)
    if not campaign_id or not niches or (not location and center[0] is None):
        return {"success": False, "errorCode": "INVALID_INPUT", "message": "Informe campanha, nicho e local."}

    found: list[dict[str, Any]] = []
    seen: set[str] = set()
    stops: list[str] = []

    def accept(lead: dict[str, Any]) -> bool:
        if not lead.get("name"): return False
        key = dedupe_key(lead)
        if key in seen: return False
        seen.add(key)
        lat, lng = lead.get("latitude"), lead.get("longitude")
        if center[0] is not None and isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
            lead["distanceKm"] = round(_distance_km((center[0], center[1]), (lat, lng)), 2)  # type: ignore[arg-type]
            if lead["distanceKm"] > radius_km: return False
        found.append(lead)
        event({"type": "lead", "lead": lead, "index": len(found)})
        progress(min(60, round(len(found) / pool_limit * 60)))
        return True

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge", headless=True)
        try:
            context = await browser.new_context(locale="pt-BR", user_agent=await _real_user_agent(browser),
                                                viewport={"width": 1280, "height": 900})
            await context.add_cookies([{"name": k, "value": v, "domain": ".google.com", "path": "/"} for k, v in CONSENT_COOKIES.items()])
            page = await context.new_page()
            cells = search_cells((center[0], center[1]), radius_km) if center[0] is not None else [(None, None, radius_km)]  # type: ignore[arg-type]
            for niche_index, niche in enumerate(niches):
                for cell_index, (lat, lng, cell_radius) in enumerate(cells):
                    if len(found) >= pool_limit: break
                    where = location or "o ponto escolhido"
                    step(f"Buscando {niche} em {where}" + (f" · área {cell_index + 1} de {len(cells)}" if len(cells) > 1 else ""))
                    url = maps_search_url(niche, lat, lng, zoom_for_radius(cell_radius), location)
                    # Folga de 3x: parte do que o Maps mostra cai fora do raio e é descartada depois.
                    rows, reason = await collect_batches(page, url, max(60, (pool_limit - len(found)) * 3), pace_ms)
                    stops.append(reason)
                    for row in rows:
                        if len(found) >= pool_limit: break
                        accept(lead_from_row(row))
                    if reason == "blocked":
                        step("O Google limitou as buscas; seguindo com o que já foi encontrado")
                        break
                    if not rows and reason in ("no-growth", "end-of-list", "limit", "timeout"):
                        # Feed aberto, mas nenhum lote legível: o formato mudou. Plano B pelo DOM.
                        step("Lendo empresas pela página (modo de compatibilidade)")
                        for link in await _maps_links(page, min(40, pool_limit - len(found)), pace_ms):
                            detail = await _map_detail(context, link)
                            if detail: accept(detail)
                progress(min(60, round((niche_index + 1) / len(niches) * 60)))
            await page.close()
            if center[0] is None and found:
                first = next((x for x in found if isinstance(x.get("latitude"), (int, float))), None)
                if first: center = (first["latitude"], first["longitude"])
            found = shortlist_candidates(found, max_leads, opportunity_focus)

            step(f"Auditando {len(found)} sites e calculando prioridades")
            done = [0]
            gate = asyncio.Semaphore(AUDIT_WORKERS)

            async def finish(lead: dict[str, Any]) -> None:
                if data.get("auditWebsites", True):
                    async with gate:
                        audit = await audit_website(context, lead.get("websiteUrl") or "")
                    lead["websiteStatus"] = audit["status"]
                    lead["auditFindings"] = audit["findings"]
                    lead["email"] = audit.get("email", "")
                    lead["socials"] = {k: v for k, v in (audit.get("socials") or {}).items() if v}
                    lead["tech"] = audit.get("tech") or {}
                    lead["whatsapp"] = audit.get("whatsapp", "")
                    lead["instagramUrl"] = lead["socials"].get("instagram", "")
                lead.setdefault("websiteStatus", "unknown")
                for key in ("instagramHandle", "instagramUrl", "email", "whatsapp", "phone"):
                    lead.setdefault(key, "")
                lead.setdefault("socials", {}); lead.setdefault("tech", {})
                lead["campaignId"] = campaign_id
                lead["id"] = _lead_id(campaign_id, lead["name"], lead.get("address", ""), lead.get("phone", ""))
                lead["stageId"] = "new"
                lead["notes"] = ""
                lead["tags"] = []
                lead["country"] = data.get("country") or "BR"
                lead["createdAt"] = lead["updatedAt"] = int(time.time() * 1000)
                lead["score"], lead["scoreReasons"] = score_lead(lead, weights, radius_km)
                done[0] += 1
                progress(60 + round(done[0] / max(1, len(found)) * 40))

            await asyncio.gather(*(finish(lead) for lead in found))
            found = rank_opportunities(found, max_leads, opportunity_focus)
            for index, lead in enumerate(found):
                event({"type": "audited", "lead": lead, "index": index + 1})
        finally:
            await browser.close()
    blocked = "blocked" in stops
    return {"success": True, "campaignId": campaign_id, "found": len(found), "audited": len(found),
            "center": {"latitude": center[0], "longitude": center[1]}, "blocked": blocked, "leads": found}
