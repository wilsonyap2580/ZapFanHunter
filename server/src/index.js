import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { seedIfEmpty } from './seed.js';
import { parseHours, openStatus, weekTable } from './hours.js';

seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json({ limit: '32kb' }));

// Default centre when the user hasn't shared their location: KL city centre.
const KL = { lat: 3.139, lng: 101.687 };

function distanceKm(a, b) {
  const r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

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
    types: row.types.split(','),
    placeId: row.place_id,
    status: openStatus(week),
    distanceKm: from ? Math.round(distanceKm(from, row) * 100) / 100 : null,
    _week: week,
  };
}

const num = (v) => (v === undefined || v === '' ? NaN : Number(v));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Areas with a rough centre, for the area chips.
app.get('/api/areas', (_req, res) => {
  const rows = db
    .prepare('SELECT area AS name, COUNT(*) AS count, AVG(lat) AS lat, AVG(lng) AS lng FROM spots GROUP BY area ORDER BY count DESC, area')
    .all();
  res.json(rows);
});

// GET /api/spots?lat=&lng=&radius=km&q=&area=&open=1&sort=distance|rating
app.get('/api/spots', (req, res) => {
  const lat = num(req.query.lat);
  const lng = num(req.query.lng);
  const from = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : KL;
  const radius = num(req.query.radius);
  const q = String(req.query.q || '').trim().toLowerCase();
  const area = String(req.query.area || '').trim();
  const openOnly = req.query.open === '1' || req.query.open === 'true';
  const sort = req.query.sort === 'rating' ? 'rating' : 'distance';

  let sql = 'SELECT * FROM spots';
  const where = [];
  const args = [];
  if (area) { where.push('area = ?'); args.push(area); }
  if (q) {
    where.push('(lower(name) LIKE ? OR lower(area) LIKE ? OR lower(address) LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');

  let spots = db.prepare(sql).all(...args).map((r) => shape(r, from));
  // Searching by name or area looks everywhere; radius only applies to "near me" browsing.
  if (Number.isFinite(radius) && radius > 0 && !q && !area) spots = spots.filter((s) => s.distanceKm <= radius);
  if (openOnly) spots = spots.filter((s) => s.status.open);
  spots.sort(sort === 'rating'
    ? (a, b) => b.rating - a.rating || a.distanceKm - b.distanceKm
    : (a, b) => (b.status.open - a.status.open) || a.distanceKm - b.distanceKm);

  res.json({ center: from, count: spots.length, spots: spots.map(({ _week, ...s }) => s) });
});

app.get('/api/spots/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM spots WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Spot not found' });
  const lat = num(req.query.lat);
  const lng = num(req.query.lng);
  const from = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : KL;
  const { _week, ...spot } = shape(row, from);
  const reviews = db
    .prepare('SELECT id, author, stars, body, created_at AS createdAt FROM reviews WHERE spot_id = ? ORDER BY created_at DESC, id DESC')
    .all(row.id);
  res.json({ ...spot, hours: weekTable(_week), reviews });
});

app.post('/api/spots/:id/reviews', (req, res) => {
  const spotId = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM spots WHERE id = ?').get(spotId)) return res.status(404).json({ error: 'Spot not found' });
  const author = String(req.body?.author || '').trim().slice(0, 40);
  const body = String(req.body?.body || '').trim().slice(0, 600);
  const stars = Math.round(Number(req.body?.stars));
  if (!author || !body || !(stars >= 1 && stars <= 5)) {
    return res.status(400).json({ error: 'Please add your name, a short note and 1 to 5 stars.' });
  }
  const { lastInsertRowid } = db
    .prepare('INSERT INTO reviews (spot_id, author, stars, body) VALUES (?, ?, ?, ?)')
    .run(spotId, author, stars, body);
  const review = db.prepare('SELECT id, author, stars, body, created_at AS createdAt FROM reviews WHERE id = ?').get(lastInsertRowid);
  res.status(201).json(review);
});

// In production (`npm run build` then `npm start`) the API also serves the built web app.
const webDist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
}

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`ZapFan API on http://localhost:${PORT}`));
