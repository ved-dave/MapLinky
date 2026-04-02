/**
 * Cloudflare Worker – Gemini API proxy.
 *
 * Deploy this file as a Cloudflare Worker and add the following secret:
 *   GEMINI_API_KEY  — your Google AI Studio key
 *
 * Rate limiting (20 req/IP/day) is handled via Cloudflare's built-in
 * rate limiting rules configured in the dashboard, but we also do a
 * lightweight in-memory check here as a secondary guard.
 */

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const SYSTEM_PROMPT = `You are a location resolution assistant. Your only job is to convert any location input into structured JSON.

Rules:
- Respond with valid JSON only. No prose, no markdown fences, no extra text.
- Accept any free-form location input: place names, addresses, landmarks, coordinates, or map URLs.
- Resolve the input to a precise latitude and longitude using your world knowledge.
- Normalize mailing addresses to: Street, City, State ZIP, Country.
- Strip apartment/unit numbers from coordinate lookup but preserve them in normalized_address.
- Keep place_summary to 2 sentences maximum — scannable at a glance.
- If the input is ambiguous, set confidence to "low" and populate clarification_needed with a short question.
- If the input is clearly not a location, return the error schema below.

Success schema:
{
  "lat": <number>,
  "lng": <number>,
  "place_name": <string>,
  "normalized_address": <string>,
  "place_summary": <string>,
  "input_type": "place_name" | "address" | "coordinates" | "url",
  "confidence": "high" | "low",
  "clarification_needed": <string | null>
}

Error schema:
{
  "error": true,
  "message": "Could not resolve this input to a location."
}`;

export default {
  async fetch(request, env) {
    // CORS pre-flight
    if (request.method === 'OPTIONS') {
      return corsResponse(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);

    if (request.method !== 'POST' || url.pathname !== '/resolve') {
      return corsResponse(new Response(JSON.stringify({ error: true, message: 'Not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }));
    }

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch {
      return corsResponse(jsonError('Invalid request body.', 400));
    }

    let input = (body.input || '').trim();
    if (!input) {
      return corsResponse(jsonError('Input is required.', 400));
    }

    if (input.length > 500) {
      return corsResponse(jsonError('Input is too long.', 400));
    }

    // Expand short links (goo.gl/maps, maps.app.goo.gl) so Gemini gets
    // the full URL with coordinates instead of an opaque short link.
    if (isAppleShortLink(input)) {
      return corsResponse(jsonError(
        'Apple short links don\'t include location data. Please share the full Apple Maps URL instead (tap Share → Copy Link in Apple Maps).',
        422
      ));
    }

    if (isShortLink(input)) {
      const expanded = await expandShortLink(input);
      console.log('Expanded URL:', expanded);
      if (!expanded) {
        return corsResponse(jsonError('Could not expand this short link. Please use the full map URL instead.', 422));
      }

      // Try to extract coords directly from the expanded URL
      const googleCoords = extractGoogleLatLng(expanded);
      if (googleCoords) {
        const enrichResult = googleCoords.place_name
          ? await callGemini(googleCoords.place_name, env)
          : null;
        const enriched = enrichResult?.data;
        return corsResponse(new Response(JSON.stringify({
          lat: googleCoords.lat,
          lng: googleCoords.lng,
          place_name: enriched?.place_name || googleCoords.place_name || '',
          normalized_address: enriched?.normalized_address || '',
          place_summary: enriched?.place_summary || '',
          input_type: 'url',
          confidence: 'high',
          clarification_needed: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }

      const appleCoords = extractAppleLatLng(expanded);
      if (appleCoords) {
        return corsResponse(new Response(JSON.stringify({
          lat: appleCoords.lat, lng: appleCoords.lng,
          place_name: appleCoords.place_name || '', normalized_address: appleCoords.normalized_address || '',
          place_summary: '', input_type: 'url', confidence: 'high', clarification_needed: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }

      // No coords in URL — fetch the page and extract from og:tags or JSON-LD
      const placeData = await extractFromPage(expanded);
      if (placeData) {
        return corsResponse(new Response(JSON.stringify({
          ...placeData, place_summary: '', input_type: 'url', confidence: 'high', clarification_needed: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }

      // Last resort — pass the expanded URL to Gemini
      input = expanded;
    }

    // Call Gemini
    const result = await callGemini(input, env);
    if (result.error) return corsResponse(jsonError(result.message, result.status));
    return corsResponse(new Response(JSON.stringify(result.data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  },
};

function isShortLink(input) {
  return input.includes('goo.gl/maps') || input.includes('maps.app.goo.gl');
}

function isAppleShortLink(input) {
  return input.includes('maps.apple/p/');
}

async function expandShortLink(shortUrl) {
  // Try HEAD first, fall back to GET (some servers ignore HEAD)
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(shortUrl, { method, redirect: 'follow' });
      console.log(`expandShortLink [${method}] ${shortUrl} → ${res.url} (${res.status})`);
      if (res.url && res.url !== shortUrl) return res.url;
    } catch (e) {
      console.error(`expandShortLink [${method}] failed:`, e.message);
    }
  }
  return null;
}

async function extractFromPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MapLinky/1.0)' },
    });
    const html = await res.text();

    // Try og:latitude / og:longitude meta tags
    const latMeta = html.match(/<meta[^>]+property="og:latitude"[^>]+content="(-?\d+\.?\d*)"/);
    const lngMeta = html.match(/<meta[^>]+property="og:longitude"[^>]+content="(-?\d+\.?\d*)"/);
    if (latMeta && lngMeta) {
      const lat = parseFloat(latMeta[1]);
      const lng = parseFloat(lngMeta[1]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        const nameMeta = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/);
        return { lat, lng, place_name: nameMeta ? nameMeta[1] : '', normalized_address: '' };
      }
    }

    // Try JSON-LD
    const jsonLdMatch = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
      const jsonLd = JSON.parse(jsonLdMatch[1]);
      const geo = jsonLd.geo || jsonLd?.location?.geo;
      if (geo?.latitude && geo?.longitude) {
        return {
          lat: parseFloat(geo.latitude),
          lng: parseFloat(geo.longitude),
          place_name: jsonLd.name || '',
          normalized_address: jsonLd.address ? formatAddress(jsonLd.address) : '',
        };
      }
    }
  } catch (e) {
    console.error('extractFromPage failed:', e.message);
  }
  return null;
}

function formatAddress(addr) {
  if (typeof addr === 'string') return addr;
  return [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode, addr.addressCountry]
    .filter(Boolean).join(', ');
}

function decodeUrl(url) {
  try { return decodeURIComponent(url); } catch { return url; }
}

function extractAppleLatLng(url) {
  const decoded = decodeUrl(url);
  const coordMatch = decoded.match(/[?&]coordinate=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      const result = { lat, lng };
      const nameMatch = decoded.match(/[?&]name=([^&]+)/);
      const addressMatch = decoded.match(/[?&]address=([^&]+)/);
      if (nameMatch) result.place_name = nameMatch[1].replace(/\+/g, ' ');
      if (addressMatch) result.normalized_address = addressMatch[1].replace(/\+/g, ' ');
      return result;
    }
  }
  const llMatch = decoded.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (llMatch) {
    const lat = parseFloat(llMatch[1]);
    const lng = parseFloat(llMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
  }
  return null;
}

function extractGoogleLatLng(url) {
  url = decodeUrl(url);
  const patterns = [
    // !3d<lat>!4d<lng> — exact pin coordinates in place URLs (most precise)
    [/!3d(-?\d+\.?\d*)/, /!4d(-?\d+\.?\d*)/],
    // q= is the pinned/searched location
    /[?&]q=(-?\d+\.?\d*)[,%2C]+(-?\d+\.?\d*)/,
    /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    // @ is the map view center (least precise)
    /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  ];
  for (const pattern of patterns) {
    let lat, lng;
    if (Array.isArray(pattern)) {
      const latMatch = url.match(pattern[0]);
      const lngMatch = url.match(pattern[1]);
      if (latMatch && lngMatch) { lat = parseFloat(latMatch[1]); lng = parseFloat(lngMatch[1]); }
    } else {
      const match = url.match(pattern);
      if (match) { lat = parseFloat(match[1]); lng = parseFloat(match[2]); }
    }
    if (lat !== undefined && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      const result = { lat, lng };
      const placeMatch = url.match(/\/maps\/place\/([^/@?]+)/);
      if (placeMatch) result.place_name = placeMatch[1].replace(/\+/g, ' ');
      return result;
    }
  }
  return null;
}

/**
 * Calls Gemini with the given input string.
 * Returns { data } on success or { error, message, status } on failure.
 */
async function callGemini(input, env) {
  const payload = {
    contents: [{ role: 'user', parts: [{ text: input }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  };

  let res;
  try {
    res = await fetch(`${GEMINI_ENDPOINT}?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return { error: true, message: 'Failed to reach the AI service.', status: 502 };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('Gemini error:', res.status, errText);
    if (res.status === 429) {
      let message = 'The service has run out of requests for today. Please try again later.';
      try {
        const errJson = JSON.parse(errText);
        if (errJson?.error?.message?.includes('spending cap')) {
          message = 'The service has reached its spending limit. Please try again later.';
        }
      } catch {}
      return { error: true, message, status: 429 };
    }
    if (res.status === 404) {
      console.error('Gemini model not found — update GEMINI_ENDPOINT in proxy.js');
      return { error: true, message: 'AI service is temporarily unavailable. Please try again later.', status: 502 };
    }
    return { error: true, message: 'AI service returned an error.', status: 502 };
  }

  let geminiData;
  try { geminiData = await res.json(); } catch {
    return { error: true, message: 'Unexpected response from AI service.', status: 502 };
  }

  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  try {
    return { data: JSON.parse(rawText) };
  } catch {
    return { error: true, message: 'Could not parse AI response.', status: 502 };
  }
}

function jsonError(message, status = 500) {
  return new Response(
    JSON.stringify({ error: true, message }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

function corsResponse(response) {
  const r = new Response(response.body, response);
  r.headers.set('Access-Control-Allow-Origin', '*');
  r.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  r.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return r;
}
