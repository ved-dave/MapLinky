/**
 * OpenStreetMap URL detector and link builder.
 */

/**
 * Returns true if the input looks like an OSM URL.
 */
export function isOsmUrl(input) {
  const s = input.trim();
  return (
    s.includes('openstreetmap.org') ||
    s.includes('osm.org')
  );
}

/**
 * Attempts to extract { lat, lng } from an OSM URL.
 * OSM uses #map=zoom/lat/lng
 */
export function extractOsmLatLng(url) {
  // #map=zoom/lat/lng
  const hashMatch = url.match(/#map=\d+\/(-?\d+\.?\d*)\/(-?\d+\.?\d*)/);
  if (hashMatch) {
    const lat = parseFloat(hashMatch[1]);
    const lng = parseFloat(hashMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // ?mlat=lat&mlon=lng
  const mlatMatch = url.match(/[?&]mlat=(-?\d+\.?\d*)/);
  const mlonMatch = url.match(/[?&]mlon=(-?\d+\.?\d*)/);
  if (mlatMatch && mlonMatch) {
    const lat = parseFloat(mlatMatch[1]);
    const lng = parseFloat(mlonMatch[1]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  return null;
}

/**
 * Builds an OSM link from lat/lng.
 */
export function buildOsmLink(lat, lng) {
  return `https://www.openstreetmap.org/#map=15/${lat}/${lng}`;
}

function isValidLatLng(lat, lng) {
  return (
    !isNaN(lat) && !isNaN(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}
