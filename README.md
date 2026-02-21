# World Outline Map

Static web app that renders a simple SVG world map using country outlines.

## Run Locally

From `/Users/neri/Desktop/world-outline-map` run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

## Keyboard Controls

- Press `A-Z` to add that initial-letter group to the map.
- Each new letter gets the next color in the palette (cycling through colors).
- Active groups stay visible together until reset.
- Active countries are labeled with black text and flag emoji when available.
- Active countries can show leader photo badges to the left of map labels when leader images are available.
- Active countries with known population show log-scaled circles sized from `log10(population)`.
- The side panel lists all highlighted countries and colors each name to match the map fill.
- The side panel shows exact population values (or `N/A`) and appends flag emoji after country names when available.
- Sidebar rows show leader name and role text, with thumbnail when available.
- Press `Space` to clear all highlights, circles, labels, and sidebar values.

## Project Structure

- `index.html` - page shell and SVG mount point
- `styles.css` - visual style and responsive layout
- `src/app.js` - app bootstrap (`initApp`) and data loading
- `src/mapRenderer.js` - world outline rendering (`renderWorldOutline`)
- `src/mapState.js` - state factory (`createMapState`)
- `src/config.js` - map config defaults
- `data/world-110m.topo.json` - local TopoJSON world boundaries
- `data/country-population.json` - population snapshot keyed by numeric country code (includes population, flags, and leader metadata)
- `scripts/build_population_data.py` - regenerates the population snapshot from source APIs

## Data Source and License

World boundary data is intended to come from the world-atlas project (Natural Earth-derived datasets). Verify the exact license terms for your chosen dataset copy before distribution.

Population data snapshot is built from:

- World Bank country metadata endpoint: `https://api.worldbank.org/v2/country?format=json&per_page=400`
- World Bank population indicator (`SP.POP.TOTL`, latest available per country): `https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&mrv=1&per_page=20000`
- UN M49 bridge dataset (ISO3 to numeric code): `https://raw.githubusercontent.com/datasets/country-codes/main/data/country-codes.csv`
- Flag emoji dataset (`ISO2 -> emoji`): `https://cdn.jsdelivr.net/npm/country-flag-emoji-json@2.0.0/dist/by-code.json`
- Wikidata leaders and images (head of government `P6`, head of state `P35`, image `P18`, form of government `P122`, ISO2 `P297`): `https://query.wikidata.org/`

Leader selection rule in the builder:

1. Infer preferred role from form of government (`P122`):
2. Parliamentary / constitutional monarchy -> prefer head of government.
3. Presidential / semi-presidential -> prefer head of state.
4. Then select by data completeness:
5. Preferred role with image.
6. Preferred role text-only.
7. Other role with image.
8. Other role text-only.

Some entities in the map may not have matching leader records or images; these display text-only without thumbnail.

To regenerate population data:

```bash
python3 scripts/build_population_data.py
```

## Next Phase (Interactivity)

Planned follow-up features:

- Hover highlighting
- Country selection
- Zoom and pan controls
- Tooltip/content overlays

The current code already includes:

- `state` object plumbing
- Stable `data-country-id` attributes on country paths
- Separate base and overlay render layers
- `bindMapEvents` keyboard behavior wiring
