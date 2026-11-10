// The ZapFan API as an Express app. index.js runs it locally; api/index.js runs it on Vercel.
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { openSync, readSync, closeSync, unlink } from 'node:fs';
import { ready, all, one, run, UPLOADS_DIR, UPLOADS_ENABLED } from './db.js';
import { parseHours, openStatus, weekTable } from './hours.js';
import {
  placesEnabled, placesUsage, TYPE_LABEL, savedSearchPlace, searchNearby, placeDetails, photoUri, isKnownPhoto,
  shapePlace, detailExtras, googleWeekTable, PLACE_ID_RE, PHOTO_NAME_RE,
  findCandidates, candidatePlace, saveAddedPlace, addedPlaces,
} from './places.js';
import { voterId, withinDailyLimit, attachDeals, dealsForSpot, parseDeal, addDeal, voteDeal, sameDealId } from './deals.js';

const app = express();
export default app;

// On Vercel the client's IP comes from its proxy headers (used to tell voters apart).
app.set('trust proxy', !!process.env.VERCEL);
const DAILY_ADDS = 5; // shops or deals one person can add per day

app.use(cors());
app.use(express.json({ limit: '32kb' }));

// Express 4 doesn't catch rejected promises, so async routes go through this.
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

// Make sure the tables exist (and the saved list is seeded) before any API request.
app.use('/api', ah(async (_req, _res, next) => { await ready(); next(); }));

// Default centre when the user hasn't shared their location: KL city centre.
const KL = { lat: 3.139, lng: 101.687 };
const SHOW_SAMPLES = process.env.NODE_ENV !== 'production';
const MAX_RADIUS_KM = 10;

function distanceKm(a, b) {
  const r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const roundKm = (from, p) => (from && Number.isFinite(p.lat) ? Math.round(distanceKm(from, p) * 100) / 100 : null);

function shape(row, from) {
  const week = parseHours(row.hours);
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    rating: row.rating,
    reviewCount: row.review_count,
    types: [TYPE_LABEL],
    placeId: row.place_id,
    status: openStatus(week),
    distanceKm: from ? roundKm(from, row) : null,
    photo: null,
    source: 'local',
    _week: week,
  };
}

const num = (v) => (v === undefined || v === '' ? NaN : Number(v));
function centerFrom(query) {
  const lat = num(query.lat);
  const lng = num(query.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : KL;
}

const sortSpots = (spots, sort) => spots.sort(sort === 'rating'
  ? (a, b) => b.rating - a.rating || a.distanceKm - b.distanceKm
  : (a, b) => (b.status.open - a.status.open) || a.distanceKm - b.distanceKm);
const strip = ({ _week, ...s }) => s;

// Diner notes for a saved spot and/or a Google place.
async function notesFor({ spotId = -1, placeId = '' }) {
  const rows = await all(`SELECT id, author, stars, body, photo, is_sample, created_at FROM reviews
    WHERE (spot_id = ? OR place_id = ?) AND (is_sample = 0 OR ?)
    ORDER BY created_at DESC, id DESC`, [spotId, placeId || '', SHOW_SAMPLES ? 1 : 0]);
  return rows.map(shapeNote);
}
const shapeNote = (r) => ({
  id: r.id,
  author: r.author,
  stars: r.stars,
  body: r.body,
  photo: r.photo ? `/uploads/${r.photo}` : null,
  sample: !!r.is_sample,
  createdAt: r.created_at,
});

app.get('/api/health', ah(async (_req, res) => {
  res.json({ ok: true, live: placesEnabled(), uploads: UPLOADS_ENABLED, googleCalls: await placesUsage() });
}));

// The saved list also has Malay nasi campur stalls; the app only shows Chinese mixed rice.
const CHINESE_ONLY = "types NOT LIKE '%Nasi Campur%'";

// Areas with a rough centre, for the area chips.
app.get('/api/areas', ah(async (_req, res) => {
  res.json(await all(`SELECT area AS name, COUNT(*) AS count, AVG(lat) AS lat, AVG(lng) AS lng FROM spots
    WHERE ${CHINESE_ONLY} GROUP BY area ORDER BY count DESC, area`));
}));

// Saved spots from the saved list (numbers) and from Google (place IDs).
async function spotsByIds(ids, from) {
  const results = await Promise.allSettled(ids.map(async (id) => {
    if (/^\d+$/.test(id)) {
      const row = await one('SELECT * FROM spots WHERE id = ?', [Number(id)]);
      return row ? strip(shape(row, from)) : null;
    }
    if (!placesEnabled() || !PLACE_ID_RE.test(id)) return null;
    let place;
    try {
      place = await placeDetails(id);
    } catch (e) {
      place = e.upstreamStatus === 404 ? null : await savedSearchPlace(id);
      if (!place) throw e;
    }
    const s = shapePlace(place);
    return { ...s, distanceKm: roundKm(from, s) };
  }));
  return results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
}

async function localSpots({ from, radius, q, area, openOnly, sort }) {
  const where = [CHINESE_ONLY];
  const args = [];
  if (area) { where.push('area = ?'); args.push(area); }
  if (q) {
    // Escape LIKE wildcards so "%" and "_" in a search match literally.
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push("(lower(name) LIKE ? ESCAPE '\\' OR lower(area) LIKE ? ESCAPE '\\' OR lower(address) LIKE ? ESCAPE '\\')");
    args.push(like, like, like);
  }
  let spots = (await all(`SELECT * FROM spots WHERE ${where.join(' AND ')}`, args)).map((r) => shape(r, from));
  // Searching by name or area looks everywhere; radius only applies to "near me" browsing.
  if (Number.isFinite(radius) && radius > 0 && !q && !area) spots = spots.filter((s) => s.distanceKm <= radius);
  if (openOnly) spots = spots.filter((s) => s.status.open);
  return sortSpots(spots, sort).map(strip);
}

// Where a search looks: around an area chip's centre (5 km), otherwise around the user.
async function searchArea({ from, radius, area }) {
  if (area) {
    const c = await one('SELECT AVG(lat) AS lat, AVG(lng) AS lng FROM spots WHERE area = ?', [area]);
    if (c?.lat != null) return { around: { lat: c.lat, lng: c.lng }, within: 5 };
  }
  return { around: from, within: Number.isFinite(radius) && radius > 0 ? radius : 5 };
}

// Shops users added because search missed them, matching the same name or area search.
async function addedSpots({ from, q, openOnly }, { around, within }) {
  let rows;
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    rows = await all("SELECT place_id FROM added_places WHERE lower(name) LIKE ? ESCAPE '\\'", [like]);
  } else {
    // Rough box first, exact distance below.
    const d = within / 100;
    rows = await all('SELECT place_id FROM added_places WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?',
      [around.lat - d, around.lat + d, around.lng - d, around.lng + d]);
  }
  let spots = (await addedPlaces(rows.map((r) => r.place_id))).map((p) => {
    const s = shapePlace(p, [TYPE_LABEL]);
    return { ...s, distanceKm: roundKm(from, s), _around: roundKm(around, s) };
  });
  if (!q) spots = spots.filter((s) => s._around != null && s._around <= within);
  if (openOnly) spots = spots.filter((s) => s.status.open);
  return spots.map(({ _around, ...s }) => s);
}

/** First list wins; later lists only add shops (by Google place ID) not already in it. */
function mergeSpots(first, ...more) {
  const seen = new Set(first.map((s) => s.placeId).filter(Boolean));
  const out = [...first];
  for (const s of more.flat()) {
    if (s.placeId && seen.has(s.placeId)) continue;
    if (s.placeId) seen.add(s.placeId);
    out.push(s);
  }
  return out;
}

async function liveSpots(opts) {
  const { from, q, openOnly, sort } = opts;
  const { around, within } = await searchArea(opts);
  const found = await searchNearby({ lat: around.lat, lng: around.lng, radiusKm: within, q });
  let spots = found.map(({ place, types }) => {
    const s = shapePlace(place, types);
    return { ...s, distanceKm: roundKm(from, s), _around: roundKm(around, s) };
  });
  // Google's location bias is soft, so trim to the radius unless the user is searching by name.
  if (!q) spots = spots.filter((s) => s._around != null && s._around <= within * 1.1);
  if (openOnly) spots = spots.filter((s) => s.status.open);
  spots = spots.map(({ _around, ...s }) => s);
  // Google doesn't always return every shop, so add the saved list and user-added shops it missed.
  const [local, added] = await Promise.all([localSpots(opts), addedSpots(opts, { around, within })]);
  return sortSpots(mergeSpots(spots, added, local), sort);
}

// Without Google: the saved list plus user-added shops.
async function offlineSpots(opts) {
  const [local, added] = await Promise.all([localSpots(opts), addedSpots(opts, await searchArea(opts))]);
  return sortSpots(mergeSpots(local, added), opts.sort);
}

// Adds night deals to each card; with deals=1, keeps only spots that have one (on now first).
async function withDeals(spots, dealsOnly) {
  let out = await attachDeals(spots);
  if (dealsOnly) {
    out = out.filter((s) => s.deal)
      .sort((a, b) => (b.deal.status.active - a.deal.status.active) || (a.deal.status.startsIn ?? 0) - (b.deal.status.startsIn ?? 0));
  }
  return out;
}

// GET /api/spots?lat=&lng=&radius=km&q=&area=&open=1&sort=distance|rating&ids=1,ChIJ...
app.get('/api/spots', ah(async (req, res) => {
  const from = centerFrom(req.query);
  const opts = {
    from,
    radius: Math.min(num(req.query.radius), MAX_RADIUS_KM),
    q: String(req.query.q || '').trim().toLowerCase(),
    area: String(req.query.area || '').trim(),
    openOnly: req.query.open === '1' || req.query.open === 'true',
    sort: req.query.sort === 'rating' ? 'rating' : 'distance',
  };
  const dealsOnly = req.query.deals === '1' || req.query.deals === 'true';
  const send = async (spots, extra) => {
    const out = await withDeals(spots, dealsOnly);
    res.json({ center: from, count: out.length, spots: out, ...extra });
  };

  if (req.query.ids !== undefined) {
    const ids = String(req.query.ids).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    return send(sortSpots(await spotsByIds(ids, from), 'distance'), { source: placesEnabled() ? 'google' : 'local' });
  }

  if (placesEnabled()) {
    let spots;
    try {
      spots = await liveSpots(opts);
    } catch (e) {
      console.warn(`Live search failed, using the saved list instead: ${e.message}`);
      return send(await offlineSpots(opts), { source: 'local', fallback: true });
    }
    return send(spots, { source: 'google' });
  }
  return send(await offlineSpots(opts), { source: 'local' });
}));

app.get('/api/spots/:id', ah(async (req, res) => {
  const from = centerFrom(req.query);
  const id = req.params.id;

  if (/^\d+$/.test(id)) {
    const row = await one('SELECT * FROM spots WHERE id = ?', [Number(id)]);
    if (!row) return res.status(404).json({ error: 'Spot not found' });
    const { _week, ...spot } = shape(row, from);
    let extras = { photos: [], googleReviews: [], googleMapsUri: '' };
    if (placesEnabled() && row.place_id) {
      try { extras = detailExtras(await placeDetails(row.place_id)); } catch (e) { console.warn(`Photos for ${row.name} unavailable: ${e.message}`); }
    }
    return res.json({
      ...spot, photo: extras.photos[0]?.thumb || null, hours: weekTable(_week), ...extras,
      reviews: await notesFor({ spotId: row.id, placeId: row.place_id }), deals: await dealsForSpot(spot),
    });
  }

  if (!placesEnabled() || !PLACE_ID_RE.test(id)) return res.status(404).json({ error: 'Spot not found' });
  let place;
  try {
    place = await placeDetails(id);
  } catch (e) {
    if (e.upstreamStatus === 400 || e.upstreamStatus === 404) return res.status(404).json({ error: 'Spot not found' });
    // Fall back to what the card showed, saved with an earlier search.
    const saved = await savedSearchPlace(id);
    if (saved) {
      const s = shapePlace(saved);
      return res.json({
        ...s,
        distanceKm: roundKm(from, s),
        hours: googleWeekTable(saved.regularOpeningHours),
        photos: s.photo ? [{ url: s.photo, thumb: s.photo, author: null }] : [],
        googleReviews: [],
        googleMapsUri: '',
        reviews: await notesFor({ placeId: id }),
        deals: await dealsForSpot(s),
        limited: e.dailyLimit ? 'daily-limit' : 'unavailable',
      });
    }
    if (e.dailyLimit) return res.status(429).json({ error: "Today's Google lookups are used up. Try again tomorrow." });
    console.warn(`Place details failed: ${e.message}`);
    return res.status(502).json({ error: "Couldn't load this place from Google right now. Try again in a moment." });
  }
  const s = shapePlace(place);
  res.json({
    ...s,
    distanceKm: roundKm(from, s),
    hours: googleWeekTable(place.regularOpeningHours),
    ...detailExtras(place),
    reviews: await notesFor({ placeId: place.id }),
    deals: await dealsForSpot(s),
  });
}));

// ---- Add a missing shop -------------------------------------------------------------
// GET /api/candidates?q=shop name&lat=&lng= -> up to 5 eateries from Google to pick from.
app.get('/api/candidates', ah(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 2) return res.status(400).json({ error: 'Type at least 2 letters of the shop name.' });
  if (!placesEnabled()) return res.status(503).json({ error: 'Adding shops needs Google Maps, which is off on this server.' });
  const from = centerFrom(req.query);
  try {
    const list = await findCandidates(q, from.lat, from.lng);
    const known = new Set((await all(`SELECT place_id FROM spots WHERE place_id IS NOT NULL
      UNION SELECT place_id FROM added_places`)).map((r) => r.place_id));
    res.json(list.map((p) => {
      const s = shapePlace(p);
      return { placeId: s.placeId, name: s.name, address: [s.address, s.area].filter(Boolean).join(', '), distanceKm: roundKm(from, s), added: known.has(s.placeId) };
    }));
  } catch (e) {
    if (e.dailyLimit) return res.status(429).json({ error: "Today's Google lookups are used up. Try again tomorrow." });
    throw e;
  }
}));

// POST /api/added-places { placeId } -> adds a shop picked from /api/candidates.
app.post('/api/added-places', ah(async (req, res) => {
  const placeId = String(req.body?.placeId || '');
  const place = PLACE_ID_RE.test(placeId) ? await candidatePlace(placeId) : null;
  if (!place) return res.status(400).json({ error: 'Search for the shop first, then pick it from the list.' });
  const voter = voterId(req);
  const exists = await one('SELECT 1 AS y FROM added_places WHERE place_id = ?', [placeId]);
  if (!exists) {
    if (!(await withinDailyLimit('add-shop', voter, DAILY_ADDS))) {
      return res.status(429).json({ error: `You can add up to ${DAILY_ADDS} shops a day. Thanks for helping!` });
    }
    await saveAddedPlace(place);
    await run('INSERT OR IGNORE INTO added_places (place_id, name, lat, lng, added_at, voter) VALUES (?, ?, ?, ?, ?, ?)',
      [place.id, place.displayName?.text || '', place.location?.latitude, place.location?.longitude, Date.now(), voter]);
  }
  const s = shapePlace(place, [TYPE_LABEL]);
  res.status(exists ? 200 : 201).json({ ...s, distanceKm: roundKm(centerFrom(req.body || {}), s) });
}));

// ---- Night deals ------------------------------------------------------------------------
// POST /api/spots/:id/deals { text, days: "12345", start: "20:00", end: "22:00" }
app.post('/api/spots/:id/deals', ah(async (req, res) => {
  const target = await noteTarget(req.params.id);
  if (!target) return res.status(404).json({ error: 'Spot not found' });
  const deal = parseDeal(req.body);
  if (deal.error) return res.status(400).json({ error: deal.error });
  const voter = voterId(req);
  const same = await sameDealId(target, deal);
  if (same) return res.json({ ...(await voteDeal(same, 'confirm', voter)), existing: true });
  if (!(await withinDailyLimit('add-deal', voter, DAILY_ADDS))) {
    return res.status(429).json({ error: `You can post up to ${DAILY_ADDS} deals a day.` });
  }
  res.status(201).json(await addDeal(target, deal, voter));
}));

// POST /api/deals/:id/confirm ("Still on") and /api/deals/:id/report ("Not anymore").
app.post('/api/deals/:id/:kind(confirm|report)', ah(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Deal not found' });
  const deal = await voteDeal(Number(req.params.id), req.params.kind, voterId(req));
  if (!deal) return res.status(404).json({ error: 'Deal not found' });
  res.json(deal);
}));

// Photo uploads for diner notes (off on Vercel, which can't keep files: notes are text only there).
const PHOTO_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = UPLOADS_ENABLED
  ? multer({
    storage: multer.diskStorage({
      destination: UPLOADS_DIR,
      filename: (_req, file, cb) => cb(null, randomUUID() + PHOTO_EXT[file.mimetype]),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 },
    fileFilter: (_req, file, cb) => (PHOTO_EXT[file.mimetype]
      ? cb(null, true)
      : cb(httpError(400, 'Photo must be a JPEG, PNG or WebP image.'))),
  }).single('photo')
  : multer({ limits: { fields: 10, files: 0 } }).none();

// The browser decides the declared type, so check the file really is an image.
function looksLikeImage(path) {
  const b = Buffer.alloc(12);
  const fd = openSync(path, 'r');
  try { readSync(fd, b, 0, 12, 0); } finally { closeSync(fd); }
  return (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    || b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    || (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP');
}
const discard = (file) => file?.path && unlink(file.path, () => {});

async function noteTarget(id) {
  if (/^\d+$/.test(id)) {
    const row = await one('SELECT id, place_id FROM spots WHERE id = ?', [Number(id)]);
    return row ? { spotId: row.id, placeId: row.place_id } : null;
  }
  if (!PLACE_ID_RE.test(id)) return null;
  const local = await one('SELECT id FROM spots WHERE place_id = ?', [id]);
  if (local) return { spotId: local.id, placeId: id };
  if (!placesEnabled()) return null;
  try {
    await placeDetails(id); // confirms the place exists (usually cached from opening it)
  } catch (e) {
    if (e.upstreamStatus === 400 || e.upstreamStatus === 404) return null;
    if (!(await savedSearchPlace(id))) throw e; // a saved search already confirms it exists
  }
  return { spotId: null, placeId: id };
}

app.post('/api/spots/:id/reviews', upload, ah(async (req, res) => {
  try {
    const target = await noteTarget(req.params.id);
    if (!target) { discard(req.file); return res.status(404).json({ error: 'Spot not found' }); }
    const author = String(req.body?.author || '').trim().slice(0, 40);
    const body = String(req.body?.body || '').trim().slice(0, 600);
    const stars = Math.round(Number(req.body?.stars));
    if (!author || !body || !(stars >= 1 && stars <= 5)) {
      discard(req.file);
      return res.status(400).json({ error: 'Please add your name, a short note and 1 to 5 stars.' });
    }
    if (req.file && !looksLikeImage(req.file.path)) {
      discard(req.file);
      return res.status(400).json({ error: 'Photo must be a JPEG, PNG or WebP image.' });
    }
    const { lastId } = await run('INSERT INTO reviews (spot_id, place_id, author, stars, body, photo) VALUES (?, ?, ?, ?, ?, ?)',
      [target.spotId, target.placeId, author, stars, body, req.file ? req.file.filename : null]);
    const row = await one('SELECT id, author, stars, body, photo, is_sample, created_at FROM reviews WHERE id = ?', [lastId]);
    res.status(201).json(shapeNote(row));
  } catch (e) {
    discard(req.file);
    throw e;
  }
}));

// Google photos: the browser asks us, we redirect to a Google URL. The key stays here.
app.get('/api/photo', ah(async (req, res) => {
  const name = String(req.query.name || '');
  if (!placesEnabled() || !PHOTO_NAME_RE.test(name) || !(await isKnownPhoto(name))) return res.status(404).json({ error: 'Photo not found' });
  const w = Math.min(Math.max(Math.round(num(req.query.w)) || 480, 100), 1600);
  try {
    const uri = await photoUri(name, w);
    res.set('Cache-Control', 'private, max-age=1800');
    res.redirect(302, uri);
  } catch (e) {
    if (e.dailyLimit) return res.status(429).json({ error: "Today's Google photo lookups are used up." });
    console.warn(`Photo failed: ${e.message}`);
    res.status(502).json({ error: "Couldn't load this photo from Google right now." });
  }
}));

// Diner photos.
if (UPLOADS_ENABLED) {
  app.use('/uploads', express.static(UPLOADS_DIR, {
    index: false,
    setHeaders: (res) => res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400' }),
  }));
}
app.use('/uploads', (_req, res) => res.status(404).end());

// Unknown API routes get a JSON 404 rather than Express's HTML page.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Errors on API routes (bad JSON, bad uploads, server errors) come back as JSON too.
app.use('/api', (err, req, res, next) => {
  discard(req.file);
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError) {
    if (!UPLOADS_ENABLED && ['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(err.code)) return res.status(400).json({ error: 'Photo uploads are turned off on this site. Post your note without a photo.' });
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be 5 MB or smaller.' : 'Photo upload failed. Attach one image only.' });
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const message = status === 400 && err.type === 'entity.parse.failed'
    ? 'Request body is not valid JSON.'
    : status >= 500 ? 'Something went wrong.' : err.expose ? err.message : 'Bad request.';
  res.status(status).json({ error: message });
});
