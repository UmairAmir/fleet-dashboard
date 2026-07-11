# Fleet Dashboard

Scrapes truck status from track.ontrackk.com every 5 minutes and displays it in a live dashboard — entirely free to run.

## How it works

- **`scraper/`** — a Playwright script that logs into the tracking site and captures the full raw status record for every truck.
- **GitHub Actions** (`.github/workflows/scrape.yml`) runs the scraper on a `*/5 * * * *` cron schedule and force-pushes the result as `latest.json` to a dedicated `data` branch (overwriting a single commit each run — `main` stays clean).
- **`frontend/`** — a Vite + React + Tailwind dashboard that fetches `latest.json` straight from `raw.githubusercontent.com` (no backend, no database) and polls it every 60s.

## One-time setup

1. **Create the GitHub repo (public)** and push this code to `main`.
   ```
   git remote add origin https://github.com/<owner>/<repo>.git
   git add .
   git commit -m "Initial commit"
   git push -u origin main
   ```
   The repo must be **public** — private repos only get ~2,000 free Actions minutes/month, not enough for a 5-minute cron (~8,600 runs/month).

2. **Add repo secrets** (Settings → Secrets and variables → Actions):
   - `TRACK_USERNAME`
   - `TRACK_PASSWORD`

3. **Trigger the workflow once manually** (Actions tab → "Scrape fleet data" → "Run workflow", or `gh workflow run scrape.yml`). This creates the `data` branch automatically on first push — no manual branch setup needed.

4. **Deploy the frontend** (Vercel or Netlify, free tier):
   - Root/base directory: `frontend`
   - Build command: `npm run build`
   - Output directory: `dist`
   - Env var: `VITE_DATA_URL=https://raw.githubusercontent.com/<owner>/<repo>/data/latest.json`

## Local development

**Scraper:**
```
cd scraper
pip install -r requirements.txt
python -m playwright install chromium
TRACK_USERNAME=... TRACK_PASSWORD=... python scrape.py
```
Produces `latest.json` in the current directory. Check it for the full raw fields the API returns per truck.

**Frontend:**
```
cd frontend
npm install
echo "VITE_DATA_URL=https://raw.githubusercontent.com/<owner>/<repo>/data/latest.json" > .env.local
npm run dev
```

## Extending the truck name mapping

`scraper/truck_mapping.json` maps tracker IDs to truck names, but it's a starting point only — it doesn't cover every tracker ID the fleet returns. After running the scraper, check whether the raw API response already includes a name/label field per tracker; for any tracker still unnamed, add it to `truck_mapping.json` by hand. Unmapped trucks fall back to showing their raw tracker ID in the dashboard.

## Status classification

Verified against a real scrape (34 trucks): the `st` field only ever takes 4 values — `s` (Stopped), `i` (Engine Idle), `m` (Moving), `off` (Offline). This is implemented in `frontend/src/lib/statusMap.ts`. There is **no separate "waiting"/"loading"/"unloading" status** — the tracking API doesn't track that concept at all. If you want those, they'd have to be inferred separately (e.g. geofencing known warehouse/yard coordinates using the lat/lng in each record, and treating a long "Stopped" duration there as loading/unloading).
