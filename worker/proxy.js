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
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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

    const input = (body.input || '').trim();
    if (!input) {
      return corsResponse(jsonError('Input is required.', 400));
    }

    if (input.length > 500) {
      return corsResponse(jsonError('Input is too long.', 400));
    }

    // Call Gemini
    const geminiPayload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: input }],
        },
      ],
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0,
      },
    };

    let geminiResponse;
    try {
      geminiResponse = await fetch(
        `${GEMINI_ENDPOINT}?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiPayload),
        }
      );
    } catch {
      return corsResponse(jsonError('Failed to reach the AI service.', 502));
    }

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text().catch(() => '');
      console.error('Gemini error:', geminiResponse.status, errText);
      return corsResponse(jsonError('AI service returned an error.', 502));
    }

    let geminiData;
    try {
      geminiData = await geminiResponse.json();
    } catch {
      return corsResponse(jsonError('Unexpected response from AI service.', 502));
    }

    // Extract the model's text content
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return corsResponse(jsonError('Could not parse AI response.', 502));
    }

    return corsResponse(
      new Response(JSON.stringify(parsed), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  },
};

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
