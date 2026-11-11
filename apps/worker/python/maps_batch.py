"""Leitura dos lotes de resultado que a própria página do Google Maps baixa, e dos sinais
comerciais de um site (e-mail, redes sociais, pixels de anúncio).

Enquanto a lista de resultados rola, o Maps busca lotes de ~20 empresas em
`https://www.google.com/search?tbm=map…` como `)]}'\\n[...]` JSON. Cada lote já traz a ficha
completa (nome, endereço, telefone, site, nota, avaliações, coordenadas, ids), então nenhuma
página de empresa precisa ser aberta.

Adaptado do Google Maps Scraper Kit (https://github.com/Mahanaicoach/google-maps-scraper-kit),
MIT, Copyright (c) 2026 Mahan. Índices conferidos por eles em lotes reais em 2026-10-31; quando
o Google mudar o formato, compare com `engine/details.py` de lá. Só biblioteca padrão.
"""

from __future__ import annotations

import html as html_lib
import json
import re
import urllib.parse
from typing import Any

BATCH_URL = re.compile(r"^https://www\.google\.[a-z.]+/search\?.*tbm=map")
# Cookies que pulam a tela de consentimento do Google (UE e algumas regiões).
CONSENT_COOKIES = {"CONSENT": "YES+cb.20210720-07-p0.en+FX+410",
                   "SOCS": "CAISHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmVuIAEaBgiAo_CmBg"}
# Última linha do feed quando a lista acaba (classe estável há anos; os textos são o reforço).
END_CLASS = "HlvSq"
END_MARKERS = ("You've reached the end of the list", "Você chegou ao fim da lista", "Chegou ao fim da lista",
               "Has llegado al final de la lista")

FIELDS = {
    "name": (11,),
    "category": (13, 0),
    "address": (18,),
    "website": (7, 0),
    "phone": (178, 0, 0),
    "rating": (4, 7),
    "reviewCount": (4, 8),
    "latitude": (9, 2),
    "longitude": (9, 3),
    "placeId": (78,),
    "dataId": (10,),
}
ENTRIES = 64  # posição da lista de resultados dentro de um lote


def dig(node: Any, path: tuple[int, ...]) -> Any:
    for i in path:
        if not isinstance(node, list) or i >= len(node) or node[i] is None:
            return None
        node = node[i]
    return node


def plain_website(url: str) -> str:
    """O site de verdade: o Maps às vezes embrulha o link em `google.com/url?q=`."""
    if not url:
        return ""
    try:
        parts = urllib.parse.urlsplit(url)
        if parts.hostname and parts.hostname.endswith("google.com") and parts.path == "/url":
            q = urllib.parse.parse_qs(parts.query)
            return (q.get("q") or q.get("url") or [""])[0]
    except ValueError:
        return ""
    return url


def parse_entity(entity: list) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for name, path in FIELDS.items():
        v = dig(entity, path)
        if isinstance(v, (str, int, float)) and not isinstance(v, bool) and v != "":
            out[name] = v
    if "website" in out:
        out["website"] = plain_website(str(out["website"]))
    return out


def parse_batch(body: str) -> list[dict[str, Any]]:
    """As empresas de uma resposta `/search?tbm=map` (com ou sem o prefixo `)]}'`)."""
    if body.startswith(")]}'"):
        body = body.split("\n", 1)[-1]
    try:
        data = json.loads(body)
    except ValueError:
        return []
    entries = dig(data, (ENTRIES,))
    if not isinstance(entries, list):
        return []
    out = []
    for e in entries:
        entity = dig(e, (1,))
        if isinstance(entity, list):
            try:
                row = parse_entity(entity)
            except (TypeError, ValueError, IndexError, AttributeError):
                continue
            if row.get("name"):
                out.append(row)
    return out


# ── Sinais de um site ──────────────────────────────────────────────────────────
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}")
JUNK_SUFFIX = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".css", ".js")
JUNK_DOMAIN = ("example", "sentry", "wixpress", "wix.com", "godaddy", "squarespace", "wordpress",
               "sentry.io", "domain.com", "email.com", "seudominio", "seuemail", "exemplo")
JUNK_LOCAL = {"name", "email", "user", "you", "someone", "example", "username", "youremail", "yourname",
              "seuemail", "seunome", "nome", "exemplo", "noreply", "no-reply", "donotreply", "mailer-daemon", "postmaster"}
TOKEN = re.compile(r"[0-9a-f]{16,}")

SOCIALS = ("instagram", "facebook", "linkedin", "tiktok", "youtube", "x")
SOCIAL_RE = {
    "instagram": re.compile(r"https?://(?:www\.)?instagram\.com/([A-Za-z0-9_.]+)", re.I),
    "facebook": re.compile(r"https?://(?:www\.|m\.|web\.)?facebook\.com/([A-Za-z0-9_.\-]+)", re.I),
    "linkedin": re.compile(r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:company|in|school)/([A-Za-z0-9_.\-%]+)", re.I),
    "tiktok": re.compile(r"https?://(?:www\.)?tiktok\.com/@([A-Za-z0-9_.]+)", re.I),
    "youtube": re.compile(r"https?://(?:www\.)?youtube\.com/(?:@|channel/|c/|user/)([A-Za-z0-9_.\-]+)", re.I),
    "x": re.compile(r"https?://(?:www\.)?(?:twitter|x)\.com/([A-Za-z0-9_]{1,15})\b", re.I),
}
SKIP_HANDLE = {"", "home", "pages", "people", "help", "about", "policies", "policy", "legal", "tos", "privacy",
               "settings", "sharer", "tr", "profile.php", "plugins", "dialog", "intent", "login", "share.php",
               "permalink.php", "p", "reel", "reels", "explore", "stories", "tv", "watch", "events", "groups",
               "marketplace", "gaming", "photo", "hashtag", "search", "share", "i",
               "squarespace", "wix", "wixsite", "shopify", "wordpress", "wordpressdotcom", "godaddy", "weebly",
               "webflow", "hubspot", "mailchimp", "yelp", "tripadvisor", "ifood", "zapimoveis", "vivareal"}
WHATSAPP_RE = re.compile(r"(?:wa\.me/|api\.whatsapp\.com/send\?phone=|whatsapp\.com/send\?phone=)(\d{10,15})", re.I)
TECH_RE = {
    "fbPixel": re.compile(r"connect\.facebook\.net/[^\"']{0,300}fbevents\.js|fbq\(", re.I),
    "googleAds": re.compile(r"googleadservices\.com|AW-\d{6,}|googleads\.g\.doubleclick\.net", re.I),
    "analytics": re.compile(r"googletagmanager\.com/gtag|gtag\(|UA-\d{4,}|G-[A-Z0-9]{6,}", re.I),
    "tiktokPixel": re.compile(r"analytics\.tiktok\.com|ttq\.load\(", re.I),
}
CMS_RE = [
    ("WordPress", re.compile(r"/wp-content/|/wp-includes/", re.I)),
    ("Shopify", re.compile(r"cdn\.shopify\.com|shopify\.theme", re.I)),
    ("Wix", re.compile(r"static\.wixstatic\.com|_wixcss", re.I)),
    ("Squarespace", re.compile(r"static1\.squarespace", re.I)),
    ("Webflow", re.compile(r"assets\.website-files\.com|webflow\.com", re.I)),
]


def site_host(url: str) -> str:
    try:
        h = (urllib.parse.urlsplit(url if "://" in url else "http://" + url).hostname or "").lower()
    except ValueError:
        return ""
    return h[4:] if h.startswith("www.") else h


def _junk_domain(dom: str) -> bool:
    labels = dom.split(".")
    return any(dom == j or dom.endswith("." + j) if "." in j else j in labels for j in JUNK_DOMAIN)


def real_email(e: str) -> bool:
    local, _, dom = e.rpartition("@")
    return (bool(EMAIL_RE.fullmatch(e)) and not e.endswith(JUNK_SUFFIX) and local not in JUNK_LOCAL
            and not TOKEN.fullmatch(local) and not _junk_domain(dom))


def find_emails(text: str, site: str = "") -> list[str]:
    """Até 3 e-mails do HTML, sem placeholders nem nomes de imagem, os do próprio domínio primeiro."""
    found: list[str] = []
    for e in EMAIL_RE.findall(html_lib.unescape(text or "")):
        e = urllib.parse.unquote(e).lower()
        if real_email(e) and e not in found:
            found.append(e)
    own = lambda e: bool(site) and (e.endswith("@" + site) or e.endswith("." + site))
    return sorted(found, key=lambda e: not own(e))[:3]


def find_socials(text: str) -> dict[str, str]:
    """O primeiro link de perfil por rede, pulando compartilhar/login e perfis de plataformas."""
    out = dict.fromkeys(SOCIALS, "")
    for net, rx in SOCIAL_RE.items():
        for m in rx.finditer(text or ""):
            h = m.group(1).lower()
            if h in SKIP_HANDLE or (net == "facebook" and (h.isdigit() or len(h) < 3)):
                continue
            out[net] = m.group(0).rstrip("\"'/").replace("\\", "")
            break
    return out


def find_whatsapp(text: str) -> str:
    m = WHATSAPP_RE.search(text or "")
    return m.group(1) if m else ""


def find_tech(page_html: str) -> dict[str, Any]:
    """Sinais de quem já investe em marketing. Vazio quando o site não carregou."""
    if not page_html:
        return {}
    out: dict[str, Any] = {k: bool(rx.search(page_html)) for k, rx in TECH_RE.items()}
    out["cms"] = next((name for name, rx in CMS_RE if rx.search(page_html)), "")
    return out


if __name__ == "__main__":
    entity = [None] * 200
    entity[11], entity[7], entity[4] = "Imobiliária Teste", ["https://www.google.com/url?q=https://imob.com.br/&sa=U"], [None] * 7 + [4.6, 38]
    entity[9] = [None, None, -16.70, -49.25]
    batch = [None] * 64 + [[[None, entity], [None, "lixo"]]]
    rows = parse_batch(")]}'\n" + json.dumps(batch))
    assert rows == [{"name": "Imobiliária Teste", "website": "https://imob.com.br/", "rating": 4.6, "reviewCount": 38,
                     "latitude": -16.70, "longitude": -49.25}], rows
    assert find_emails('<a href="mailto:Contato@imob.com.br">x</a> logo@2x.png nome@exemplo.com', "imob.com.br") == ["contato@imob.com.br"]
    assert find_socials('href="https://instagram.com/imobteste/" href="https://facebook.com/sharer"')["instagram"] == "https://instagram.com/imobteste"
    assert find_whatsapp("https://wa.me/5562999990000?text=oi") == "5562999990000"
    assert find_tech("<script>fbq('init')</script>")["fbPixel"] is True
    print("ok")
