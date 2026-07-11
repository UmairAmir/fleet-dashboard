# Fleet Dashboard — Project Context

Read this file at the start of any new session to get up to speed. It explains what this project is, why it's built the way it is, what's already done, and what's left.

## What this is

A dashboard that scrapes truck fleet status from `https://track.ontrackk.com` every 5 minutes and displays it in a clean web UI, grouped by status (stopped/moving/idle/offline). The whole thing is designed to run **entirely free, indefinitely**, with no servers to maintain.

## Why it's architected this way

The tracking site requires a real headless browser (Playwright) to log in and capture data, and the original ask was "deploy this for free." A naive approach — a long-running Flask/Node server on a free host (Render, Fly.io, etc.) with an internal scheduler — is fragile: free web-service tiers sleep after ~15 min of no HTTP traffic, which kills an in-process cron unless you bolt on an external keep-alive ping.

So instead, this is fully serverless:
- **GitHub Actions** runs the scrape on a cron schedule (no server to keep alive, ever).
- The GitHub repo is **public**, which gives **unlimited** free Actions minutes. (Private repos only get ~2,000 min/month free — not enough for a 5-minute cron, which is ~8,600 runs/month.)
- **No database.** Data is small (a few dozen trucks), so each run force-pushes the result to a dedicated orphan `data` git branch as `latest.json`, overwriting a single commit every time. `main` (the code) never accumulates scrape history/noise.
- The data being publicly readable was explicitly confirmed OK with the user — so the **frontend fetches `latest.json` directly from `raw.githubusercontent.com`**, no backend API needed at all. This was verified to work: `raw.githubusercontent.com` returns `access-control-allow-origin: *` (browser fetch works cross-origin) and `cache-control: max-age=300` (5 min, matching the scrape cadence).
- **Frontend:** React + Vite + Tailwind, deployed free on Vercel or Netlify.

Full architecture writeup and rationale: see `README.md`. The original planning conversation (including alternatives that were considered and rejected — e.g. Supabase, Flask+APScheduler, committing to `main` directly) is not preserved anywhere else, so if this architecture ever needs revisiting, that reasoning above is the condensed version of it.

## Repo layout

```
Rigor/
├── README.md                       # setup/deploy instructions
├── CLAUDE.md                       # this file
├── .github/workflows/scrape.yml    # cron: */5 * * * *, scrapes + force-pushes to `data` branch
├── scraper/
│   ├── scrape.py                   # Playwright login + capture script
│   ├── truck_mapping.json          # tracker_id -> truck name (partial, see below)
│   └── requirements.txt
└── frontend/                       # Vite + React + Tailwind dashboard
    └── src/
        ├── App.tsx                 # main dashboard: search, status filter tabs, stale-data warning
        ├── components/
        │   ├── FleetTable.tsx      # table with click-to-expand raw JSON per row
        │   └── StatusBadge.tsx
        ├── hooks/useFleetData.ts   # fetches VITE_DATA_URL, polls every 60s
        ├── lib/
        │   ├── statusMap.ts        # st code -> {label, color, bucket} (see "Status" below)
        │   └── time.ts             # relative time formatting
        └── types.ts
```

## What's done

- Scraper refactored from the user's original working reference script: reads `TRACK_USERNAME`/`TRACK_PASSWORD` from env vars (never hardcoded), uses `page.expect_response` instead of a fixed sleep, captures the **full raw record** for every truck (not just a stopped/idle summary like the original), and fails loudly (non-zero exit, no file written) rather than overwriting good data with a broken scrape.
- GitHub Actions workflow written and its mechanics verified logically (cron syntax, concurrency guard, force-push-to-orphan-branch approach). Not yet run for real in CI — see "What's left."
- Frontend built and verified in a live preview: renders the table, status badges, search, filter tabs, loading/error/stale states all work.
- **Ran the scraper for real** against the live site (credentials the user provided directly for this purpose) and confirmed:
  - It successfully logs in and captures data for **34 trucks**.
  - The `st` field only ever takes **4 values**: `s` (Stopped), `i` (Engine Idle), `m` (Moving), `off` (Offline). There is no separate "waiting/loading/unloading" status in the API — that was part of the original ask but the tracking system just doesn't expose it. `frontend/src/lib/statusMap.ts` has been updated to reflect these confirmed values (this is no longer a placeholder/guess).
  - Each truck's raw record includes GPS lat/lng, a speed value, heading, and various device-specific I/O fields (varies by tracker hardware model — some trackers report dozens of `ioNN` fields, others very few). All of this is preserved in `latest.json` even though the dashboard only surfaces a subset today.
  - Of the 34 tracker IDs returned, only **15 have names** in `scraper/truck_mapping.json` (carried over from the user's original script). The other **19 show up as "Unmapped"** in the dashboard, e.g.: `352312095262252`, `352312095376870`, `352312095573443`, `357544371789674`, `357544371801909`, `357544372361242`, `359633103779760`, `862292052354198`, `862292056088982`, `862292056488364`, `862292057086829`, `862292057123630`, `866330050062193`, `866330050084668`, `868003034873450`, `868003034875067`, `868720061954438`, `868720064038247`. The site's raw API response does **not** include a name/label field itself — names have to come from the user identifying which tracker_id is which truck and adding it to `truck_mapping.json` by hand.

## What's left (all on the user's end — see also the chat message that came with this file)

1. Create the GitHub repo and push this code (nothing has been pushed anywhere yet — everything so far is local, staged with `git add -A` but not committed).
2. Add `TRACK_USERNAME`/`TRACK_PASSWORD` as GitHub Actions repo secrets.
3. Manually trigger the workflow once (`workflow_dispatch`) to confirm the real CI path works end-to-end (local run was verified; the GitHub Actions environment itself has not been).
4. Deploy `frontend/` to Vercel or Netlify with `VITE_DATA_URL` pointing at the `data` branch's raw JSON.
5. Extend `scraper/truck_mapping.json` with names for the 19 unmapped tracker IDs above, if desired.
6. Decide if/how to handle the "no loading/unloading status exists" gap (geofencing is the likely path if this is wanted — not started).

## Known constraints / things to keep in mind

- The `data` branch is force-pushed on every run — never treat it as a place to store anything else or expect history there.
- `scraper/truck_mapping.json` is explicitly a partial/manual mapping, not authoritative — don't assume every tracker_id in a scrape will have a name.
- Raw per-truck records vary in shape by tracker hardware (`p` field, e.g. `teltonikafm`, `concoxgt06`, `jimi`, `concoxgt100`) — the set of `io*` keys differs between them. Don't assume a fixed schema beyond the common fields (`st`, `ststr`, `tracker_id`, `name`, and the `d` array of `[reported_at, gps_at, lat, lng, speed, heading, satellites, extra_io_object]`).
