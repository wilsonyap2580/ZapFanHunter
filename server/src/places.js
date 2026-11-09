// Live places, photos and reviews from Google Places API (New).
// Google's terms only allow keeping place IDs long term, so everything else is fetched
// live and held in a short in-memory cache. The API key never leaves the server.
import { formatTime, nowInMalaysia } from './hours.js';
import { db } from './db.js';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const base = () => (process.env.PLACES_API_BASE || 'https://places.googleapis.com/v1').replace(/\/$/, '');
const key = () => process.env.GOOGLE_MAPS_API_KEY || '';
export const placesEnabled = () => !!key();

export const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;
export const PHOTO_NAME_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

// Every Google search looks for Chinese mixed rice under each of these names (one call each).
// A typed search (area or shop) is added on to each.
const SEARCH_TERMS = ['chinese mixed rice', '杂饭', 'economy rice'];
export const TYPE_LABEL = 'Chinese Mixed Rice';

const SEARCH_FIELDS = [
  'id', 'displayName', 'shortFormattedAddress', 'formattedAddress', 'location', 'rating',
  'userRatingCount', 'regularOpeningHours', 'photos', 'businessStatus',
].map((f) => `places.${f}`).join(',');
const DETAIL_FIELDS = [
  'id', 'displayName', 'shortFormattedAddress', 'formattedAddress', 'location', 'rating', 'userRatingCount',
  'regularOpeningHours', 'currentOpeningHours', 'photos', 'reviews', 'googleMapsUri', 'businessStatus',
].join(',');

// ---- small TTL cache -------------------------------------------------------------
class TTLCache {
  constructor(ttlMs, max = 500) { this.ttl = ttlMs; this.max = max; this.map = new Map(); }
  get(k) {
    const e = this.map.get(k);
    if (!e) return undefined;
    if (e.exp < Date.now()) { this.map.delete(k); return undefined; }
    return e.v;
  }
  set(k, v) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);
    this.map.set(k, { v, exp: Date.now() + this.ttl });
    return v;
  }
  clear() { this.map.clear(); }
}
// Only photo names we have handed out can be fetched, so /api/photo can't be used to burn quota.
const knownPhotos = new TTLCache(24 * 3600e3, 5000);

// ---- saved Google results ------------------------------------------------------------
// Searches, place details and photo links are saved in SQLite and reused until they are
// older than PLACES_CACHE_HOURS (default 120 = 5 days), so opening the app doesn't call Google each time.
// If a refresh fails (daily limit, Google down), the older saved copy is used instead.
const parsedHours = Number.parseFloat(process.env.PLACES_CACHE_HOURS ?? '');
export const CACHE_HOURS = Number.isFinite(parsedHours) && parsedHours > 0 ? parsedHours : 120;
const CACHE_MS = CACHE_HOURS * 3600e3;

db.exec('CREATE TABLE IF NOT EXISTS places_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, fetched_at INTEGER NOT NULL)');
const readCache = db.prepare('SELECT value, fetched_at FROM places_cache WHERE key = ?');
const writeCache = db.prepare(`INSERT INTO places_cache (key, value, fetched_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`);

export function clearPlacesCache() { db.exec('DELETE FROM places_cache'); knownPhotos.clear(); }

// Share one in-flight request between concurrent callers with the same cache key.
const inflight = new Map();
async function cached(k, fn, stillGood) {
  const row = readCache.get(k);
  if (row && Date.now() - row.fetched_at < CACHE_MS) {
    const v = JSON.parse(row.value);
    if (!stillGood || await stillGood(v, row.fetched_at)) return v;
  }
  if (inflight.has(k)) return inflight.get(k);
  const p = fn()
    .then((v) => { if (!v?.dontSave) writeCache.run(k, JSON.stringify(v), Date.now()); return v; })
    .catch((e) => {
      if (!row || e.upstreamStatus === 404) throw e;
      console.warn(`Using saved copy of ${k.split('|')[0]} from ${new Date(row.fetched_at).toISOString()}: ${e.message}`);
      return JSON.parse(row.value);
    })
    .finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

// ---- daily call limit ----------------------------------------------------------------
// Hard cap on Google requests per calendar day (Malaysia time), counted in SQLite so a
// restart doesn't reset it. Cached results don't count. Set PLACES_DAILY_LIMIT to change it.
const parsedLimit = Number.parseInt(process.env.PLACES_DAILY_LIMIT ?? '', 10);
export const DAILY_LIMIT = Number.isFinite(parsedLimit) && parsedLimit >= 0 ? parsedLimit : 150;

db.exec('CREATE TABLE IF NOT EXISTS api_usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0)');
const usageDay = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const reserveCall = db.prepare(`INSERT INTO api_usage (day, calls) VALUES (?, 1)
  ON CONFLICT(day) DO UPDATE SET calls = calls + 1 WHERE calls < ?`);
const readUsage = db.prepare('SELECT calls FROM api_usage WHERE day = ?');

export function placesUsage() {
  const day = usageDay();
  return { day, used: readUsage.get(day)?.calls ?? 0, limit: DAILY_LIMIT };
}

async function call(path, { method = 'GET', fields, body } = {}) {
  // Reserve a slot before calling, so failed requests count too.
  if (DAILY_LIMIT === 0 || reserveCall.run(usageDay(), DAILY_LIMIT).changes === 0) {
    const err = new Error(`Daily limit of ${DAILY_LIMIT} Google Places calls reached`);
    err.dailyLimit = true;
    throw err;
  }
  const res = await fetch(base() + path, {
    method,
    headers: {
      'X-Goog-Api-Key': key(),
      ...(fields ? { 'X-Goog-FieldMask': fields } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Places API ${res.status}: ${detail.slice(0, 200)}`);
    err.upstreamStatus = res.status;
    throw err;
  }
  return res.json();
}

// ---- search ------------------------------------------------------------------------
/** Returns [{ place, types: string[] }] for places near lat/lng. */
// "Open now" is filtered by the caller from the weekly hours, not asked of Google,
// so one saved search serves both views and stays right as the day goes on.
export async function searchNearby({ lat, lng, radiusKm, q = '' }) {
  const radius = Math.min(Math.max(Number(radiusKm) || 5, 1), 50) * 1000;
  // Round to about 1 km so nearby users and small moves reuse the same saved search.
  const cLat = Math.round(lat * 100) / 100;
  const cLng = Math.round(lng * 100) / 100;
  // "v2": searches saved before weekly hours and photos were requested are ignored.
  const k = ['search-v2', cLat.toFixed(2), cLng.toFixed(2), radius, q.toLowerCase()].join('|');
  return cached(k, async () => {
    const settled = await Promise.allSettled(SEARCH_TERMS.map((term) =>
      call('/places:searchText', {
        method: 'POST',
        fields: SEARCH_FIELDS,
        body: {
          textQuery: q ? `${term} ${q}` : term,
          pageSize: 20,
          languageCode: 'en',
          regionCode: 'MY',
          locationBias: { circle: { center: { latitude: cLat, longitude: cLng }, radius } },
        },
      })));
    if (settled.every((s) => s.status === 'rejected')) throw settled[0].reason;
    // The same shop often matches more than one term; keep it once.
    const byId = new Map();
    for (const s of settled) {
      if (s.status !== 'fulfilled') continue;
      for (const place of s.value.places || []) {
        if (place.businessStatus === 'CLOSED_PERMANENTLY' || byId.has(place.id)) continue;
        byId.set(place.id, { place, types: [TYPE_LABEL] });
      }
    }
    const found = [...byId.values()];
    // If some keywords failed, show what we got but don't save it, so the next visit retries.
    if (settled.some((s) => s.status === 'rejected')) found.dontSave = true;
    return found;
  });
}

export function placeDetails(id) {
  return cached(`detail|${id}`, () => call(`/places/${encodeURIComponent(id)}`, { fields: DETAIL_FIELDS }));
}

/**
 * The copy of a place saved with an earlier search (name, address, hours, rating, photos),
 * for when its details can't be fetched from Google. Never calls Google. Returns null if
 * no saved search has it.
 */
const findInSearches = db.prepare(`SELECT value FROM places_cache
  WHERE key LIKE 'search-v2|%' AND instr(value, ?) > 0 ORDER BY fetched_at DESC LIMIT 1`);
export function savedSearchPlace(id) {
  const row = findInSearches.get(`"id":${JSON.stringify(id)}`);
  if (!row) return null;
  return JSON.parse(row.value).find((e) => e.place?.id === id)?.place || null;
}

export function isKnownPhoto(name) { return knownPhotos.get(name) === true; }

// Google's photo links can expire before our saved copy does. Links older than 12 hours are
// checked against Google's image server (free, not a Places API call) at most once an hour.
const linkChecked = new TTLCache(3600e3, 5000);
async function photoLinkWorks(uri, fetchedAt) {
  if (Date.now() - fetchedAt < 12 * 3600e3 || linkChecked.get(uri)) return true;
  try {
    const r = await fetch(uri, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    if (r.ok) linkChecked.set(uri, true);
    return r.ok;
  } catch {
    return true; // can't tell (offline?), keep using it
  }
}

export function photoUri(name, maxWidthPx) {
  return cached(`photo|${name}|${maxWidthPx}`, async () => {
    const r = await call(`/${name}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`);
    if (!r.photoUri) throw new Error('Places API returned no photoUri');
    return r.photoUri;
  }, photoLinkWorks);
}

// ---- shaping -----------------------------------------------------------------------
export function photoPath(name, w = 480) {
  knownPhotos.set(name, true);
  return `/api/photo?name=${encodeURIComponent(name)}&w=${w}`;
}

/**
 * Open/closed right now, worked out from the weekly hours each time (not Google's
 * "open now" flag), so a saved copy that is days old still shows the right status.
 */
const WEEK = 7 * 1440;
export function googleStatus(hours, now = new Date()) {
  const periods = hours?.periods || [];
  if (!periods.length) return { open: false, text: 'Hours not listed' };
  if (periods.some((p) => !p.close)) return { open: true, text: 'Open 24 hours' };
  const at = (t) => t.day * 1440 + t.hour * 60 + (t.minute || 0);
  const { day, minutes } = nowInMalaysia(now);
  const t = day * 1440 + minutes;
  let nextOpen = Infinity;
  for (const p of periods) {
    const start = at(p.open);
    let end = at(p.close);
    if (end <= start) end += WEEK; // closes after midnight on Saturday night
    for (const shift of [-WEEK, 0]) {
      if (t >= start + shift && t < end + shift) return { open: true, text: `Open until ${formatTime((end % WEEK) % 1440)}` };
    }
    nextOpen = Math.min(nextOpen, (start - t + WEEK) % WEEK);
  }
  const opens = t + nextOpen;
  const dayDiff = Math.floor(opens / 1440) - day;
  const openDay = Math.floor(opens / 1440) % 7;
  const when = dayDiff === 0 ? 'today' : dayDiff === 1 ? 'tomorrow' : DAY[openDay];
  return { open: false, text: `Closed, opens ${when} ${formatTime(opens % 1440)}` };
}

/** Mon..Sun rows in the same shape as weekTable() in hours.js. */
export function googleWeekTable(roh) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const periods = roh?.periods || [];
  if (!periods.length) return [];
  if (periods.some((p) => !p.close)) return order.map((d) => ({ day: DAY[d], dayIndex: d, hours: 'Open 24 hours' }));
  const ranges = Array.from({ length: 7 }, () => []);
  for (const p of periods) {
    ranges[p.open.day].push([p.open.hour * 60 + (p.open.minute || 0), p.close.hour * 60 + (p.close.minute || 0)]);
  }
  return order.map((d) => ({
    day: DAY[d],
    dayIndex: d,
    hours: ranges[d].length
      ? ranges[d].sort((a, b) => a[0] - b[0]).map(([o, c]) => `${formatTime(o)} – ${formatTime(c)}`).join(', ')
      : 'Closed',
  }));
}

function splitAddress(place) {
  const addr = place.shortFormattedAddress || place.formattedAddress || '';
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return { area: parts[0] || '', address: parts[0] || '' };
  return { area: parts[parts.length - 1], address: parts.slice(0, -1).join(', ') };
}

/** Card-sized summary, same shape as local spots. */
export function shapePlace(place, types = []) {
  const { area, address } = splitAddress(place);
  return {
    id: place.id,
    name: place.displayName?.text || 'Unnamed place',
    area,
    address,
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    rating: place.rating ?? 0,
    reviewCount: place.userRatingCount ?? 0,
    types,
    placeId: place.id,
    status: googleStatus(place.regularOpeningHours || place.currentOpeningHours),
    photo: place.photos?.[0] ? photoPath(place.photos[0].name, 480) : null,
    source: 'google',
  };
}

const attribution = (a) => a ? { name: a.displayName || '', uri: a.uri || '', photo: a.photoUri || '' } : null;

/** Photos, Google reviews, hours and Maps link for the details sheet. */
export function detailExtras(place) {
  return {
    photos: (place.photos || []).slice(0, 5).map((p) => ({
      url: photoPath(p.name, 1200),
      thumb: photoPath(p.name, 480),
      author: attribution(p.authorAttributions?.[0]),
    })),
    googleReviews: (place.reviews || []).slice(0, 5).map((r) => ({
      id: r.name,
      author: attribution(r.authorAttribution),
      stars: r.rating,
      when: r.relativePublishTimeDescription || '',
      text: r.text?.text || r.originalText?.text || '',
    })),
    googleMapsUri: place.googleMapsUri || '',
  };
}
