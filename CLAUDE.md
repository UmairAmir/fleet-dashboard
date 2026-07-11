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

- Scraper refactored from the user's original working reference script: reads `TRACK_USERNAME`/`TRACK_PASSWORD` from env vars (never hardcoded, loaded locally via `python-dotenv` from `scraper/.env` which is gitignored; in CI these come from GitHub Actions secrets), uses `page.expect_response` instead of a fixed sleep, captures the **full raw record** for every truck (not just a stopped/idle summary like the original), and fails loudly (non-zero exit, no file written) rather than overwriting good data with a broken scrape.
- GitHub Actions workflow **deployed and verified for real** — manual `workflow_dispatch` runs succeed end-to-end (login, scrape, force-push to `data` branch), confirmed twice. The `*/5 * * * *` cron is registered and `active` per `gh workflow list`, but as of this writing it had not yet fired on its own schedule (only manual runs so far) — worth checking `gh run list --workflow=scrape.yml` again after some time has passed; GitHub can take a while to start firing a brand-new schedule.
- Frontend built, deployed, and verified live against real data.
- **Ran the scraper for real** against the live site and confirmed:
  - It successfully logs in and captures data for **34 trucks**.
  - The `st` field only ever takes **4 values**: `s` (Stopped), `i` (Engine Idle), `m` (Moving), `off` (Offline). There is no separate "waiting/loading/unloading" status in the API — that was part of the original ask but the tracking system just doesn't expose it. `frontend/src/lib/statusMap.ts` reflects these confirmed values.
  - Each truck's raw record includes GPS lat/lng, a speed value, heading, and various device-specific I/O fields (varies by tracker hardware model — some trackers report dozens of `ioNN` fields, others very few). All of this is preserved in `latest.json` even though the dashboard only surfaces a subset today.
- **`scraper/truck_mapping.json` is now complete and verified for all 34 tracker IDs.** The raw scrape API never includes a name field, but the site's own dashboard HTML has a hidden object-list grid (`side_panel_objects_object_list_grid`) whose row `id` is the tracker_id and whose `<div class="name">` is the vehicle name — this is the authoritative source. When checked against it, **13 of the original 15 hand-entered mappings turned out to be wrong** (only `JV-8750`/`352312095578665` and `JU-5350`/`866551038119579` were correct) — those were carried over from the user's original reference script and never verified against the live site. All 34 are now correct as of 2026-07-11.
- **Deployed for real:**
  - GitHub repo: `UmairAmir/fleet-dashboard` (public), pushed via `gh repo create --source=. --remote=origin --push`.
  - `TRACK_USERNAME`/`TRACK_PASSWORD` set as repo secrets via `gh secret set` (piped from local `.env`, never printed/logged).
  - Frontend deployed to Vercel, linked to the GitHub repo via `vercel git connect` for auto-deploy on every push to `main`. Since the repo is a monorepo (frontend/ is a subfolder, scraper/ lives alongside it), a root-level `vercel.json` tells Vercel to `npm install/build --prefix frontend` with `frontend/dist` as the output — this was necessary because Vercel's git-triggered builds default to the repo root.
  - Production env var `VITE_DATA_URL` set on Vercel to `https://raw.githubusercontent.com/UmairAmir/fleet-dashboard/data/latest.json`.
  - Live URL: https://fleet-dashboard-pink-omega.vercel.app
  - Security-checked: credentials never appear in git history, CI logs, the public `data` branch, or the deployed JS bundle.

## What's left

1. Confirm the `*/5 * * * *` cron has started firing on its own (see note above) — if it still hasn't after a few hours, something may be wrong with GitHub's scheduling for this repo and is worth investigating further (re-check `gh workflow list` / `gh run list`).
2. Decide if/how to handle the "no loading/unloading status exists" gap (geofencing is the likely path if this is wanted — not started).
3. Delete the stray empty Vercel project named `frontend` (created accidentally before the properly-named `fleet-dashboard` project was linked) — harmless if left alone.

## Known constraints / things to keep in mind

- The `data` branch is force-pushed on every run — never treat it as a place to store anything else or expect history there.
- `scraper/truck_mapping.json` is a manual mapping kept in sync with the site's own hidden object-list grid, not the scrape API (which never includes names). It's complete as of 2026-07-11, but if new trackers get added on the site's end they'll show up as "Unmapped" until someone re-checks the live DOM and adds them here.
- Raw per-truck records vary in shape by tracker hardware (`p` field, e.g. `teltonikafm`, `concoxgt06`, `jimi`, `concoxgt100`) — the set of `io*` keys differs between them. Don't assume a fixed schema beyond the common fields (`st`, `ststr`, `tracker_id`, `name`, and the `d` array of `[reported_at, gps_at, lat, lng, speed, heading, satellites, extra_io_object]`).
