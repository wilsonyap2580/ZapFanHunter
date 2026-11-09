// Runs the API locally (`npm run dev` / `npm start`). On Vercel, api/index.js serves app.js instead.
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';
import { ready, DB_LABEL } from './db.js';
import { placesEnabled } from './places.js';

await ready(); // create tables and seed before taking requests, so problems show up at start

// In production (`npm run build` then `npm start`) the API also serves the built web app.
const webDist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
}

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(
  `ZapFan API on http://localhost:${PORT} (${placesEnabled() ? 'live Google places on' : 'saved list only, no GOOGLE_MAPS_API_KEY'}; database ${DB_LABEL})`,
));
