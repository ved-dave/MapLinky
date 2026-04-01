/**
 * Leaflet.js map preview.
 * Leaflet is loaded via CDN in index.html as window.L.
 */

let mapInstance = null;
let markerInstance = null;

/**
 * Initialises or updates the Leaflet map centred on lat/lng.
 * @param {string} containerId  - ID of the map container element
 * @param {number} lat
 * @param {number} lng
 */
export function renderMap(containerId, lat, lng) {
  if (!window.L) {
    console.warn('Leaflet not loaded — map preview unavailable.');
    return;
  }
  const container = document.getElementById(containerId);
  if (!container) return;

  // Make container visible before initialising Leaflet (it needs dimensions).
  container.style.display = 'block';

  if (!mapInstance) {
    mapInstance = window.L.map(containerId, { zoomControl: true }).setView([lat, lng], 15);

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapInstance);

    markerInstance = window.L.marker([lat, lng]).addTo(mapInstance);
  } else {
    mapInstance.setView([lat, lng], 15);
    markerInstance.setLatLng([lat, lng]);
  }

  // Force a resize in case the container was previously hidden.
  mapInstance.invalidateSize();
}

/**
 * Hides the map container and destroys the Leaflet instance so it can be
 * re-initialised cleanly next time.
 */
export function destroyMap(containerId) {
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
    markerInstance = null;
  }
  const container = document.getElementById(containerId);
  if (container) container.style.display = 'none';
}
