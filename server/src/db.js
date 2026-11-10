// Database access through libSQL (SQLite-compatible).
// Locally it opens the SQLite file at server/data/zapfan.db. When TURSO_DATABASE_URL is set
// (e.g. on Vercel, whose servers can't keep files) it uses that hosted Turso database instead.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_REVIEWS } from './spots-data.js';

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.ZAPFAN_DB || join(here, '..', 'data', 'zapfan.db');

const REMOTE_URL = process.env.TURSO_DATABASE_URL || '';
export const isRemote = !!REMOTE_URL;
export const DB_LABEL = isRemote ? REMOTE_URL.replace(/\?.*$/, '') : DB_PATH;

// The web client (HTTP) needs no native code, which keeps the Vercel function small.
const { createClient } = isRemote ? await import('@libsql/client/web') : await import('@libsql/client');
if (!isRemote) mkdirSync(dirname(DB_PATH), { recursive: true });
export const db = createClient(isRemote
  ? { url: REMOTE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
  : { url: `file:${DB_PATH.replace(/\\/g, '/')}` });

// libSQL rows are array-like; turn them into plain objects so they serialise as JSON objects.
const toObjects = (rs) => rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));

/** All rows as plain objects. */
export async function all(sql, args = []) { return toObjects(await db.execute({ sql, args })); }
/** First row or undefined. */
export async function one(sql, args = []) { return (await all(sql, args))[0]; }
/** Runs a write. Returns { changes, lastId }. */
export async function run(sql, args = []) {
  const rs = await db.execute({ sql, args });
  return { changes: rs.rowsAffected, lastId: rs.lastInsertRowid == null ? null : Number(rs.lastInsertRowid) };
}

// Diner notes. A note belongs to a saved spot (spot_id), a Google place (place_id), or both.
const REVIEWS_TABLE = (name) => `
  CREATE TABLE IF NOT EXISTS ${name} (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    spot_id    INTEGER REFERENCES spots(id) ON DELETE CASCADE,
    place_id   TEXT,
    author     TEXT    NOT NULL,
    stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    body       TEXT    NOT NULL,
    photo      TEXT,                          -- uploaded file name in data/uploads
    is_sample  INTEGER NOT NULL DEFAULT 0,    -- 1 = made-up demo note from seed.js
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    CHECK (spot_id IS NOT NULL OR place_id IS NOT NULL)
  )`;

async function init() {
  if (!isRemote) await db.executeMultiple('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await db.batch([
    `CREATE TABLE IF NOT EXISTS spots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      area         TEXT    NOT NULL,
      address      TEXT    NOT NULL,
      lat          REAL    NOT NULL,
      lng          REAL    NOT NULL,
      rating       REAL    NOT NULL DEFAULT 0,
      review_count INTEGER NOT NULL DEFAULT 0,
      types        TEXT    NOT NULL,      -- comma separated, e.g. "Chap Fan 杂饭,Economy Rice"
      hours        TEXT    NOT NULL,      -- compact hours string, see spots-data.js
      place_id     TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS spots_area ON spots(area)',
    // Saved Google results (see places.js) and the daily Google call count.
    'CREATE TABLE IF NOT EXISTS places_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, fetched_at INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS api_usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0)',
    // Shops users added because search missed them. Their Google info is in places_cache as added|<place_id>.
    `CREATE TABLE IF NOT EXISTS added_places (
      place_id TEXT PRIMARY KEY,
      name     TEXT    NOT NULL,
      lat      REAL    NOT NULL,
      lng      REAL    NOT NULL,
      added_at INTEGER NOT NULL,
      voter    TEXT    NOT NULL
    )`,
    // Night deals posted by diners. Times are minutes after midnight, Malaysia time;
    // end_min <= start_min means the deal runs past midnight. days: digits 0 (Sun) to 6 (Sat).
    `CREATE TABLE IF NOT EXISTS deals (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      spot_id           INTEGER REFERENCES spots(id) ON DELETE CASCADE,
      place_id          TEXT,
      text              TEXT    NOT NULL,
      days              TEXT    NOT NULL,
      start_min         INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
      end_min           INTEGER NOT NULL CHECK (end_min BETWEEN 0 AND 1439),
      created_at        INTEGER NOT NULL,
      last_confirmed_at INTEGER NOT NULL,
      confirms          INTEGER NOT NULL DEFAULT 1,
      reports           INTEGER NOT NULL DEFAULT 0,
      voter             TEXT    NOT NULL,
      CHECK (spot_id IS NOT NULL OR place_id IS NOT NULL)
    )`,
    'CREATE INDEX IF NOT EXISTS deals_spot ON deals(spot_id)',
    'CREATE INDEX IF NOT EXISTS deals_place ON deals(place_id)',
    // One "still on" per person per day, one "not anymore" per person ever (day = '').
    `CREATE TABLE IF NOT EXISTS deal_votes (
      deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      voter   TEXT    NOT NULL,
      kind    TEXT    NOT NULL,
      day     TEXT    NOT NULL,
      PRIMARY KEY (deal_id, voter, kind, day)
    )`,
    // Per-person daily limits on adding shops and deals.
    'CREATE TABLE IF NOT EXISTS rate_limits (key TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (key, day))',
  ], 'write');

  const oldColumns = (await all("SELECT name FROM pragma_table_info('reviews')")).map((c) => c.name);
  if (oldColumns.length && !oldColumns.includes('place_id')) {
    // Migrate a database created before notes could belong to Google places.
    await db.batch([
      REVIEWS_TABLE('reviews_new'),
      `INSERT INTO reviews_new (id, spot_id, place_id, author, stars, body, created_at)
       SELECT r.id, r.spot_id, s.place_id, r.author, r.stars, r.body, r.created_at
       FROM reviews r LEFT JOIN spots s ON s.id = r.spot_id`,
      'DROP TABLE reviews',
      'ALTER TABLE reviews_new RENAME TO reviews',
      ...SAMPLE_REVIEWS.map(([author, , body]) => ({ sql: 'UPDATE reviews SET is_sample = 1 WHERE author = ? AND body = ?', args: [author, body] })),
    ], 'write');
  }
  await db.batch([
    REVIEWS_TABLE('reviews'),
    'CREATE INDEX IF NOT EXISTS reviews_spot ON reviews(spot_id)',
    'CREATE INDEX IF NOT EXISTS reviews_place ON reviews(place_id)',
  ], 'write');
}

let readyPromise;
/** Creates tables (and seeds an empty database) once per process. Await before any query. */
export function ready() {
  readyPromise ??= init()
    .then(async () => { const { seedIfEmpty } = await import('./seed.js'); await seedIfEmpty(); })
    .catch((e) => { readyPromise = undefined; throw e; });
  return readyPromise;
}

// Diner photo uploads need a disk that keeps files, so they're off on Vercel.
export const UPLOADS_ENABLED = !process.env.VERCEL && process.env.ALLOW_PHOTO_UPLOADS !== '0';
export const UPLOADS_DIR = join(dirname(DB_PATH), 'uploads');
if (UPLOADS_ENABLED) mkdirSync(UPLOADS_DIR, { recursive: true });

export async function spotCount() {
  return (await one('SELECT COUNT(*) AS n FROM spots')).n;
}
