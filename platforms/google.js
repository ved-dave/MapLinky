/**
 * Google Maps URL detector and link builder.
 */

const GOOGLE_PATTERNS = [
  // @lat,lng,zoom
  /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  // ?q=lat,lng or ?q=lat%2Clng
  /[?&]q=(-?\d+\.?\d*)[,%2C]+(-?\d+\.?\d*)/,
  // /place/.../@lat,lng or ll=lat,lng
  /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
];

/**
 * Returns true if the input looks like a Google Maps URL.
 */
export function isGoogleMapsUrl(input) {
  const s = input.trim();
  return (
    s.includes('maps.google.com') ||
    s.includes('google.com/maps') ||
    s.includes('goo.gl/maps') ||
    s.includes('maps.app.goo.gl')
  );
}

/**
 * Attempts to extract { lat, lng } from a Google Maps URL.
 * Returns null if extraction fails (e.g., short links).
 */
export function extractGoogleLatLng(url) {
  for (const pattern of GOOGLE_PATTERNS) {
    const match = url.match(pattern);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (isValidLatLng(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

/**
 * Builds a Google Maps link from lat/lng.
 */
export function buildGoogleLink(lat, lng) {
  return `https://maps.google.com/maps?q=${lat},${lng}`;
}

function isValidLatLng(lat, lng) {
  return (
    !isNaN(lat) && !isNaN(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}
