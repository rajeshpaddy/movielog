# Oscar Atlas Data Pipeline

This folder contains the tooling used to generate the local Oscar Atlas movie archive.

## One-command rebuild

From the repo root, run:

```bash
./build-oscar-atlas
```

That command regenerates:

- `oscar-atlas-data.json`
- `oscar-atlas-data.js`

## Main generator

The archive is built by:

```bash
python3 tools/build_oscar_explorer_data.py oscar-atlas-data.json
```

## Data sources

The generator pulls from:

- Oscar nominations JSON:
  `https://raw.githubusercontent.com/delventhalz/json-nominations/main/oscar-nominations.json`
- Recent Oscar dataset:
  `https://raw.githubusercontent.com/DLu/oscar_data/main/oscars.csv`
- Wikidata:
  `https://query.wikidata.org/`

## What the script does

It:

1. Loads Oscar nomination and winner records.
2. Extends newer ceremony coverage through 2026 using the supplemental recent dataset.
3. Groups nominations into unique movie records.
4. Enriches films with release date, runtime, countries, directors, genres, and cast from Wikidata.
5. Writes both JSON output and a browser-ready JS wrapper used by `oscar-atlas.html`.

## Notes

- Rebuilds require network access because the source data is fetched live.
- `tools/__pycache__/` is local Python cache and should not be committed.
- If the source datasets change upstream, generated counts and metadata may change on the next rebuild.
