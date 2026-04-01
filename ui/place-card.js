/**
 * Place card renderer.
 * Populates the place-card section with name, address, and summary.
 */

/**
 * Renders the place card.
 * @param {object} data - Resolved location data from AI or client-side parse.
 *   { place_name, normalized_address, place_summary }
 */
export function renderPlaceCard(data) {
  const card = document.getElementById('place-card');
  if (!card) return;

  const nameEl = card.querySelector('.place-name');
  const addressEl = card.querySelector('.place-address');
  const summaryEl = card.querySelector('.place-summary');

  if (nameEl) nameEl.textContent = data.place_name || '';
  if (addressEl) addressEl.textContent = data.normalized_address || '';
  if (summaryEl) summaryEl.textContent = data.place_summary || '';

  // Only show fields that have content.
  if (nameEl) nameEl.style.display = data.place_name ? '' : 'none';
  if (addressEl) addressEl.style.display = data.normalized_address ? '' : 'none';
  if (summaryEl) summaryEl.style.display = data.place_summary ? '' : 'none';

  card.style.display = 'block';
}

/**
 * Hides the place card.
 */
export function hidePlaceCard() {
  const card = document.getElementById('place-card');
  if (card) card.style.display = 'none';
}
