/**
 * AI resolver: calls the Cloudflare Worker proxy, which forwards to Gemini.
 *
 * Update WORKER_URL to your deployed Cloudflare Worker endpoint.
 */

const WORKER_URL = 'https://maplinky-proxy.maplinky.workers.dev/resolve';

/**
 * Resolves a free-form location input via the AI proxy.
 *
 * Returns a structured result object:
 * {
 *   lat, lng, place_name, normalized_address, place_summary,
 *   input_type, confidence, clarification_needed
 * }
 *
 * Throws an Error with a user-friendly message on failure.
 */
export async function resolveLocation(input) {
  let response;
  try {
    response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });
  } catch {
    throw new Error('Network error. Please check your connection and try again.');
  }

  if (response.status === 429) {
    throw Object.assign(
      new Error('You have reached the daily limit of location lookups. Please try again tomorrow.'),
      { code: 'RATE_LIMIT' }
    );
  }

  if (!response.ok) {
    throw new Error('Something went wrong on our end. Please try again shortly.');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Received an unexpected response. Please try again.');
  }

  if (data.error) {
    throw Object.assign(
      new Error(data.message || "We couldn't find that location. Try a full address or landmark name."),
      { code: 'NOT_FOUND' }
    );
  }

  if (typeof data.lat !== 'number' || typeof data.lng !== 'number') {
    throw new Error("We couldn't find that location. Try a full address or landmark name.");
  }

  return data;
}
