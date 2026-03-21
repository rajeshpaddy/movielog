#!/usr/bin/env python3

import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import csv
import html
import re
from collections import defaultdict
from io import StringIO
from pathlib import Path


NOMINATIONS_URL = "https://raw.githubusercontent.com/delventhalz/json-nominations/main/oscar-nominations.json"
SUPPLEMENTAL_RECENT_URL = "https://raw.githubusercontent.com/DLu/oscar_data/main/oscars.csv"
WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql"
OSCARS_CEREMONY_TEMPLATE = "https://www.oscars.org/oscars/ceremonies/{year}"
USER_AGENT = "movielog-oscar-explorer/1.0 (https://github.com/rajeshpaddy/movielog)"
CHUNK_SIZE = 140
REQUEST_PAUSE_SECONDS = 0.25
OFFICIAL_WINNER_RECORDS_2026 = [
    {"year": 2026, "category": "Actor in a Leading Role", "movieTitle": "Sinners", "nomineeCandidates": ["Michael B. Jordan"]},
    {"year": 2026, "category": "Actor in a Supporting Role", "movieTitle": "One Battle after Another", "nomineeCandidates": ["Sean Penn"]},
    {"year": 2026, "category": "Actress in a Leading Role", "movieTitle": "Hamnet", "nomineeCandidates": ["Jessie Buckley"]},
    {"year": 2026, "category": "Actress in a Supporting Role", "movieTitle": "Weapons", "nomineeCandidates": ["Amy Madigan"]},
    {"year": 2026, "category": "Animated Feature Film", "movieTitle": "KPop Demon Hunters", "nomineeCandidates": ["Chris Appelhans", "Maggie Kang", "Michelle L.M. Wong"]},
    {"year": 2026, "category": "Animated Short Film", "movieTitle": "The Girl Who Cried Pearls", "nomineeCandidates": ["Chris Lavis", "Maciek Szczerbowski"]},
    {"year": 2026, "category": "Casting", "movieTitle": "One Battle after Another", "nomineeCandidates": ["Cassandra Kulukundis"]},
    {"year": 2026, "category": "Cinematography", "movieTitle": "Sinners", "nomineeCandidates": ["Autumn Durald Arkapaw"]},
    {"year": 2026, "category": "Costume Design", "movieTitle": "Frankenstein", "nomineeCandidates": ["Kate Hawley"]},
    {"year": 2026, "category": "Directing", "movieTitle": "One Battle after Another", "nomineeCandidates": ["Paul Thomas Anderson"]},
    {"year": 2026, "category": "Documentary Feature Film", "movieTitle": "Mr. Nobody against Putin", "nomineeCandidates": ["Alzbeta Karaskova", "David Borenstein", "Helle Faber", "Pavel Talankin"]},
    {"year": 2026, "category": "Documentary Short Film", "movieTitle": "All the Empty Rooms", "nomineeCandidates": ["Conall Jones", "Joshua Seftel"]},
    {"year": 2026, "category": "Film Editing", "movieTitle": "One Battle after Another", "nomineeCandidates": ["Andy Jurgensen"]},
    {"year": 2026, "category": "International Feature Film", "movieTitle": "Sentimental Value", "nomineeCandidates": ["Sentimental Value"]},
    {"year": 2026, "category": "Live Action Short Film", "movieTitle": "The Singers", "nomineeCandidates": ["Alexandre Singh", "Jack Piatt", "Natalie Musteata", "Sam A. Davis"]},
    {"year": 2026, "category": "Makeup and Hairstyling", "movieTitle": "Frankenstein", "nomineeCandidates": ["Cliona Furey", "Jordan Samuel", "Mike Hill"]},
    {"year": 2026, "category": "Music (Original Score)", "movieTitle": "Sinners", "nomineeCandidates": ["Ludwig Goransson"]},
    {"year": 2026, "category": "Music (Original Song)", "movieTitle": "KPop Demon Hunters", "nomineeCandidates": ["EJAE", "Hee Dong Nam", "Jeong Hoon Seo", "Joong Gyu Kwak", "Mark Sonnenblick", "Teddy Park", "Yu Han Lee"]},
    {"year": 2026, "category": "Best Picture", "movieTitle": "One Battle after Another", "nomineeCandidates": ["Adam Somner", "Paul Thomas Anderson", "Sara Murphy"]},
    {"year": 2026, "category": "Production Design", "movieTitle": "Frankenstein", "nomineeCandidates": ["Tamara Deverell", "Shane Vieau"]},
    {"year": 2026, "category": "Sound", "movieTitle": "F1", "nomineeCandidates": ["Al Nelson", "Gareth John", "Gary A. Rizzo", "Gwendolyn Yates Whittle", "Juan Peralta"]},
    {"year": 2026, "category": "Visual Effects", "movieTitle": "Avatar: Fire and Ash", "nomineeCandidates": ["Daniel Barrett", "Eric Saindon", "Joe Letteri", "Richard Baneham"]},
    {"year": 2026, "category": "Writing (Adapted Screenplay)", "movieTitle": "One Battle after Another", "nomineeCandidates": ["Paul Thomas Anderson"]},
    {"year": 2026, "category": "Writing (Original Screenplay)", "movieTitle": "Sinners", "nomineeCandidates": ["Ryan Coogler"]},
]


def fetch_json(url):
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def fetch_text(url):
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "text/plain, text/csv, application/octet-stream;q=0.9, */*;q=0.8",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8")


def parse_ceremony_year(year_label):
    text = str(year_label).strip()
    if "/" not in text:
        return int(text[:4])
    left, right = text.split("/", 1)
    left = left.strip()
    right = right.strip()
    if len(right) == 2:
        century = left[:2]
        return int(f"{century}{right}")
    return int(right[:4])


def slugify(text):
    cleaned = []
    previous_dash = False
    for char in str(text).lower():
        if char.isalnum():
            cleaned.append(char)
            previous_dash = False
        elif not previous_dash:
            cleaned.append("-")
            previous_dash = True
    return "".join(cleaned).strip("-") or "item"


def compact_name_list(items):
    return sorted({value.strip() for value in items if str(value).strip()}, key=str.casefold)


def normalize_key(value):
    return re.sub(r"[^a-z0-9]+", "", str(value or "").casefold())


def build_recent_nominations_from_tsv(tsv_text, release_year_min=2023):
    reader = csv.DictReader(StringIO(tsv_text), delimiter="\t")
    entries = []

    for row in reader:
        year_value = str(row.get("Year") or "").strip()
        if not year_value.isdigit():
            continue

        release_year = int(year_value)
        if release_year < release_year_min:
            continue

        film = str(row.get("Film") or "").strip()
        if not film:
            continue

        nominee_name = str(row.get("Name") or "").strip()
        category = str(row.get("Category") or row.get("CanonicalCategory") or "").strip()
        if not category:
            continue

        imdb_id = str(row.get("FilmId") or "").strip()
        ceremony_year = release_year + 1
        entries.append(
            {
                "category": category,
                "year": str(ceremony_year),
                "nominees": compact_name_list([nominee_name]),
                "movies": [
                    {
                        "title": film,
                        "imdb_id": imdb_id or None,
                        "tmdb_id": None,
                    }
                ],
                "won": str(row.get("Winner") or "").strip().lower() == "true",
            }
        )

    return entries


def fetch_html(url):
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8")


def clean_html_text(value):
    text = html.unescape(re.sub(r"<.*?>", "", value or ""))
    return " ".join(text.replace("\xa0", " ").split())


def extract_name_candidates(raw_text):
    text = clean_html_text(raw_text)
    if not text:
        return []

    text = re.sub(r"^from\s+.+?;\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(
        r"^(music and lyric by|music by|lyric by|lyrics by|written by|screenplay by|adapted screenplay by|story by)\s+",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r",\s*producers?$", "", text, flags=re.IGNORECASE)
    text = text.replace("&", " and ")

    parts = []
    for segment in text.split(";"):
        for chunk in re.split(r",|\band\b", segment):
            value = " ".join(chunk.split()).strip()
            if value:
                parts.append(value)

    return compact_name_list(parts)


def extract_song_movie_title(entity_text):
    match = re.search(r"from\s+(.+?);", clean_html_text(entity_text), flags=re.IGNORECASE)
    return match.group(1).strip() if match else ""


def parse_official_winner_records(ceremony_html, ceremony_year):
    category_starts = [match.start() for match in re.finditer(r'<div data-term-id="\d+" class="paragraph paragraph--type--award-category', ceremony_html)]
    records = []

    for index, start in enumerate(category_starts):
        end = category_starts[index + 1] if index + 1 < len(category_starts) else len(ceremony_html)
        block = ceremony_html[start:end]
        category_match = re.search(r'field--name-field-award-category-oscars[^>]*>(.*?)</div>', block, flags=re.DOTALL)
        winner_match = re.search(
            r'field field--name-field-honoree-type winner">Winner</div>(.*?)<div class="field field--name-field-honoree-type nominee',
            block,
            flags=re.DOTALL,
        )
        if not category_match or not winner_match:
            continue

        category = clean_html_text(category_match.group(1))
        winner_block = winner_match.group(1)
        award_film_match = re.search(r'field field--name-field-award-film[^>]*>(.*?)</div>', winner_block, flags=re.DOTALL)
        entity_matches = re.findall(r'<div class="field__item">(.*?)</div>', winner_block, flags=re.DOTALL)

        award_film = clean_html_text(award_film_match.group(1)) if award_film_match else ""
        entities = [clean_html_text(entity) for entity in entity_matches if clean_html_text(entity)]

        movie_title = award_film
        if category == "International Feature Film":
            movie_title = entities[0] if entities else award_film
        elif category == "Music (Original Song)":
            movie_title = ""
            for entity in entities:
                movie_title = extract_song_movie_title(entity)
                if movie_title:
                    break
            movie_title = movie_title or award_film

        records.append(
            {
                "year": ceremony_year,
                "category": category,
                "movieTitle": movie_title,
                "nomineeCandidates": compact_name_list(
                    candidate
                    for entity in entities
                    for candidate in extract_name_candidates(entity)
                ),
            }
        )

    return records


def apply_official_winner_records(nominations, winner_records):
    winners_by_key = {(str(record["year"]), record["category"]): record for record in winner_records}
    grouped_entries = defaultdict(list)
    for entry in nominations:
        grouped_entries[(str(entry.get("year", "")), str(entry.get("category", "")).strip())].append(entry)

    for key, record in winners_by_key.items():
        entries = grouped_entries.get(key, [])
        if not entries:
            continue

        movie_key = normalize_key(record.get("movieTitle"))
        nominee_keys = {normalize_key(value) for value in record.get("nomineeCandidates", []) if normalize_key(value)}

        for entry in entries:
            entry["won"] = False

        matched_entries = []
        movie_matched_entries = []
        nominee_matched_entries = []

        for entry in entries:
            entry_movie_keys = {
                normalize_key(movie.get("title"))
                for movie in entry.get("movies", [])
                if normalize_key(movie.get("title"))
            }
            entry_nominee_keys = {
                normalize_key(nominee)
                for nominee in entry.get("nominees", [])
                if normalize_key(nominee)
            }
            movie_matches = bool(movie_key and movie_key in entry_movie_keys)
            nominee_matches = bool(nominee_keys and nominee_keys.intersection(entry_nominee_keys))

            if movie_matches:
                movie_matched_entries.append(entry)
            if nominee_matches:
                nominee_matched_entries.append(entry)
            if movie_matches and nominee_matches:
                matched_entries.append(entry)

        if not matched_entries and nominee_matched_entries:
            matched_entries = nominee_matched_entries

        if not matched_entries and movie_matched_entries:
            matched_entries = movie_matched_entries[:1] if len(movie_matched_entries) > 1 else movie_matched_entries

        for entry in matched_entries:
            entry["won"] = True

    return nominations


def build_movie_records(nominations):
    movies = {}
    for entry in nominations:
        if not entry.get("movies"):
            continue

        year_label = entry["year"]
        ceremony_year = parse_ceremony_year(year_label)
        category = str(entry["category"]).strip()
        nominees = compact_name_list(entry.get("nominees", []))
        won = bool(entry.get("won"))

        for movie in entry["movies"]:
            title = str(movie.get("title") or "").strip()
            if not title:
                continue

            imdb_id = str(movie.get("imdb_id") or "").strip()
            movie_id = imdb_id or f"{slugify(title)}-{ceremony_year}"
            record = movies.setdefault(
                movie_id,
                {
                    "id": movie_id,
                    "title": title,
                    "imdbId": imdb_id or None,
                    "tmdbId": movie.get("tmdb_id"),
                    "oscarYears": set(),
                    "yearLabels": set(),
                    "categories": set(),
                    "nominatedPeople": set(),
                    "nominationCount": 0,
                    "winCount": 0,
                    "awards": [],
                },
            )
            record["oscarYears"].add(ceremony_year)
            record["yearLabels"].add(year_label)
            record["categories"].add(category)
            record["nominatedPeople"].update(nominees)
            record["nominationCount"] += 1
            if won:
                record["winCount"] += 1
            record["awards"].append(
                {
                    "year": ceremony_year,
                    "yearLabel": year_label,
                    "category": category,
                    "won": won,
                    "nominees": nominees,
                }
            )

    serialized = []
    for movie in movies.values():
        movie["oscarYears"] = sorted(movie["oscarYears"])
        movie["yearLabels"] = sorted(movie["yearLabels"])
        movie["categories"] = sorted(movie["categories"])
        movie["nominatedPeople"] = compact_name_list(movie["nominatedPeople"])
        movie["awards"] = sorted(
            movie["awards"],
            key=lambda award: (award["year"], award["category"], not award["won"]),
        )
        serialized.append(movie)

    serialized.sort(key=lambda movie: (movie["oscarYears"][0], movie["title"].casefold()))
    return serialized


def chunks(values, size):
    for index in range(0, len(values), size):
        yield values[index:index + size]


def run_sparql(query, retries=4):
    payload = urllib.parse.urlencode({"format": "json", "query": query}).encode()
    request = urllib.request.Request(
        WIKIDATA_ENDPOINT,
        data=payload,
        method="POST",
        headers={
            "Accept": "application/sparql-results+json",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": USER_AGENT,
        },
    )

    last_error = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code not in {429, 500, 502, 503, 504}:
                raise
        except urllib.error.URLError as error:
            last_error = error

        time.sleep((attempt + 1) * 1.5)

    raise RuntimeError(f"SPARQL request failed after retries: {last_error}")


def build_basic_query(imdb_ids):
    values = " ".join(f'"{imdb_id}"' for imdb_id in imdb_ids)
    return f"""
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?imdb ?filmLabel
  (SAMPLE(?descriptionText) AS ?description)
  (MIN(?releaseDateRaw) AS ?releaseDate)
  (MAX(?durationMinutesRaw) AS ?durationMinutes)
  (GROUP_CONCAT(DISTINCT ?countryLabel; separator=" | ") AS ?countries)
WHERE {{
  VALUES ?imdb {{ {values} }}
  ?film wdt:P345 ?imdb.
  ?film rdfs:label ?filmLabel FILTER(LANG(?filmLabel) = "en")
  OPTIONAL {{ ?film schema:description ?descriptionText FILTER(LANG(?descriptionText) = "en") }}
  OPTIONAL {{ ?film wdt:P577 ?releaseDateRaw }}
  OPTIONAL {{ ?film wdt:P2047 ?durationMinutesRaw }}
  OPTIONAL {{
    ?film wdt:P495 ?country.
    ?country rdfs:label ?countryLabel FILTER(LANG(?countryLabel) = "en")
  }}
}}
GROUP BY ?imdb ?filmLabel
"""


def build_relation_query(imdb_ids, prop_code, source_name, target_name, alias):
    values = " ".join(f'"{imdb_id}"' for imdb_id in imdb_ids)
    return f"""
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?imdb (GROUP_CONCAT(DISTINCT ?{target_name}Label; separator=" | ") AS ?{alias}) WHERE {{
  VALUES ?imdb {{ {values} }}
  ?film wdt:P345 ?imdb.
  OPTIONAL {{
    ?film wdt:{prop_code} ?{source_name}.
    ?{source_name} rdfs:label ?{target_name}Label FILTER(LANG(?{target_name}Label) = "en")
  }}
}}
GROUP BY ?imdb
"""


def enrich_movies(movies):
    movie_map = {movie["imdbId"]: movie for movie in movies if movie.get("imdbId")}
    imdb_ids = list(movie_map)
    total_chunks = math.ceil(len(imdb_ids) / CHUNK_SIZE)

    for index, imdb_chunk in enumerate(chunks(imdb_ids, CHUNK_SIZE), start=1):
        print(f"Enriching chunk {index}/{total_chunks} ({len(imdb_chunk)} films)...", file=sys.stderr)

        basic_rows = run_sparql(build_basic_query(imdb_chunk))["results"]["bindings"]
        relation_specs = [
            ("P57", "director", "director", "directors"),
            ("P136", "genre", "genre", "genres"),
            ("P161", "cast", "cast", "cast"),
        ]

        relations = {}
        for prop_code, source_name, target_name, alias in relation_specs:
            response = run_sparql(build_relation_query(imdb_chunk, prop_code, source_name, target_name, alias))
            relations[alias] = {
                row["imdb"]["value"]: compact_name_list(row.get(alias, {}).get("value", "").split(" | "))
                for row in response["results"]["bindings"]
            }
            time.sleep(REQUEST_PAUSE_SECONDS)

        for row in basic_rows:
            imdb_id = row["imdb"]["value"]
            movie = movie_map.get(imdb_id)
            if not movie:
                continue

            movie["description"] = row.get("description", {}).get("value", "")
            movie["releaseDate"] = row.get("releaseDate", {}).get("value", "")[:10]
            duration_value = row.get("durationMinutes", {}).get("value")
            movie["runtimeMinutes"] = int(float(duration_value)) if duration_value else None
            movie["countries"] = compact_name_list(row.get("countries", {}).get("value", "").split(" | "))
            movie["directors"] = relations["directors"].get(imdb_id, [])
            movie["genres"] = relations["genres"].get(imdb_id, [])
            movie["cast"] = relations["cast"].get(imdb_id, [])

        time.sleep(REQUEST_PAUSE_SECONDS)

    for movie in movies:
        movie.setdefault("description", "")
        movie.setdefault("releaseDate", "")
        movie.setdefault("runtimeMinutes", None)
        movie.setdefault("countries", [])
        movie.setdefault("directors", [])
        movie.setdefault("genres", [])
        movie.setdefault("cast", [])

    return movies


def build_indexes(movies):
    actors = defaultdict(list)
    directors = defaultdict(list)
    genres = defaultdict(list)
    years = defaultdict(list)
    movie_by_id = {movie["id"]: movie for movie in movies}

    for movie in movies:
        for actor in movie["cast"]:
            actors[actor].append(movie["id"])
        for director in movie["directors"]:
            directors[director].append(movie["id"])
        for genre in movie["genres"]:
            genres[genre].append(movie["id"])
        for year in movie["oscarYears"]:
            years[str(year)].append(movie["id"])

    def serialize(mapping, key_name):
        records = []
        for name, movie_ids in mapping.items():
            movie_ids = sorted(set(movie_ids))
            win_count = sum(1 for movie_id in movie_ids if movie_by_id[movie_id]["winCount"] > 0)
            records.append(
                {
                    key_name: name,
                    "movieIds": movie_ids,
                    "movieCount": len(movie_ids),
                    "winningMovieCount": win_count,
                }
            )
        records.sort(key=lambda item: (-item["movieCount"], item[key_name].casefold()))
        return records

    return {
        "actors": serialize(actors, "name"),
        "directors": serialize(directors, "name"),
        "genres": serialize(genres, "name"),
        "years": [
            {
                "year": year,
                "movieIds": sorted(set(movie_ids)),
                "movieCount": len(set(movie_ids)),
                "winningMovieCount": sum(1 for movie_id in set(movie_ids) if movie_by_id[movie_id]["winCount"] > 0),
            }
            for year, movie_ids in sorted(years.items(), key=lambda item: int(item[0]), reverse=True)
        ],
    }


def main():
    output_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("oscar-atlas-data.json")
    js_path = output_path.with_suffix(".js")
    nominations = fetch_json(NOMINATIONS_URL)
    supplemental_recent = build_recent_nominations_from_tsv(fetch_text(SUPPLEMENTAL_RECENT_URL))
    nominations = [entry for entry in nominations if parse_ceremony_year(entry["year"]) < 2024] + supplemental_recent
    try:
        official_2026_records = parse_official_winner_records(fetch_html(OSCARS_CEREMONY_TEMPLATE.format(year=2026)), 2026)
    except urllib.error.HTTPError:
        official_2026_records = OFFICIAL_WINNER_RECORDS_2026
    nominations = apply_official_winner_records(nominations, official_2026_records)
    movies = build_movie_records(nominations)
    print(f"Loaded {len(nominations)} nomination entries and {len(movies)} unique films.", file=sys.stderr)
    movies = enrich_movies(movies)
    indexes = build_indexes(movies)
    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sources": [
            NOMINATIONS_URL,
            SUPPLEMENTAL_RECENT_URL,
            OSCARS_CEREMONY_TEMPLATE.format(year=2026),
            "https://query.wikidata.org/",
        ],
        "stats": {
            "movieCount": len(movies),
            "winningMovieCount": sum(1 for movie in movies if movie["winCount"] > 0),
            "actorCount": len(indexes["actors"]),
            "directorCount": len(indexes["directors"]),
            "genreCount": len(indexes["genres"]),
        },
        "movies": movies,
        "indexes": indexes,
    }
    payload_json = json.dumps(payload, separators=(",", ":"), ensure_ascii=True)
    output_path.write_text(payload_json, encoding="utf-8")
    js_path.write_text(f"window.OSCAR_ATLAS_DATA = {payload_json};\n", encoding="utf-8")
    print(f"Wrote {output_path}", file=sys.stderr)
    print(f"Wrote {js_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
