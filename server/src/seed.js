// Seeds the database with sample spots and reviews.
// `npm run seed` wipes and reseeds. The API calls seedIfEmpty() when it first connects.
import { db, ready, spotCount, DB_LABEL } from './db.js';
import { SPOTS, TYPE_NAMES, SAMPLE_REVIEWS } from './spots-data.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export async function seed() {
  // Sample notes are made up, so they are flagged as demo data and never seeded in production.
  const withSamples = process.env.NODE_ENV !== 'production';
  const stmts = [
    'DELETE FROM reviews',
    'DELETE FROM spots',
    "DELETE FROM sqlite_sequence WHERE name IN ('spots','reviews')",
  ];
  SPOTS.forEach(([name, area, address, lat, lng, rating, count, codes, hours, placeId], i) => {
    const id = i + 1;
    const types = codes.split('').map((c) => TYPE_NAMES[c]).join(',');
    stmts.push({
      sql: `INSERT INTO spots (id, name, area, address, lat, lng, rating, review_count, types, hours, place_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, name, area, address, lat, lng, rating, count, types, hours, placeId],
    });
    // Two sample notes per spot, rotated so neighbours differ.
    for (let k = 0; withSamples && k < 2; k++) {
      const [author, stars, body] = SAMPLE_REVIEWS[(i * 2 + k) % SAMPLE_REVIEWS.length];
      stmts.push({
        sql: `INSERT INTO reviews (spot_id, place_id, author, stars, body, is_sample, created_at)
              VALUES (?, ?, ?, ?, ?, 1, datetime('now', ?))`,
        args: [id, placeId, author, stars, body, `-${(i % 9) + k * 4 + 1} days`],
      });
    }
  });
  await db.batch(stmts, 'write'); // one transaction: all or nothing
}

export async function seedIfEmpty() {
  if ((await spotCount()) === 0) {
    await seed();
    console.log(`Seeded ${await spotCount()} spots into ${DB_LABEL}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  await ready();
  await seed();
  console.log(`Seeded ${await spotCount()} spots into ${DB_LABEL}`);
}
