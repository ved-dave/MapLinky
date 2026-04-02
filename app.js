/**
 * app.js – Orchestrator
 *
 * Flow:
 *  1. User submits input
 *  2. Check if it's a recognisable maps URL → parse client-side
 *  3. Otherwise → call AI resolver
 *  4. Build all three output links
 *  5. Render results (links, map preview, place card)
 */

import { isGoogleMapsUrl, extractGoogleLatLng, buildGoogleLink } from './platforms/google.js';
import { isAppleMapsUrl, isAppleShortLink, extractAppleLatLng, buildAppleLink } from './platforms/apple.js';
import { isOsmUrl, extractOsmLatLng, buildOsmLink } from './platforms/osm.js';
import { resolveLocation } from './ai/resolver.js';
import { renderMap, destroyMap } from './ui/map-preview.js';
import { renderPlaceCard, hidePlaceCard } from './ui/place-card.js';

const MAP_CONTAINER_ID = 'map-preview';

// ─── DOM refs ────────────────────────────────────────────────────────────────

const form = document.getElementById('convert-form');
const inputEl = document.getElementById('location-input');
const inputTypeLabel = document.getElementById('input-type-label');
const resultsSection = document.getElementById('results');
const noticeEl = document.getElementById('notice');
const spinner = document.getElementById('spinner');

// ─── Form submit ─────────────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = inputEl.value.trim();
  if (!raw) return;
  await handleInput(raw);
});

// ─── Main handler ─────────────────────────────────────────────────────────────

async function handleInput(raw) {
  clearUI();
  showSpinner(true);

  try {
    const { coords, meta } = await resolveInput(raw);
    showSpinner(false);
    renderResults(coords, meta);
  } catch (err) {
    showSpinner(false);
    showError(err);
  }
}

/**
 * Tries client-side URL parsing first; falls back to AI.
 * Returns { coords: { lat, lng }, meta: { ... } }
 */
async function resolveInput(raw) {
  // ── Client-side URL detection ──────────────────────────────────────────────
  if (isGoogleMapsUrl(raw)) {
    // Short links can't be parsed client-side
    if (raw.includes('goo.gl') || raw.includes('maps.app.goo.gl')) {
      showNotice(
        'info',
        'Short links take a moment longer to resolve — sending to AI resolver…'
      );
      setInputTypeLabel('Google short link – resolving via AI…');
    } else {
      const parsed = extractGoogleLatLng(raw);
      if (parsed) {
        const { lat, lng, place_name } = parsed;
        setInputTypeLabel('Detected: Google Maps URL');
        if (place_name) {
          try {
            const enriched = await resolveLocation(place_name);
            return {
              coords: { lat, lng },
              meta: {
                place_name: enriched.place_name || place_name,
                normalized_address: enriched.normalized_address,
                place_summary: enriched.place_summary,
              },
            };
          } catch { /* enrichment failed — return coords with name only */ }
        }
        return { coords: { lat, lng }, meta: { place_name } };
      }
    }
  }

  if (isAppleMapsUrl(raw)) {
    if (isAppleShortLink(raw)) {
      throw Object.assign(
        new Error("Apple short links don't include location data. Please share the full Apple Maps URL instead (tap Share → Copy Link in Apple Maps)."),
        { code: 'NOT_FOUND' }
      );
    } else {
      const parsed = extractAppleLatLng(raw);
      if (parsed) {
        const { lat, lng, place_name, normalized_address } = parsed;
        setInputTypeLabel('Detected: Apple Maps URL');
        if (place_name) {
          try {
            const enriched = await resolveLocation(place_name);
            return {
              coords: { lat, lng },
              meta: {
                place_name: enriched.place_name || place_name,
                normalized_address: enriched.normalized_address || normalized_address,
                place_summary: enriched.place_summary,
              },
            };
          } catch { /* enrichment failed — return what we have */ }
        }
        return { coords: { lat, lng }, meta: { place_name, normalized_address } };
      }
    }
  }

  if (isOsmUrl(raw)) {
    const coords = extractOsmLatLng(raw);
    if (coords) {
      setInputTypeLabel('Detected: OpenStreetMap URL');
      return { coords, meta: {} };
    }
  }

  // ── AI resolver ────────────────────────────────────────────────────────────
  setInputTypeLabel('Resolving via AI…');
  const data = await resolveLocation(raw);

  setInputTypeLabel('Resolved via AI');

  if (data.confidence === 'low' && data.clarification_needed) {
    showNotice('warning', `Location may be ambiguous: ${data.clarification_needed}`);
  }

  return {
    coords: { lat: data.lat, lng: data.lng },
    meta: {
      place_name: data.place_name,
      normalized_address: data.normalized_address,
      place_summary: data.place_summary,
    },
  };
}

// ─── Render results ───────────────────────────────────────────────────────────

function renderResults({ lat, lng }, meta) {
  const googleUrl = buildGoogleLink(lat, lng);
  const appleUrl = buildAppleLink(lat, lng);
  const osmUrl = buildOsmLink(lat, lng);

  // Platform cards
  renderPlatformCard('google', googleUrl);
  renderPlatformCard('apple', appleUrl);
  renderPlatformCard('osm', osmUrl);

  // Map preview
  renderMap(MAP_CONTAINER_ID, lat, lng);

  // Place card (only if we have AI metadata)
  if (meta.place_name || meta.normalized_address || meta.place_summary) {
    renderPlaceCard(meta);
  } else {
    hidePlaceCard();
  }

  resultsSection.style.display = 'block';
}

function renderPlatformCard(platform, url) {
  const card = document.getElementById(`card-${platform}`);
  if (!card) return;

  const linkEl = card.querySelector('.card-link');
  const copyBtn = card.querySelector('.btn-copy');
  const openBtn = card.querySelector('.btn-open');

  if (linkEl) linkEl.textContent = truncateUrl(url);
  if (copyBtn) {
    copyBtn.onclick = () => copyToClipboard(url, copyBtn);
  }
  if (openBtn) {
    openBtn.href = url;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncateUrl(url) {
  return url.length > 50 ? url.slice(0, 47) + '…' : url;
}

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1500);
  } catch {
    // Fallback for browsers without clipboard API
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.classList.remove('copied');
    }, 1500);
  }
}

function setInputTypeLabel(text) {
  inputTypeLabel.textContent = text;
  inputTypeLabel.style.display = 'block';
}

function showNotice(type, message) {
  noticeEl.textContent = message;
  noticeEl.className = `notice notice--${type}`;
  noticeEl.style.display = 'block';
}

function showError(err) {
  const code = err.code;
  let message;

  message = err.message || 'Something went wrong. Please try again.';

  showNotice('error', message);
  hidePlaceCard();
  destroyMap(MAP_CONTAINER_ID);
}

function showSpinner(visible) {
  spinner.style.display = visible ? 'flex' : 'none';
}

function clearUI() {
  noticeEl.style.display = 'none';
  noticeEl.textContent = '';
  inputTypeLabel.style.display = 'none';
  resultsSection.style.display = 'none';
  hidePlaceCard();
}
