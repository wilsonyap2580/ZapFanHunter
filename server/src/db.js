// Local SQLite database using Node's built-in `node:sqlite` (no native build step needed).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

  CREATE TABLE IF NOT EXISTS reviews (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    spot_id    INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
    author     TEXT    NOT NULL,
    stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    body       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS reviews_spot ON reviews(spot_id);
`);

export function spotCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM spots').get().n;
}
