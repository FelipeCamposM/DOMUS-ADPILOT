import json

import pytest

from leads import (
    _coords, _distance_km, _lead_id, _social_only, dedupe_key, lead_from_row, maps_search_url, rank_opportunities,
    score_lead, search_cells, shortlist_candidates, zoom_for_radius,
)
from maps_batch import find_emails, find_socials, parse_batch


def test_coords_google_maps_url():
    assert _coords("https://google.com/maps/place/x/@25.7617,-80.1918,13z") == (25.7617, -80.1918)
    assert _coords("https://example.com") == (None, None)


def test_distance_is_geodesic():
    assert _distance_km((0, 0), (0, 1)) == pytest.approx(111.195, rel=0.001)


def test_stable_lead_id_normalizes_case_and_spacing():
    assert _lead_id("c1", " ACME  Dental ", "Main St", "+1 305-555") == _lead_id("c1", "acme dental", "main st", "1305555")


def test_social_only_hosts():
    assert _social_only("https://instagram.com/acme")
    assert _social_only("https://linktr.ee/acme")
    assert not _social_only("https://acme.com")


def test_score_is_bounded_and_explained():
    lead = {"websiteStatus":"no_site","instagramUrl":"https://instagram.com/acme","phone":"123","reviewCount":100,"distanceKm":1}
    weights = {"noSite":30,"brokenSite":28,"weakSite":18,"socialOnly":24,"instagram":12,"contact":10,"reviews":6,"distance":4}
    score, reasons = score_lead(lead, weights, 10)
    assert 0 < score <= 100
    assert any("Oportunidade" in reason for reason in reasons)


def test_shortlist_prioritizes_companies_without_site_and_keeps_sites_to_audit():
    candidates = [
        {"name":"Healthy candidate","websiteUrl":"https://healthy.example"},
        {"name":"No site","websiteUrl":""},
        {"name":"Social only","websiteUrl":"https://instagram.com/acme"},
        {"name":"Potential weak site","websiteUrl":"https://weak.example"},
    ]
    selected = shortlist_candidates(candidates, 3, "no_site_first")
    assert [item["name"] for item in selected[:2]] == ["No site", "Social only"]
    assert any(item["name"] == "Potential weak site" for item in selected)


def test_final_ranking_places_no_site_before_weak_and_healthy():
    leads = [
        {"name":"Healthy","websiteStatus":"healthy","score":90},
        {"name":"Weak","websiteStatus":"weak","score":60},
        {"name":"No site","websiteStatus":"no_site","score":50},
    ]
    ranked = rank_opportunities(leads, 3, "no_site_first")
    assert [lead["name"] for lead in ranked] == ["No site", "Weak", "Healthy"]



def test_score_rewards_businesses_that_already_pay_for_ads():
    weights = {"noSite":30,"brokenSite":28,"weakSite":18,"socialOnly":24,"instagram":12,"contact":10,"reviews":6,"distance":4,"ads":8}
    base = {"websiteStatus":"weak","phone":"1"}
    with_ads, reasons = score_lead({**base, "tech":{"googleAds":True}}, weights, 5)
    without, _ = score_lead(base, weights, 5)
    assert with_ads > without
    assert any("anúncios" in r for r in reasons)


def test_small_radius_is_one_search_and_big_radius_a_grid_inside_the_circle():
    center = (-16.704, -49.26)
    assert len(search_cells(center, 2)) == 1
    cells = search_cells(center, 9)
    assert 5 <= len(cells) <= 9
    assert cells[0][:2] == center
    assert all(_distance_km(center, c[:2]) <= 9 for c in cells)
    assert zoom_for_radius(1) > zoom_for_radius(10)


def test_search_url_centers_on_the_picked_point():
    url = maps_search_url("imobiliárias", -16.704, -49.26, 15)
    assert "/@-16.704000,-49.260000,15z" in url and "hl=pt-BR" in url
    assert "perto%20de%20Goi" in maps_search_url("imobiliárias", None, None, 15, "Goiânia")


def test_batch_row_becomes_lead_and_dedupes_on_place_id():
    entity = [None] * 200
    entity[11], entity[78], entity[9] = "Imob A", "ChIJabc", [None, None, -16.7, -49.2]
    rows = parse_batch(")]}'\n" + json.dumps([None] * 64 + [[[None, entity]]]))
    lead = lead_from_row(rows[0])
    assert lead["name"] == "Imob A" and lead["latitude"] == -16.7
    assert lead["sourceUrls"] == ["https://www.google.com/maps/place/?q=place_id:ChIJabc"]
    assert dedupe_key(lead) == "ChIJabc"
    assert dedupe_key({"name": " Imob  B", "address": "Rua 1"}) == dedupe_key({"name": "imob b", "address": "rua 1"})


def test_site_signals_skip_platform_profiles_and_placeholder_emails():
    html = 'href="https://www.instagram.com/wix" href="https://instagram.com/imob.real" seuemail@dominio.com contato@imob.com.br'
    assert find_socials(html)["instagram"] == "https://instagram.com/imob.real"
    assert find_emails(html, "imob.com.br") == ["contato@imob.com.br"]
