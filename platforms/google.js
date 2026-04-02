/**
 * Google Maps URL detector and link builder.
 */

const GOOGLE_PATTERNS = [
  // !3d<lat>!4d<lng> — exact pin coordinates in place URLs (most precise)
  [/!3d(-?\d+\.?\d*)/, /!4d(-?\d+\.?\d*)/],
  // q= is the pinned/searched location
  /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  // @ is the map view center (least precise)
  /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
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
 * Attempts to extract { lat, lng, place_name } from a Google Maps URL.
 * Returns null if extraction fails (e.g., short links).
 */
export function extractGoogleLatLng(url) {
  const decoded = decodeUrl(url);
  for (const pattern of GOOGLE_PATTERNS) {
    let lat, lng;
    if (Array.isArray(pattern)) {
      const latMatch = decoded.match(pattern[0]);
      const lngMatch = decoded.match(pattern[1]);
      if (latMatch && lngMatch) {
        lat = parseFloat(latMatch[1]);
        lng = parseFloat(lngMatch[1]);
      }
    } else {
      const match = decoded.match(pattern);
      if (match) {
        lat = parseFloat(match[1]);
        lng = parseFloat(match[2]);
      }
    }
    if (lat !== undefined && isValidLatLng(lat, lng)) {
      const result = { lat, lng };
      const placeMatch = decoded.match(/\/maps\/place\/([^/@?]+)/);
      if (placeMatch) {
        result.place_name = decodeUrl(placeMatch[1]).replace(/\+/g, ' ');
      }
      return result;
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

function decodeUrl(url) {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function isValidLatLng(lat, lng) {
  return (
    !isNaN(lat) && !isNaN(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}
