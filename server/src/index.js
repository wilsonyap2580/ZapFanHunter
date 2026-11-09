import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { existsSync, openSync, readSync, closeSync, unlink } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, UPLOADS_DIR } from './db.js';
import { seedIfEmpty } from './seed.js';
import { parseHours, openStatus, weekTable } from './hours.js';
import {
  placesEnabled, placesUsage, TYPE_LABEL, savedSearchPlace, searchNearby, placeDetails, photoUri, isKnownPhoto,
  shapePlace, detailExtras, googleWeekTable, PLACE_ID_RE, PHOTO_NAME_RE,
} from './places.js';

seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json({ limit: '32kb' }));

// Default centre when the user hasn't shared their location: KL city centre.
const KL = { lat: 3.139, lng: 101.687 };
const SHOW_SAMPLES = process.env.NODE_ENV !== 'production';

// Express 4 doesn't catch rejected promises, so async routes go through this.
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

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
function notesFor({ spotId = -1, placeId = '' }) {
  return db
    .prepare(`SELECT id, author, stars, body, photo, is_sample, created_at FROM reviews
              WHERE (spot_id = ? OR place_id = ?) AND (is_sample = 0 OR ?)
              ORDER BY created_at DESC, id DESC`)
    .all(spotId, placeId || '', SHOW_SAMPLES ? 1 : 0)
    .map(shapeNote);
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

app.get('/api/health', (_req, res) => res.json({ ok: true, live: placesEnabled(), googleCalls: placesUsage() }));

// The saved list also has Malay nasi campur stalls; the app only shows Chinese mixed rice.
const CHINESE_ONLY = "types NOT LIKE '%Nasi Campur%'";

// Areas with a rough centre, for the area chips.
app.get('/api/areas', (_req, res) => {
  const rows = db
    .prepare(`SELECT area AS name, COUNT(*) AS count, AVG(lat) AS lat, AVG(lng) AS lng FROM spots
              WHERE ${CHINESE_ONLY} GROUP BY area ORDER BY count DESC, area`)
    .all();
  res.json(rows);
});

// Saved spots from the saved list (numbers) and from Google (place IDs).
async function spotsByIds(ids, from) {
  const results = await Promise.allSettled(ids.map(async (id) => {
    if (/^\d+$/.test(id)) {
      const row = db.prepare('SELECT * FROM spots WHERE id = ?').get(Number(id));
      return row ? strip(shape(row, from)) : null;
    }
    if (!placesEnabled() || !PLACE_ID_RE.test(id)) return null;
    let place;
    try {
      place = await placeDetails(id);
    } catch (e) {
      place = e.upstreamStatus === 404 ? null : savedSearchPlace(id);
      if (!place) throw e;
    }
    const s = shapePlace(place);
    return { ...s, distanceKm: roundKm(from, s) };
  }));
  return results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
}

function localSpots({ from, radius, q, area, openOnly, sort }) {
  let sql = 'SELECT * FROM spots';
  const where = [CHINESE_ONLY];
  const args = [];
  if (area) { where.push('area = ?'); args.push(area); }
  if (q) {
    // Escape LIKE wildcards so "%" and "_" in a search match literally.
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push("(lower(name) LIKE ? ESCAPE '\\' OR lower(area) LIKE ? ESCAPE '\\' OR lower(address) LIKE ? ESCAPE '\\')");
    args.push(like, like, like);
  }
  sql += ' WHERE ' + where.join(' AND ');

  let spots = db.prepare(sql).all(...args).map((r) => shape(r, from));
  // Searching by name or area looks everywhere; radius only applies to "near me" browsing.
  if (Number.isFinite(radius) && radius > 0 && !q && !area) spots = spots.filter((s) => s.distanceKm <= radius);
  if (openOnly) spots = spots.filter((s) => s.status.open);
  return sortSpots(spots, sort).map(strip);
}

async function liveSpots({ from, radius, q, area, openOnly, sort }) {
  // An area chip searches around that area's centre; otherwise around the user.
  let around = from;
  let within = Number.isFinite(radius) && radius > 0 ? radius : 5;
  if (area) {
    const c = db.prepare('SELECT AVG(lat) AS lat, AVG(lng) AS lng FROM spots WHERE area = ?').get(area);
    if (c?.lat != null) { around = { lat: c.lat, lng: c.lng }; within = 5; }
  }
  const found = await searchNearby({ lat: around.lat, lng: around.lng, radiusKm: within, q });
  let spots = found.map(({ place, types }) => {
    const s = shapePlace(place, types);
    return { ...s, distanceKm: roundKm(from, s), _around: roundKm(around, s) };
  });
  // Google's location bias is soft, so trim to the radius unless the user is searching by name.
  if (!q) spots = spots.filter((s) => s._around != null && s._around <= within * 1.1);
  if (openOnly) spots = spots.filter((s) => s.status.open);
  return sortSpots(spots, sort).map(({ _around, ...s }) => s);
}

const MAX_RADIUS_KM = 10;

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

  if (req.query.ids !== undefined) {
    const ids = String(req.query.ids).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    const spots = sortSpots(await spotsByIds(ids, from), 'distance');
    return res.json({ center: from, count: spots.length, spots, source: placesEnabled() ? 'google' : 'local' });
  }

  if (placesEnabled()) {
    try {
      const spots = await liveSpots(opts);
      return res.json({ center: from, count: spots.length, spots, source: 'google' });
    } catch (e) {
      console.warn(`Live search failed, using the saved list instead: ${e.message}`);
      const spots = localSpots(opts);
      return res.json({ center: from, count: spots.length, spots, source: 'local', fallback: true });
    }
  }
  const spots = localSpots(opts);
  res.json({ center: from, count: spots.length, spots, source: 'local' });
}));

app.get('/api/spots/:id', ah(async (req, res) => {
  const from = centerFrom(req.query);
  const id = req.params.id;

  if (/^\d+$/.test(id)) {
    const row = db.prepare('SELECT * FROM spots WHERE id = ?').get(Number(id));
    if (!row) return res.status(404).json({ error: 'Spot not found' });
    const { _week, ...spot } = shape(row, from);
    let extras = { photos: [], googleReviews: [], googleMapsUri: '' };
    if (placesEnabled() && row.place_id) {
      try { extras = detailExtras(await placeDetails(row.place_id)); } catch (e) { console.warn(`Photos for ${row.name} unavailable: ${e.message}`); }
    }
    return res.json({ ...spot, photo: extras.photos[0]?.thumb || null, hours: weekTable(_week), ...extras, reviews: notesFor({ spotId: row.id, placeId: row.place_id }) });
  }

  if (!placesEnabled() || !PLACE_ID_RE.test(id)) return res.status(404).json({ error: 'Spot not found' });
  let place;
  try {
    place = await placeDetails(id);
  } catch (e) {
    if (e.upstreamStatus === 400 || e.upstreamStatus === 404) return res.status(404).json({ error: 'Spot not found' });
    // Fall back to what the card showed, saved with an earlier search.
    const saved = savedSearchPlace(id);
    if (saved) {
      const s = shapePlace(saved);
      const first = saved.photos?.[0];
      return res.json({
        ...s,
        distanceKm: roundKm(from, s),
        hours: googleWeekTable(saved.regularOpeningHours),
        photos: first ? [{ url: s.photo, thumb: s.photo, author: null }] : [],
        googleReviews: [],
        googleMapsUri: '',
        reviews: notesFor({ placeId: id }),
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
    reviews: notesFor({ placeId: place.id }),
  });
}));

// Photo uploads for diner notes.
const PHOTO_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => cb(null, randomUUID() + PHOTO_EXT[file.mimetype]),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (_req, file, cb) => (PHOTO_EXT[file.mimetype]
    ? cb(null, true)
    : cb(httpError(400, 'Photo must be a JPEG, PNG or WebP image.'))),
});

// The browser decides the declared type, so check the file really is an image.
function looksLikeImage(path) {
  const b = Buffer.alloc(12);
  const fd = openSync(path, 'r');
  try { readSync(fd, b, 0, 12, 0); } finally { closeSync(fd); }
  return (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    || b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    || (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP');
}
const discard = (file) => file && unlink(file.path, () => {});

async function noteTarget(id) {
  if (/^\d+$/.test(id)) {
    const row = db.prepare('SELECT id, place_id FROM spots WHERE id = ?').get(Number(id));
    return row ? { spotId: row.id, placeId: row.place_id } : null;
  }
  if (!PLACE_ID_RE.test(id)) return null;
  const local = db.prepare('SELECT id FROM spots WHERE place_id = ?').get(id);
  if (local) return { spotId: local.id, placeId: id };
  if (!placesEnabled()) return null;
  try {
    await placeDetails(id); // confirms the place exists (usually cached from opening it)
  } catch (e) {
    if (e.upstreamStatus === 400 || e.upstreamStatus === 404) return null;
    if (!savedSearchPlace(id)) throw e; // a saved search already confirms it exists
  }
  return { spotId: null, placeId: id };
}

app.post('/api/spots/:id/reviews', upload.single('photo'), ah(async (req, res) => {
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
    const { lastInsertRowid } = db
      .prepare('INSERT INTO reviews (spot_id, place_id, author, stars, body, photo) VALUES (?, ?, ?, ?, ?, ?)')
      .run(target.spotId, target.placeId, author, stars, body, req.file ? req.file.filename : null);
    const row = db.prepare('SELECT id, author, stars, body, photo, is_sample, created_at FROM reviews WHERE id = ?').get(lastInsertRowid);
    res.status(201).json(shapeNote(row));
  } catch (e) {
    discard(req.file);
    throw e;
  }
}));

// Google photos: the browser asks us, we redirect to a short-lived Google URL. The key stays here.
app.get('/api/photo', ah(async (req, res) => {
  const name = String(req.query.name || '');
  if (!placesEnabled() || !PHOTO_NAME_RE.test(name) || !isKnownPhoto(name)) return res.status(404).json({ error: 'Photo not found' });
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
app.use('/uploads', express.static(UPLOADS_DIR, {
  index: false,
  setHeaders: (res) => res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400' }),
}));
app.use('/uploads', (_req, res) => res.status(404).end());

// Unknown API routes get a JSON 404 rather than Express's HTML page.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Errors on API routes (bad JSON, bad uploads, server errors) come back as JSON too.
app.use('/api', (err, req, res, next) => {
  discard(req.file);
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be 5 MB or smaller.' : 'Photo upload failed. Attach one image only.' });
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const message = status === 400 && err.type === 'entity.parse.failed'
    ? 'Request body is not valid JSON.'
    : status >= 500 ? 'Something went wrong.' : err.expose ? err.message : 'Bad request.';
  res.status(status).json({ error: message });
});

// In production (`npm run build` then `npm start`) the API also serves the built web app.
const webDist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
}

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`ZapFan API on http://localhost:${PORT} (${placesEnabled() ? 'live Google places on' : 'saved list only, no GOOGLE_MAPS_API_KEY'})`));
