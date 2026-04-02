/**
 * Apple Maps URL detector and link builder.
 */

export function isAppleMapsUrl(input) {
  const s = input.trim();
  return s.includes('maps.apple.com') || s.includes('maps.apple/p/');
}

export function isAppleShortLink(input) {
  return input.includes('maps.apple/p/');
}

/**
 * Attempts to extract { lat, lng, place_name, normalized_address } from an Apple Maps URL.
 */
export function extractAppleLatLng(url) {
  const decoded = decodeUrl(url);

  // maps.apple.com/place?coordinate=lat,lng&name=...&address=...
  const coordMatch = decoded.match(/[?&]coordinate=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (isValidLatLng(lat, lng)) {
      const result = { lat, lng };
      const nameMatch = decoded.match(/[?&]name=([^&]+)/);
      const addressMatch = decoded.match(/[?&]address=([^&]+)/);
      if (nameMatch) result.place_name = nameMatch[1].replace(/\+/g, ' ');
      if (addressMatch) result.normalized_address = addressMatch[1].replace(/\+/g, ' ');
      return result;
    }
  }

  // ?ll=lat,lng
  const llMatch = decoded.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (llMatch) {
    const lat = parseFloat(llMatch[1]);
    const lng = parseFloat(llMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // ?q=lat,lng
  const qMatch = decoded.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
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
