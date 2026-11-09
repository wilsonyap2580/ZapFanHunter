async function get(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const res = await fetch(`/api${path}${qs.toString() ? '?' + qs : ''}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
  return res.json();
}

export const api = {
  areas: () => get('/areas'),
  spots: (params) => get('/spots', params),
  spot: (id, params) => get(`/spots/${id}`, params),
  async addReview(id, review) {
    const res = await fetch(`/api/spots/${id}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(review),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not post your review');
    return data;
  },
};

export const km = (d) => (d == null ? '' : d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`);

export const mapsUrl = (s) =>
  `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}${s.placeId ? '&query_place_id=' + s.placeId : ''}`;
export const wazeUrl = (s) => `https://waze.com/ul?ll=${s.lat},${s.lng}&navigate=yes`;
export const directionsUrl = (s, from) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${s.lat},${s.lng}${s.placeId ? '&destination_place_id=' + s.placeId : ''}`;
