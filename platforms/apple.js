/**
 * Apple Maps URL detector and link builder.
 */

/**
 * Returns true if the input looks like an Apple Maps URL.
 */
export function isAppleMapsUrl(input) {
  const s = input.trim();
  return s.includes('maps.apple.com');
}

/**
 * Attempts to extract { lat, lng } from an Apple Maps URL.
 * Apple Maps uses ?ll=lat,lng
 */
export function extractAppleLatLng(url) {
  const llMatch = url.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (llMatch) {
    const lat = parseFloat(llMatch[1]);
    const lng = parseFloat(llMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // Also try ?q=lat,lng
  const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  return null;
}

/**
 * Builds an Apple Maps link from lat/lng.
 */
export function buildAppleLink(lat, lng) {
  return `https://maps.apple.com/?ll=${lat},${lng}`;
}

function isValidLatLng(lat, lng) {
  return (
    !isNaN(lat) && !isNaN(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}
