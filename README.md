# ZapFan in your Area

Find Chinese mixed rice (杂饭 / economy rice) spots near you in Malaysia. A mini fun project (repo: ZapFanHunter).

- **web/**: React + Vite frontend (search within 10 km, area chips, "open now", live location, saved spots, diner notes, 6 cards per page, and a "Can't decide? Spin" wheel)
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

## Live Google places (optional)

Without a key the app uses the saved list. To search Google Maps live, create `server/.env` (it's git-ignored, never commit it):

```
GOOGLE_MAPS_API_KEY=your-key
PLACES_DAILY_LIMIT=150     # optional, hard cap on Google calls per day (Malaysia time)
PLACES_CACHE_HOURS=120     # optional, how long Google results are reused (default 5 days)
```

The key needs **Places API (New)**. To keep costs down, the app:

- searches only "chinese mixed rice", "杂饭" and "economy rice" (3 calls per new area)
- saves searches, place details and photo links in SQLite and reuses them until they're older than `PLACES_CACHE_HOURS`
- stops calling Google once `PLACES_DAILY_LIMIT` is reached, then shows saved results instead
- loads card photos only for the 6 cards on the current page

Also set a requests-per-day quota on the API in Google Cloud Console, so Google enforces a cap too. `GET /api/health` shows today's call count.

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

`prototype/index.html` is the original single-file prototype.
