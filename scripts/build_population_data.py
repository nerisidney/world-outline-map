#!/usr/bin/env python3
"""Build a static population snapshot keyed by ISO numeric country code."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

WB_COUNTRIES_URL = "https://api.worldbank.org/v2/country?format=json&per_page=400"
WB_POPULATION_URL = "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&mrv=1&per_page=20000"
M49_BRIDGE_URL = "https://raw.githubusercontent.com/datasets/country-codes/main/data/country-codes.csv"
FLAG_EMOJI_URL = "https://cdn.jsdelivr.net/npm/country-flag-emoji-json@2.0.0/dist/by-code.json"
RESTCOUNTRIES_URL = "https://restcountries.com/v3.1/all?fields=cca3,capital,capitalInfo"
WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
WIKIDATA_TIMEOUT_SECONDS = 45
ALLOWED_LEADER_IMAGE_HOSTS = {"commons.wikimedia.org", "upload.wikimedia.org"}
WIKIDATA_LEADERS_QUERY = """
SELECT ?iso2 ?hogLabel ?hogImage ?hosLabel ?hosImage WHERE {
  ?country wdt:P297 ?iso2.
  FILTER(STRLEN(?iso2) = 2)
  OPTIONAL {
    ?country wdt:P6 ?hog.
    OPTIONAL { ?hog wdt:P18 ?hogImage. }
  }
  OPTIONAL {
    ?country wdt:P35 ?hos.
    OPTIONAL { ?hos wdt:P18 ?hosImage. }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""
WIKIDATA_GOV_FORMS_QUERY = """
SELECT ?iso2 ?govFormLabel WHERE {
  ?country wdt:P297 ?iso2.
  FILTER(STRLEN(?iso2) = 2)
  OPTIONAL { ?country wdt:P122 ?govForm. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_PATH = PROJECT_ROOT / "data" / "country-population.json"


def fetch_json(url: str):
    request = Request(url, headers={"User-Agent": "world-outline-map-data-builder/1.0"})
    with urlopen(request, timeout=WIKIDATA_TIMEOUT_SECONDS) as response:
        return json.load(response)


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": "world-outline-map-data-builder/1.0"})
    with urlopen(request, timeout=WIKIDATA_TIMEOUT_SECONDS) as response:
        return response.read().decode("utf-8")


def fetch_wikidata_leaders() -> dict[str, dict]:
    preferred_role_by_iso2 = fetch_preferred_role_by_iso2()
    params = urlencode({"query": WIKIDATA_LEADERS_QUERY})
    request = Request(
        f"{WIKIDATA_SPARQL_URL}?{params}",
        headers={
            "Accept": "application/sparql-results+json",
            "User-Agent": "world-outline-map-data-builder/1.0 (https://query.wikidata.org/)",
        },
    )

    with urlopen(request, timeout=WIKIDATA_TIMEOUT_SECONDS) as response:
        payload = json.load(response)

    bindings = payload.get("results", {}).get("bindings", [])
    leaders_by_iso2: dict[str, dict] = {}
    leaders_score_by_iso2: dict[str, int] = {}

    for row in bindings:
        iso2 = str(row.get("iso2", {}).get("value", "")).strip().upper()
        if len(iso2) != 2:
            continue

        hog_name = str(row.get("hogLabel", {}).get("value", "")).strip()
        hos_name = str(row.get("hosLabel", {}).get("value", "")).strip()
        hog_image = str(row.get("hogImage", {}).get("value", "")).strip()
        hos_image = str(row.get("hosImage", {}).get("value", "")).strip()

        preferred_role = preferred_role_by_iso2.get(iso2, "head_of_government")
        if preferred_role == "head_of_state":
            candidates = [
                ("head_of_state", hos_name, hos_image),
                ("head_of_government", hog_name, hog_image),
            ]
        else:
            candidates = [
                ("head_of_government", hog_name, hog_image),
                ("head_of_state", hos_name, hos_image),
            ]

        selected_name = ""
        selected_role = ""
        selected_image = ""
        selected_score = -1

        for candidate_role, candidate_name, candidate_image in candidates:
            if not candidate_name:
                continue

            is_preferred_role = candidate_role == preferred_role
            has_image = bool(candidate_image)
            if is_preferred_role and has_image:
                candidate_score = 3
            elif is_preferred_role and not has_image:
                candidate_score = 2
            elif not is_preferred_role and has_image:
                candidate_score = 1
            else:
                candidate_score = 0

            if candidate_score > selected_score:
                selected_name = candidate_name
                selected_role = candidate_role
                selected_image = candidate_image
                selected_score = candidate_score

        if not selected_name:
            continue

        if iso2 in leaders_score_by_iso2 and selected_score < leaders_score_by_iso2[iso2]:
            continue

        leaders_score_by_iso2[iso2] = selected_score
        leaders_by_iso2[iso2] = {
            "leaderName": selected_name,
            "leaderRole": selected_role,
            "leaderImageUrl": sanitize_leader_image_url(selected_image, width=48),
            "leaderSource": "wikidata",
        }

    return leaders_by_iso2


def fetch_preferred_role_by_iso2() -> dict[str, str]:
    params = urlencode({"query": WIKIDATA_GOV_FORMS_QUERY})
    request = Request(
        f"{WIKIDATA_SPARQL_URL}?{params}",
        headers={
            "Accept": "application/sparql-results+json",
            "User-Agent": "world-outline-map-data-builder/1.0 (https://query.wikidata.org/)",
        },
    )

    with urlopen(request, timeout=WIKIDATA_TIMEOUT_SECONDS) as response:
        payload = json.load(response)

    bindings = payload.get("results", {}).get("bindings", [])
    forms_by_iso2: dict[str, set[str]] = {}
    for row in bindings:
        iso2 = str(row.get("iso2", {}).get("value", "")).strip().upper()
        if len(iso2) != 2:
            continue

        form_label = str(row.get("govFormLabel", {}).get("value", "")).strip().lower()
        if not form_label:
            continue
        forms_by_iso2.setdefault(iso2, set()).add(form_label)

    preferred_role_by_iso2: dict[str, str] = {}
    for iso2, forms in forms_by_iso2.items():
        preferred_role_by_iso2[iso2] = infer_preferred_role(forms)

    return preferred_role_by_iso2


def infer_preferred_role(government_forms: set[str]) -> str:
    # Parliamentary / constitutional monarchy systems are usually PM-led.
    # Presidential and semi-presidential systems are usually president-led.
    forms = {f.strip().lower() for f in government_forms if f and f.strip()}

    if any("semi-presidential" in f for f in forms):
        return "head_of_state"
    if any("presidential" in f for f in forms):
        return "head_of_state"
    if any("parliamentary" in f for f in forms):
        return "head_of_government"
    if any("constitutional monarchy" in f for f in forms):
        return "head_of_government"

    return "head_of_government"


def to_thumbnail_url(raw_url: str, width: int = 48) -> str:
    if not raw_url:
        return ""

    normalized_url = raw_url.replace("http://", "https://", 1)
    url_parts = urlsplit(normalized_url)
    query_items = dict(parse_qsl(url_parts.query, keep_blank_values=True))
    query_items["width"] = str(width)
    new_query = urlencode(query_items)

    return urlunsplit((url_parts.scheme, url_parts.netloc, url_parts.path, new_query, url_parts.fragment))


def sanitize_leader_image_url(raw_url: str, width: int = 48) -> str:
    normalized_url = raw_url.replace("http://", "https://", 1).strip()
    if not normalized_url:
        return ""

    try:
        url_parts = urlsplit(normalized_url)
    except Exception:
        return ""

    if url_parts.scheme != "https":
        return ""
    if (url_parts.hostname or "").lower() not in ALLOWED_LEADER_IMAGE_HOSTS:
        return ""

    return to_thumbnail_url(normalized_url, width=width)


def parse_bridge(csv_text: str) -> tuple[dict[str, str], dict[str, str]]:
    rows = csv.DictReader(csv_text.splitlines())
    iso3_to_m49: dict[str, str] = {}
    iso3_to_iso2: dict[str, str] = {}

    alpha3_candidates = [
        "ISO3166-1-Alpha-3",
        "ISO3166-1-Alpha-3 Code",
        "ISO3166-1-Alpha-3-code",
    ]
    alpha2_candidates = [
        "ISO3166-1-Alpha-2",
        "ISO3166-1-Alpha-2 Code",
        "ISO3166-1-Alpha-2-code",
    ]
    m49_candidates = ["M49", "M49 Code"]

    for row in rows:
        iso3 = ""
        for key in alpha3_candidates:
            value = row.get(key, "").strip()
            if value:
                iso3 = value
                break

        m49_value = ""
        for key in m49_candidates:
            value = row.get(key, "").strip()
            if value:
                m49_value = value
                break

        iso2 = ""
        for key in alpha2_candidates:
            value = row.get(key, "").strip()
            if value:
                iso2 = value
                break

        if not iso3 or not m49_value:
            continue
        if not m49_value.isdigit():
            continue

        normalized_iso3 = iso3.upper()
        iso3_to_m49[normalized_iso3] = m49_value.zfill(3)
        if iso2 and len(iso2) == 2:
            iso3_to_iso2[normalized_iso3] = iso2.upper()

    return iso3_to_m49, iso3_to_iso2


def build_capitals_by_iso3(restcountries_payload) -> dict[str, dict]:
    capitals_by_iso3: dict[str, dict] = {}
    for row in restcountries_payload:
        iso3 = str(row.get("cca3", "")).strip().upper()
        if len(iso3) != 3:
            continue

        capital_name = ""
        capital_raw = row.get("capital")
        if isinstance(capital_raw, list) and capital_raw:
            capital_name = str(capital_raw[0]).strip()
        elif isinstance(capital_raw, str):
            capital_name = capital_raw.strip()

        capital_lat = None
        capital_lng = None
        latlng = (row.get("capitalInfo") or {}).get("latlng")
        if isinstance(latlng, list) and len(latlng) >= 2:
            try:
                capital_lat = float(latlng[0])
                capital_lng = float(latlng[1])
            except (TypeError, ValueError):
                capital_lat = None
                capital_lng = None

        capitals_by_iso3[iso3] = {
            "capital": capital_name,
            "capitalLat": capital_lat,
            "capitalLng": capital_lng,
        }

    return capitals_by_iso3


def build_population_snapshot() -> dict[str, dict]:
    countries_payload = fetch_json(WB_COUNTRIES_URL)
    populations_payload = fetch_json(WB_POPULATION_URL)
    flag_payload = fetch_json(FLAG_EMOJI_URL)
    restcountries_payload = fetch_json(RESTCOUNTRIES_URL)
    bridge_csv_text = fetch_text(M49_BRIDGE_URL)
    leaders_by_iso2 = fetch_wikidata_leaders()
    capitals_by_iso3 = build_capitals_by_iso3(restcountries_payload)

    countries = countries_payload[1]
    populations = populations_payload[1]
    iso3_to_m49, iso3_to_iso2 = parse_bridge(bridge_csv_text)

    iso3_country_names: dict[str, str] = {}
    non_aggregate_iso3: set[str] = set()
    for country in countries:
        iso3 = str(country.get("id", "")).upper().strip()
        region_name = str(country.get("region", {}).get("value", "")).strip()
        if len(iso3) != 3 or region_name == "Aggregates":
            continue
        non_aggregate_iso3.add(iso3)
        iso3_country_names[iso3] = str(country.get("name", "")).strip()

    latest_population_by_iso3: dict[str, dict] = {}
    for row in populations:
        iso3 = str(row.get("countryiso3code", "")).upper().strip()
        if iso3 not in non_aggregate_iso3:
            continue

        value = row.get("value")
        if value is None:
            continue
        population = int(value)
        if population <= 0:
            continue

        year_raw = row.get("date")
        try:
            year = int(year_raw)
        except (TypeError, ValueError):
            year = year_raw

        latest_population_by_iso3[iso3] = {
            "iso3": iso3,
            "name": iso3_country_names.get(iso3) or str(row.get("country", {}).get("value", "")).strip(),
            "population": population,
            "year": year,
        }

    population_by_country_id: dict[str, dict] = {}
    for iso3, record in latest_population_by_iso3.items():
        m49_code = iso3_to_m49.get(iso3)
        if not m49_code:
            continue
        iso2_code = iso3_to_iso2.get(iso3)
        flag_emoji = ""
        if iso2_code:
            flag_emoji = str((flag_payload.get(iso2_code) or {}).get("emoji", "")).strip()

        enriched_record = {
            **record,
            "iso2": iso2_code or "",
            "flagEmoji": flag_emoji,
            "capital": (capitals_by_iso3.get(iso3, {}) or {}).get("capital", ""),
            "capitalLat": (capitals_by_iso3.get(iso3, {}) or {}).get("capitalLat"),
            "capitalLng": (capitals_by_iso3.get(iso3, {}) or {}).get("capitalLng"),
            "leaderName": (leaders_by_iso2.get(iso2_code or "", {}) or {}).get("leaderName", ""),
            "leaderRole": (leaders_by_iso2.get(iso2_code or "", {}) or {}).get("leaderRole", ""),
            "leaderImageUrl": (leaders_by_iso2.get(iso2_code or "", {}) or {}).get("leaderImageUrl", ""),
            "leaderSource": (leaders_by_iso2.get(iso2_code or "", {}) or {}).get("leaderSource", ""),
        }
        population_by_country_id[m49_code] = enriched_record

    return dict(sorted(population_by_country_id.items()))


def main() -> None:
    try:
        snapshot = build_population_snapshot()
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_PATH.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(snapshot)} entries to {OUTPUT_PATH}")
    except Exception as exc:
        print(f"Failed to build population snapshot: {exc}")
        raise


if __name__ == "__main__":
    main()
