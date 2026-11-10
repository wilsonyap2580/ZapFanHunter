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

- browsing an area searches "chinese mixed rice", "economy rice", "杂饭", "chap fan" and "经济饭", limited to that area (5 calls per new area)
- a typed search (shop or area name) runs as typed plus with "chinese mixed rice" and "杂饭" in front (3 calls)
- shops from the saved list and shops users added are merged in, so a shop Google's search skips still shows
- "Add a missing shop" costs 1 call per name looked up
- saves searches, place details and photo links in SQLite and reuses them until they're older than `PLACES_CACHE_HOURS`
- stops calling Google once `PLACES_DAILY_LIMIT` is reached, then shows saved results instead
- loads card photos only for the 6 cards on the current page

Also set a requests-per-day quota on the API in Google Cloud Console, so Google enforces a cap too. `GET /api/health` shows today's call count.

## Deploy to Vercel (free)

Vercel's servers can't keep files, so the deployed app keeps its data in a free [Turso](https://turso.tech) database (SQLite-compatible) instead of `server/data/zapfan.db`. Locally nothing changes: without `TURSO_DATABASE_URL` the app uses the local file.

1. **Create the database.** Sign up at turso.tech, create a database (any name, pick the region closest to Malaysia, e.g. Singapore), then copy its **URL** (`libsql://...`) and create a **token**.
2. **Import the repo in Vercel.** At vercel.com → Add New → Project → import this GitHub repo. Leave the settings as they are; `vercel.json` sets the build.
3. **Add environment variables** (Project → Settings → Environment Variables):

   | Name | Value |
   | --- | --- |
   | `TURSO_DATABASE_URL` | the `libsql://...` URL |
   | `TURSO_AUTH_TOKEN` | the token |
   | `GOOGLE_MAPS_API_KEY` | your Places API key (optional) |
   | `PLACES_DAILY_LIMIT` | e.g. `150` (optional) |

4. **Deploy** (or Redeploy after adding the variables). The first request creates the tables and loads the saved list.

On Vercel, diner notes work but photo uploads are turned off, because there's nowhere to keep the files. The web app is served from `web/dist`; every `/api/*` request goes to the function in `api/index.js`, which runs the same Express app as `server/src/index.js`.

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run seed` | Wipe and reseed the database |
| `npm run build` | Build the web app into `web/dist` |
| `npm start` | Run the API, which also serves `web/dist` if it's been built (http://localhost:4000) |

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/spots` | Query: `lat`, `lng`, `radius` (km), `q`, `area`, `open=1`, `deals=1`, `sort=distance\|rating`. Each spot has `deal` (best night deal or `null`) |
| GET | `/api/spots/:id` | Spot details, weekly hours, diner notes and `deals` |
| POST | `/api/spots/:id/reviews` | Body: `{ author, stars (1-5), body }` |
| POST | `/api/spots/:id/deals` | Body: `{ text, days: "12345" (0=Sun), start: "20:00", end: "22:00" }`. Same wording again counts as a confirm |
| POST | `/api/deals/:id/confirm` | "Still on" (once a day per person) |
| POST | `/api/deals/:id/report` | "Not anymore" (once per person; 3 reports hide a deal) |
| GET | `/api/candidates` | Query: `q` (shop name), `lat`, `lng`. Up to 5 Google eateries to add |
| POST | `/api/added-places` | Body: `{ placeId }` from `/api/candidates`. Adds a missing shop |
| GET | `/api/areas` | Areas with spot counts |
| GET | `/api/health` | Health check |

**Night deals** come from diners (Google has no discount data). Anyone can post one; a deal nobody confirms for 30 days, or that 3 people report, stops showing. There are no logins, so a person is a salted hash of IP and browser (set `VOTER_SALT` to any secret string in production). Each person can add up to 5 shops and 5 deals a day.

Opening hours and deal times are evaluated in Malaysia time (UTC+8). Spot info was saved from Google Maps on 30 Oct 2026, so hours can drift.

Live location uses the browser's Geolocation API, which works on `localhost` without HTTPS.

`prototype/index.html` is the original single-file prototype.
