# MapLinky

Convert any location — a maps link, address, place name, or coordinates — into equivalent links for Google Maps, Apple Maps, and OpenStreetMap.

**Live at [maplinky.com](https://maplinky.com)**

---

## What it does

Paste anything into the input box:

- A Google Maps, Apple Maps, or OpenStreetMap URL (including short links)
- A place name like `Eiffel Tower` or `Gas Works Park`
- A mailing address like `523 Broadway E, Seattle, WA 98102`
- Raw coordinates like `47.6097, -122.3331`

MapLinky resolves it to precise coordinates, then instantly generates links for all three map platforms. It also displays a live map preview pinned to the location, and a place card with the name, address, and a short summary.

---

## Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS | No build step, instant load, easy to host anywhere |
| AI model | Gemini 2.5 Flash-Lite | Free tier, fast, excellent geographic knowledge |
| API proxy | Cloudflare Workers | Serverless edge function — keeps the API key off the client |
| Map preview | Leaflet.js | Lightweight, open source, uses OpenStreetMap tiles |
| Hosting | GitHub Pages | Free static hosting with custom domain support |
| DNS | GoDaddy | Custom domain |

**Total monthly cost: $0** (within free tier limits)

---

## Architecture

```
User input
    │
    ├── Recognised maps URL? ──► Parse lat/lng client-side (no AI call)
    │                                │
    │                                └── Has place name? ──► Enrich via Worker
    │
    └── Everything else ──────► POST /resolve (Cloudflare Worker)
                                        │
                                        └── Gemini 2.5 Flash-Lite
                                                │
                                                └── Structured JSON response
    │
    ▼
Build Google, Apple, OSM links from lat/lng
    │
    ▼
Render platform cards + Leaflet map + place card
```

### Client-side URL parsing

If the input is a recognised maps URL, coordinates are extracted entirely in JavaScript with no network call. This covers:

- **Google Maps** — extracts `!3d`/`!4d` pin coordinates (most precise), falling back to `?q=`, `?ll=`, and `@lat,lng`
- **Apple Maps** — extracts `coordinate=`, `?ll=`, and `?q=` parameters, plus place name and address when present
- **OpenStreetMap** — extracts `#map=zoom/lat/lng` and `?mlat=`/`?mlon=` parameters

After extracting coordinates, if a place name is available, a single Gemini call fetches the address and summary.

### Short link handling

Google short links (`maps.app.goo.gl`, `goo.gl/maps`) are expanded server-side in the Cloudflare Worker using a HEAD request to follow the redirect. The full URL is then parsed for coordinates and place name. Apple short links (`maps.apple/p/...`) do not carry location data after redirect and return a clear error asking the user for the full URL instead.

### AI layer (Cloudflare Worker + Gemini)

For any input that isn't a parseable URL — place names, addresses, landmarks, raw coordinates, ambiguous text — the frontend sends a POST request to the Cloudflare Worker, which:

1. Validates and sanitises the input
2. Forwards it to Gemini 2.5 Flash-Lite with a strict system prompt
3. Returns structured JSON only — no prose, no markdown

The system prompt instructs the model to:
- Resolve any location input to a precise lat/lng
- Normalise addresses to `Street, City, State ZIP, Country` format
- Return a 2-sentence place summary
- Signal low confidence with a `clarification_needed` field for ambiguous inputs
- Return a structured error object for non-location inputs

The API key is stored as a Cloudflare Worker secret and never touches the client.

### Link generation

Given `lat` and `lng`, all three output links are built in pure JavaScript:

```
Google:  https://maps.google.com/maps?q={lat},{lng}
Apple:   https://maps.apple.com/?ll={lat},{lng}
OSM:     https://www.openstreetmap.org/#map=15/{lat}/{lng}
```

---

## Why this setup

**AI only fires when it adds value.** Recognised map URLs are parsed client-side with zero AI cost. The model is only called when natural language resolution is genuinely needed, or to enrich a parsed URL with address and summary metadata.

**API key never exposed.** All Gemini calls are proxied through a Cloudflare Worker. The key is a Worker secret — it never appears in client-side code or the git history.

**No infrastructure to maintain.** The Worker runs serverless on Cloudflare's edge network. There is no server to provision, patch, or monitor.

**Fully decoupled.** The AI layer, URL parsers, link builders, and UI are independent modules. Swapping Gemini for a different model requires changing one line in `worker/proxy.js`.

**Zero cost at portfolio scale.** Gemini 2.5 Flash-Lite provides 1,500 free requests per day. Cloudflare Workers handles 100,000 free requests per day. GitHub Pages hosts the frontend for free.

---

## Project structure

```
maplinky/
├── index.html               # Single page shell
├── style.css                # Mobile-first responsive styles
├── app.js                   # Orchestrator: input → parse/AI → convert → render
├── platforms/
│   ├── google.js            # Google Maps URL detector + coordinate extractor + link builder
│   ├── apple.js             # Apple Maps URL detector + coordinate extractor + link builder
│   └── osm.js               # OSM URL detector + coordinate extractor + link builder
├── ai/
│   └── resolver.js          # Calls Worker proxy, handles errors and rate limits
├── ui/
│   ├── map-preview.js       # Leaflet.js map initialisation and update
│   └── place-card.js        # Place name, address, summary rendering
└── worker/
    └── proxy.js             # Cloudflare Worker: Gemini proxy, short link expansion, enrichment
```

---

## Deployment

### Frontend
Hosted on GitHub Pages. Every push to `main` triggers a GitHub Actions workflow that deploys the static files. Custom domain configured via a `CNAME` file and GoDaddy DNS A records pointing to GitHub's servers.

### Cloudflare Worker
Deployed with [Wrangler](https://developers.cloudflare.com/workers/wrangler/):

```bash
npm run deploy:worker
```

The Gemini API key is stored as a Worker secret:

```bash
npm run secret
```

---

## Local development

```bash
# Serve the frontend
npm run dev
# → http://localhost:8080

# Stream live Worker logs
npx wrangler tail --config worker/wrangler.toml
```

Point `ai/resolver.js` at `http://localhost:8787/resolve` and run the Worker locally with `npx wrangler dev worker/proxy.js` to develop fully offline.
