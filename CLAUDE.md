# Map Link Converter – Project Specification

## Project Overview
A lightweight, cost-neutral web app that converts any location input (maps URLs, place names,
mailing addresses, or raw coordinates) into equivalent links for Google Maps, Apple Maps, and
OpenStreetMap. An AI layer handles natural language resolution and place enrichment; pure
JavaScript handles all link generation.

---

## User Flow
```
User pastes/types anything (URL, address, place name, coordinates)
       ↓
Client-side check: is this a recognizable maps URL?
       ├── YES → parse lat/lng directly in JS (no AI call)
       └── NO  → send to Cloudflare Worker proxy
                       ↓
               Gemini 2.0 Flash API
               returns structured JSON
       ↓
JS builds Google, Apple, OSM links from lat/lng
       ↓
UI renders:
  • Three map links with copy buttons
  • Leaflet.js map preview pinned to resolved coordinates
  • Place card (name, normalized address, 2-sentence summary)
```

---

## Project Structure
```
map-converter/
├── index.html               # Single page shell
├── style.css                # Minimal, mobile-first styling
├── app.js                   # Orchestrator: input → parse/AI → convert → render
├── platforms/
│   ├── google.js            # Google URL detector + link builder
│   ├── apple.js             # Apple URL detector + link builder
│   └── osm.js               # OSM URL detector + link builder
├── ai/
│   └── resolver.js          # Calls Worker proxy, parses JSON response, handles errors
├── ui/
│   ├── map-preview.js       # Leaflet.js map rendering
│   └── place-card.js        # Place name, address, summary card rendering
└── worker/
    └── proxy.js             # Cloudflare Worker: holds Gemini API key, rate limits, forwards requests
```

---

## Tech Stack

| Layer              | Technology                        | Cost                      |
|--------------------|-----------------------------------|---------------------------|
| Frontend           | Vanilla HTML/CSS/JS               | Free                      |
| AI model           | Gemini 2.0 Flash                  | Free (1,500 req/day)      |
| API proxy          | Cloudflare Worker                 | Free (100K req/day)       |
| Map preview        | Leaflet.js                        | Free                      |
| Hosting            | Cloudflare Pages or GitHub Pages  | Free                      |
| Domain             | Optional custom domain            | ~$10–15/yr (optional)     |

**Total monthly cost: $0**

---

## AI Layer

### Model
Gemini 2.0 Flash via Google AI Studio API

### When AI is Called
Only when input is NOT a recognizable maps URL. If a valid Google Maps, Apple Maps, or
OpenStreetMap URL is detected client-side, extract lat/lng directly in JS and skip the
AI call entirely.

### Single API Call Pattern
One request per user submission. The model returns structured JSON only — no prose,
no markdown fences.

### System Prompt Instructions
Instruct the model to:
- Accept any free-form location input (place name, address, landmark, coordinates, ambiguous text)
- Respond in valid JSON only — absolutely no prose or markdown
- Resolve place names and addresses to lat/lng using world knowledge
- Normalize mailing addresses to a standard format (Street, City, State ZIP, Country)
- Strip apartment/unit numbers from coordinate lookup but preserve them in `normalized_address`
- Keep `place_summary` to 2 sentences maximum — must be scannable at a glance
- Return `confidence: "low"` with a `clarification_needed` string when the location is ambiguous
- Return a structured error object when input is clearly not a location

### JSON Response Schema
```json
{
  "lat": 47.6097,
  "lng": -122.3331,
  "place_name": "Pike Place Market",
  "normalized_address": "85 Pike St, Seattle, WA 98101, USA",
  "place_summary": "A historic public market in Seattle overlooking Elliott Bay, known for its fish throwing tradition and local vendors.",
  "input_type": "place_name | address | coordinates | url",
  "confidence": "high | low",
  "clarification_needed": null
}
```

### Error Response Schema
```json
{
  "error": true,
  "message": "Could not resolve this input to a location."
}
```

---

## Client-Side URL Parser

Detect and parse these URL patterns in JS before any AI call:

| Platform       | Patterns to detect                                      |
|----------------|---------------------------------------------------------|
| Google Maps    | `maps.google.com`, `google.com/maps`, `@lat,lng,zoom`, `?q=lat,lng` |
| Apple Maps     | `maps.apple.com`, `?ll=lat,lng`, `?address=`            |
| OpenStreetMap  | `openstreetmap.org`, `#map=zoom/lat/lng`                |

If a recognizable URL is detected, extract lat/lng and skip the AI call. Generate a
place card summary only if lat/lng extraction succeeds — do not make a second AI call
for the summary in v1.

**Note:** Google short links (`goo.gl/maps/...`) cannot be parsed client-side. Treat
these as non-URL input and pass to the AI layer. Display a note in the UI that short
links may take a moment longer to resolve.

---

## Link Generation

Given `lat` and `lng`, always build all three output links:

```
Google:  https://maps.google.com/maps?q={lat},{lng}
Apple:   https://maps.apple.com/?ll={lat},{lng}
OSM:     https://www.openstreetmap.org/#map=15/{lat}/{lng}
```

Link generation is pure JS with no external dependencies.

---

## Cloudflare Worker (proxy.js)

The Worker acts as a secure proxy between the frontend and the Gemini API.
The Gemini API key is stored as a Cloudflare Worker secret — never in client-side code.

### Responsibilities
1. Receive POST request from frontend with user input string
2. Enforce rate limit: 20 requests per IP per day (use Cloudflare's built-in rate limiting)
3. Forward request to Gemini 2.0 Flash API with the system prompt
4. Return the raw JSON response to the frontend
5. Return structured error responses on failure

### Worker Endpoint
```
POST /resolve
Body: { "input": "<user input string>" }
Response: Gemini JSON schema as above
```

---

## Input Types Supported

| Input                  | Example                              | Handled by      |
|------------------------|--------------------------------------|-----------------|
| Google Maps URL        | `maps.google.com/maps?q=47.6,-122.3` | Client-side JS  |
| Apple Maps URL         | `maps.apple.com/?ll=47.6,-122.3`     | Client-side JS  |
| OSM URL                | `openstreetmap.org/#map=15/47.6/-122.3` | Client-side JS |
| Place name             | `Pike Place Market`                  | Gemini          |
| Landmark               | `Eiffel Tower`                       | Gemini          |
| Full mailing address   | `85 Pike St, Seattle, WA 98101`      | Gemini          |
| Partial address        | `Pike St, Seattle`                   | Gemini          |
| Raw coordinates        | `47.6097, -122.3331`                 | Gemini          |
| Ambiguous text         | `the coffee shop near my office`     | Gemini (low confidence) |

---

## UI Requirements

### Input
- Single prominent input box, full-width on mobile
- Placeholder text: "Paste a maps link, address, or place name"
- Subtle label below input showing detected input type once parsed
  e.g. "Detected: Google Maps URL" or "Resolved via AI"
- Submit button labeled "Convert"

### Output
- Three platform cards side by side (stacked on mobile), each showing:
  - Platform logo/icon
  - Truncated link text
  - "Copy" button (copies full URL to clipboard)
  - "Open" link that opens the map in a new tab
- Leaflet.js map preview centered on resolved coordinates with a pin marker
- Place card below the map showing:
  - Place name (bold)
  - Normalized address (muted text)
  - 2-sentence summary

### Error States
- Low confidence: yellow notice with `clarification_needed` text asking user to be more specific
- Unresolvable input: red notice with friendly message "We couldn't find that location. Try a full address or landmark name."
- Rate limit hit: notice explaining the daily limit has been reached
- API failure: generic fallback message, do not expose raw error to user

### General
- Mobile-first responsive layout
- No ads, no signup wall, no cookies, no tracking
- Fast — show a loading spinner while AI resolves, but client-side URL parsing should feel instant

---

## Cost Controls

1. **Client-side parsing first** — skip Gemini entirely for recognized maps URLs
2. **Rate limiting** — Cloudflare Worker caps at 20 AI requests per IP per day
3. **Free tier** — Google AI Studio provides 1,500 free Gemini 2.0 Flash requests/day
4. **Single AI call** — input resolution and place summary are returned in one request

Expected monthly AI cost: **$0**

---

## Deployment

### Frontend
Deploy to Cloudflare Pages or GitHub Pages. Static files only — no build step required.

### Cloudflare Worker
1. Create a new Worker in the Cloudflare dashboard
2. Store the Gemini API key as a Worker secret (not in code)
3. Deploy `worker/proxy.js`
4. Update `ai/resolver.js` in the frontend to point to the deployed Worker URL

### Environment Variables (Worker secrets)
```
GEMINI_API_KEY=<your Google AI Studio key>
```

---

## README Talking Points (for portfolio)

- **AI only fires when it adds value** — direct URL inputs are parsed client-side with zero AI cost
- **API key never exposed** — proxied through a Cloudflare Worker; secrets stay server-side
- **Fully decoupled architecture** — swap Gemini for any model without touching converter logic
- **Zero infrastructure cost** — serverless edge worker + static frontend = $0/month at portfolio scale
- **Handles natural language** — users can type anything from a full address to a landmark name
