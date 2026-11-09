// Seeds the database with sample spots and reviews.
// `npm run seed` wipes and reseeds. The API server calls seedIfEmpty() on start.
import { db, spotCount, DB_PATH } from './db.js';
import { SPOTS, TYPE_NAMES, SAMPLE_REVIEWS } from './spots-data.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function seed() {
  db.exec('BEGIN');
  try {
    db.exec("DELETE FROM reviews; DELETE FROM spots; DELETE FROM sqlite_sequence WHERE name IN ('spots','reviews');");
    const insSpot = db.prepare(`INSERT INTO spots (name, area, address, lat, lng, rating, review_count, types, hours, place_id)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insReview = db.prepare(`INSERT INTO reviews (spot_id, place_id, author, stars, body, is_sample, created_at)
                                  VALUES (?, ?, ?, ?, ?, 1, datetime('now', ?))`);
    // Sample notes are made up, so they are flagged as demo data and never seeded in production.
    const withSamples = process.env.NODE_ENV !== 'production';
    SPOTS.forEach(([name, area, address, lat, lng, rating, count, codes, hours, placeId], i) => {
      const types = codes.split('').map((c) => TYPE_NAMES[c]).join(',');
      const { lastInsertRowid: id } = insSpot.run(name, area, address, lat, lng, rating, count, types, hours, placeId);
      // Two sample notes per spot, rotated so neighbours differ.
      for (let k = 0; withSamples && k < 2; k++) {
        const [author, stars, body] = SAMPLE_REVIEWS[(i * 2 + k) % SAMPLE_REVIEWS.length];
        insReview.run(id, placeId, author, stars, body, `-${(i % 9) + k * 4 + 1} days`);
      }
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function seedIfEmpty() {
  if (spotCount() === 0) {
    seed();
    console.log(`Seeded ${spotCount()} spots into ${DB_PATH}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  seed();
  console.log(`Seeded ${spotCount()} spots into ${DB_PATH}`);
}
