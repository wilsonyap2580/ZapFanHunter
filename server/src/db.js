// Local SQLite database using Node's built-in `node:sqlite` (no native build step needed).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_REVIEWS } from './spots-data.js';

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.ZAPFAN_DB || join(here, '..', 'data', 'zapfan.db');

mkdirSync(dirname(DB_PATH), { recursive: true });
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS spots (
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
  );
  CREATE INDEX IF NOT EXISTS spots_area ON spots(area);

`);

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
  );`;

const oldColumns = db.prepare("SELECT name FROM pragma_table_info('reviews')").all().map((c) => c.name);
if (oldColumns.length && !oldColumns.includes('place_id')) {
  // Migrate a database created before notes could belong to Google places.
  db.exec('BEGIN');
  try {
    db.exec(REVIEWS_TABLE('reviews_new'));
    db.exec(`INSERT INTO reviews_new (id, spot_id, place_id, author, stars, body, created_at)
             SELECT r.id, r.spot_id, s.place_id, r.author, r.stars, r.body, r.created_at
             FROM reviews r LEFT JOIN spots s ON s.id = r.spot_id;
             DROP TABLE reviews;
             ALTER TABLE reviews_new RENAME TO reviews;`);
    const mark = db.prepare('UPDATE reviews SET is_sample = 1 WHERE author = ? AND body = ?');
    for (const [author, , body] of SAMPLE_REVIEWS) mark.run(author, body);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
db.exec(REVIEWS_TABLE('reviews'));
db.exec(`
  CREATE INDEX IF NOT EXISTS reviews_spot ON reviews(spot_id);
  CREATE INDEX IF NOT EXISTS reviews_place ON reviews(place_id);
`);

export const UPLOADS_DIR = join(dirname(DB_PATH), 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

export function spotCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM spots').get().n;
}
