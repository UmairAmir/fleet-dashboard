# Fleet Dashboard — Project Context

Read this file at the start of any new session to get up to speed. It explains what this project is, why it's built the way it is, what's already done, and what's left.

## What this is

A dashboard that scrapes truck fleet status (and location) from `https://track.ontrackk.com` every 5 minutes and displays it in a clean web UI, sorted by status (stopped → engine idle → moving → offline). The whole thing is designed to run **entirely free, indefinitely**, with no servers to maintain.

**Live:**
- Site: https://fleet-dashboard-pink-omega.vercel.app
- Repo: https://github.com/UmairAmir/fleet-dashboard (public)

## Why it's architected this way

The tracking site requires a real headless browser (Playwright) to log in and capture data, and the original ask was "deploy this for free." A naive approach — a long-running Flask/Node server on a free host (Render, Fly.io, etc.) with an internal scheduler — is fragile: free web-service tiers sleep after ~15 min of no HTTP traffic, which kills an in-process cron unless you bolt on an external keep-alive ping.

So instead, this is fully serverless:
- **GitHub Actions** runs the scrape on a cron schedule (no server to keep alive, ever).
- The GitHub repo is **public**, which gives **unlimited** free Actions minutes. (Private repos only get ~2,000 min/month free — not enough for a 5-minute cron, which is ~8,600 runs/month.)
- **No database.** Data is small (a few dozen trucks), so each run force-pushes the result to a dedicated orphan `data` git branch as `latest.json`, overwriting a single commit every time. `main` (the code) never accumulates scrape history/noise.
- The data being publicly readable was explicitly confirmed OK with the user — so the **frontend fetches `latest.json` directly from `raw.githubusercontent.com`**, no backend API needed for reads. Verified: `raw.githubusercontent.com` returns `access-control-allow-origin: *` (browser fetch works cross-origin) and `cache-control: max-age=300` (5 min, matching the scrape cadence).
- **Frontend:** React + Vite + Tailwind, deployed free on Vercel, auto-deploying on every push to `main` via `vercel git connect`.
- **One exception to "no backend":** a single Vercel serverless function (`api/trigger-scrape.js`) lets the dashboard's "Force scrape now" button kick off the GitHub Actions workflow on demand. This needed a real (if tiny) backend because triggering `workflow_dispatch` requires a GitHub token, which can never be shipped to the public frontend bundle. Still free (Vercel Functions free tier) and still nothing to maintain — it's just a request/response function, not a running process.

Full architecture writeup and rationale: see `README.md`. The original planning conversation (including alternatives that were considered and rejected — e.g. Supabase, Flask+APScheduler, committing to `main` directly) is not preserved anywhere else, so if this architecture ever needs revisiting, that reasoning above is the condensed version of it.

## Repo layout

```
Rigor/
├── README.md                       # setup/deploy instructions
├── CLAUDE.md                       # this file
├── vercel.json                     # monorepo build config for Vercel (see "Deployment" below)
├── api/
│   └── trigger-scrape.js           # Vercel serverless function: POST triggers scrape.yml via workflow_dispatch
├── .github/workflows/scrape.yml    # cron: */5 * * * *, scrapes + force-pushes to `data` branch
├── scraper/
│   ├── scrape.py                   # Playwright login + capture + reverse-geocode script
│   ├── truck_mapping.json          # tracker_id -> truck name (complete, see below)
│   ├── .env                        # local-only, gitignored: TRACK_USERNAME/TRACK_PASSWORD
│   └── requirements.txt
└── frontend/                       # Vite + React + Tailwind dashboard
    ├── .env                        # local-only, gitignored: VITE_DATA_URL
    ├── public/latest.json          # local-only, gitignored: dev copy of a scrape snapshot
    └── src/
        ├── App.tsx                 # main dashboard: search, All/>1 Hour/Operations tabs, sorts by BUCKET_ORDER
        ├── components/
        │   ├── FleetTable.tsx      # table (Truck/Status/Raw status/Location) w/ click-to-expand raw JSON
        │   ├── StatusBadge.tsx
        │   └── TriggerScrapeButton.tsx  # "Force scrape now" button, calls /api/trigger-scrape
        ├── hooks/useFleetData.ts   # fetches VITE_DATA_URL, polls every 60s
        ├── lib/
        │   ├── statusMap.ts        # st code -> {label, color, bucket}; exports BUCKET_ORDER for sorting
        │   ├── time.ts             # relative time formatting + ststr duration parsing
        │   └── geography.ts        # matchesCity() heuristic for the Operations tab (see below)
        └── types.ts
```

## What's done

**Scraper** (`scraper/scrape.py`):
- Reads `TRACK_USERNAME`/`TRACK_PASSWORD` from env vars (never hardcoded). Locally loaded via `python-dotenv` from `scraper/.env` (gitignored); in CI these come from GitHub Actions secrets.
- Logs in with Playwright, uses `page.expect_response` (not a fixed sleep) to capture the `/func/fn_objects.php` response — the **full raw record** for every truck, not just a stopped/idle summary.
- **Reverse-geocodes every truck's last known position.** The scrape API never includes an address, but the site's own UI calls `POST https://track.ontrackk.com/tools/gc_post.php` (body `cmd=latlng&lat=..&lng=..`, JSON-encoded string response) when you click a truck on the map. The scraper now makes this same call for all 34 trucks' `d[0][2]`/`d[0][3]` (lat/lng) within the same authenticated browser context right after login — no extra credentials or requests needed. Result is stored as `address` on each truck record. A failed geocode for one truck just leaves `address: null` for that truck; it doesn't fail the whole run.
- Fails loudly (non-zero exit, no file written) rather than overwriting good data with a broken scrape.
- Confirmed against the live site: **34 trucks total**. The `st` field only ever takes 4 values: `s` (Stopped), `i` (Engine Idle), `m` (Moving), `off` (Offline) — there is no separate "waiting/loading/unloading" status; the tracking system doesn't expose that concept. `frontend/src/lib/statusMap.ts` reflects these confirmed values.
- Raw records include GPS lat/lng, speed, heading, and device-specific `io*` fields (varies by tracker hardware) — all preserved in `latest.json` even though the dashboard only surfaces a subset.

**Truck mapping** (`scraper/truck_mapping.json`) — **complete and verified for all 34 tracker IDs.** The scrape API never includes a name field, but the site's dashboard HTML has a hidden object-list grid (`side_panel_objects_object_list_grid`) whose row `id` is the tracker_id and whose `<div class="name">` is the vehicle name — this is the authoritative source, extracted via a one-off Playwright + BeautifulSoup script (not part of the regular scrape). When checked against it, **13 of the original 15 hand-entered mappings turned out to be wrong** (only `JV-8750`/`352312095578665` and `JU-5350`/`866551038119579` were correct) — carried over from the user's original reference script and never verified. All 34 are correct as of 2026-07-11.

**Frontend:**
- Search, status filter tabs, loading/error/stale-data states.
- **Location column** showing the reverse-geocoded address (wraps instead of truncating).
- **Always sorted** by status priority: Stopped → Engine Idle → Moving → Offline (`BUCKET_ORDER` in `statusMap.ts`, applied to both the table rows and the filter-tab order in `App.tsx`).
- **Mobile responsive:** header/search/filters reflow on narrow viewports; the table sits in its own horizontally-scrollable container instead of being clipped.
- **Three tabs** (replaced the old per-status tabs): **All**, **`>1 Hour`** (Stopped/Idle trucks whose `ststr` duration exceeds 3600s — Moving/Offline never qualify regardless of duration), and **Operations** (Stopped trucks only, grouped into Karachi / Lahore / Other sections by matching the free-text `address` field — see `matchesCity()` in `lib/geography.ts`). Search still applies within any tab.
- **"Force scrape now" button** (`TriggerScrapeButton.tsx`) — calls `POST /api/trigger-scrape`, which dispatches `scrape.yml` via the GitHub Actions API. Server-side guardrails since the button is public and unauthenticated: refuses (HTTP 429) if `latest.json`'s `fetched_at` is under 2 minutes old, or if a run is already queued/in-progress on GitHub's side.

**GitHub Actions workflow** (`.github/workflows/scrape.yml`) — deployed and verified for real:
- Multiple manual (`workflow_dispatch`) runs succeeded end-to-end (login, scrape, geocode, force-push to `data` branch).
- The `*/5 * * * *` cron is confirmed **firing on its own schedule** (first automatic run at `2026-07-11T22:39:17Z`, event `schedule`, success) — it took about 50 minutes after the workflow was first pushed before GitHub started honoring the schedule, which is normal cold-start behavior for a brand-new cron, not a bug.

**Deployment:**
- GitHub repo `UmairAmir/fleet-dashboard` (public), pushed via `gh repo create --source=. --remote=origin --push`.
- `TRACK_USERNAME`/`TRACK_PASSWORD` set as repo secrets via `gh secret set` (piped from local `.env`, never printed/logged).
- Frontend deployed to Vercel, linked to the GitHub repo via `vercel git connect` for auto-deploy on every push to `main`.
- Root-level `vercel.json` tells Vercel to `npm install/build --prefix frontend` with `frontend/dist` as output — needed because Vercel's git-triggered builds default to the repo root, and this repo is a monorepo (frontend/ is a subfolder, scraper/ lives alongside it).
- **Vercel was also trying to build the `data` branch on every force-push and failing** (`vite: command not found` — that branch has no frontend code, it's just `latest.json`). Vercel reads `vercel.json` from whichever branch/commit it's building, not from a cached copy of `main`'s config, so the fix had to live *on the data branch itself*: the workflow's "Push snapshot to data branch" step now also writes a trivial `{"ignoreCommand": "exit 0"}` `vercel.json` into that orphan branch alongside `latest.json`, so Vercel cleanly skips ("Canceled") instead of erroring. Verified by triggering the scraper and watching `vercel ls` before/after.
- Production env var `VITE_DATA_URL` set on Vercel to `https://raw.githubusercontent.com/UmairAmir/fleet-dashboard/data/latest.json`.
- Security-checked: credentials never appear in git history, CI logs, the public `data` branch, or the deployed JS bundle.

## What's left

1. Decide if/how to handle the "no loading/unloading status exists" gap (geofencing is the likely path if this is wanted — not started).

## Known constraints / things to keep in mind

- The `data` branch is force-pushed on every run — never treat it as a place to store anything else or expect history there. It also always carries its own `vercel.json` with `ignoreCommand: exit 0` — **don't remove that** when touching the workflow, or Vercel will start failing "deployments" on every scrape run again.
- `scraper/truck_mapping.json` is a manual mapping kept in sync with the site's own hidden object-list grid, not the scrape API (which never includes names). It's complete as of 2026-07-11, but if new trackers get added on the site's end they'll show up as "Unmapped" until someone re-checks the live DOM and adds them here.
- Raw per-truck records vary in shape by tracker hardware (`p` field, e.g. `teltonikafm`, `concoxgt06`, `jimi`, `concoxgt100`) — the set of `io*` keys differs between them. Don't assume a fixed schema beyond the common fields (`st`, `ststr`, `tracker_id`, `name`, `address`, and the `d` array of `[reported_at, gps_at, lat, lng, speed, heading, satellites, extra_io_object]`).
- `tools/gc_post.php` (reverse geocoding) is an undocumented internal endpoint of the tracking site, not a public API — it happens to work reliably and fast (34 calls in ~1-2s in the same session) but there's no SLA on it. If it starts failing/rate-limiting, trucks will just show `address: null` rather than breaking the scrape.
- Both `frontend/.env` and `scraper/.env` are gitignored and local-only — re-create them (see README) when setting up a fresh clone.
- **City detection for the Operations tab is a heuristic on free-text addresses, not a structured field** — checked real data and found Karachi-area addresses sometimes come back **in Urdu script** (e.g. `"کراچی - حیدرآباد موٹروے"` for the Karachi-Hyderabad Motorway) rather than the English word, and Lahore-area addresses use the **"LHR" abbreviation** rather than ever spelling out "Lahore". `matchesCity()` in `frontend/src/lib/geography.ts` matches both English and these known variants per city. If new address formats show up that don't match (e.g. other abbreviations or scripts), affected trucks will silently fall into the "Other" group rather than erroring — worth spot-checking `lib/geography.ts`'s patterns periodically against real `address` values.
- **`GH_ACTIONS_TOKEN`** (Vercel env var, all environments, server-side only — never `VITE_`-prefixed so it's never bundled into client JS) is a **fine-grained GitHub PAT scoped to only the `fleet-dashboard` repo, with just "Actions: Read and write" permission** — deliberately narrower than the `gh` CLI's own OAuth token (which has `repo`+`workflow` across the whole account) since this one backs a publicly-triggerable button. Used only by `api/trigger-scrape.js`. If it's ever rotated or revoked, the "Force scrape now" button will fail with a 500 until a new one is set via `vercel env add GH_ACTIONS_TOKEN`.
- **The `*/5 * * * *` cron does not reliably fire every 5 minutes.** Confirmed via `gh run list`: in a 33-minute window only **one** `schedule`-triggered run occurred (22:39:17Z); everything else in that window was manual `workflow_dispatch`. This is a known GitHub Actions limitation, not a bug in the workflow — GitHub explicitly documents that scheduled workflows are best-effort and "can be delayed during periods of high load," especially for sub-hourly schedules. So "Last scraped" on the dashboard can legitimately show more than 5 min old; there's no free fix that doesn't reintroduce an always-on server (which defeats the point of this architecture). Treat drift up to roughly 10-15 min as expected, not a regression.
