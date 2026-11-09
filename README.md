# ZapFan

Find zap fan (杂饭 / economy rice / nasi campur) spots near you in Malaysia.

- **web/**: React + Vite frontend (search, radius, area chips, "open now", live location, saved spots, diner notes)
- **server/**: Express API on `http://localhost:4000`
- **Database**: SQLite file at `server/data/zapfan.db`, using Node's built-in `node:sqlite` (no native build tools needed)

The database is created and seeded with 42 sample spots across Klang Valley and Seremban on first start.

## Requirements

- Node.js 22.13 or newer (Node 24 LTS recommended)

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The web dev server proxies `/api` to the API on port 4000.

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run seed` | Wipe and reseed the database |
| `npm run build` | Build the web app into `web/dist` |
| `npm start` | Run the API, which also serves `web/dist` if it's been built (http://localhost:4000) |

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/spots` | Query: `lat`, `lng`, `radius` (km), `q`, `area`, `open=1`, `sort=distance\|rating` |
| GET | `/api/spots/:id` | Spot details, weekly hours and diner notes |
| POST | `/api/spots/:id/reviews` | Body: `{ author, stars (1-5), body }` |
| GET | `/api/areas` | Areas with spot counts |
| GET | `/api/health` | Health check |

Opening hours are evaluated in Malaysia time (UTC+8). Spot info was saved from Google Maps on 30 Oct 2026, so hours can drift.

Live location uses the browser's Geolocation API, which works on `localhost` without HTTPS.
