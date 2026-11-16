# Stretch Dashboard — Cloudflare migration

Moves the dashboard off GitHub Pages onto Cloudflare Pages, and adds a
D1-backed sync so the log (stretches, workouts, wind-down, sleep ratings,
ankle notes) is shared across devices instead of living in one browser's
localStorage. Local-first: localStorage still works offline; the server
value wins only if newer.

## Pieces

- `index.html` / `stretch-dashboard.html` — the dashboard, with sync code
  calling `https://stretch-sync.delianpetrov.com/api/log` (see `SYNC_URL`
  in the inline script). Both files are byte-identical; Pages serves
  `index.html`.
- `cloudflare/worker.js` — `stretch-sync` Worker: `GET /api/log?key=…`,
  `PUT /api/log {key, value}`. Allowlist: `sd-session-*`,
  `sd-workout-log-v1`, `sd-winddown-log-v1`. Values must be JSON, ≤ 64 KiB.
  No auth (personal stretch log, low sensitivity) — add a shared-secret
  header later if Delian wants one.
- `cloudflare/schema.sql` — D1 table `logs(key, value, updated_at)`.
- `cloudflare/wrangler.toml` — Worker config; fill in `database_id` after
  creating the D1 database.

## Setup (Cloudflare dashboard, in order)

1. **D1**: Workers & Pages → D1 → Create database `stretch-logs`. Open its
   Console and run `schema.sql`. Note the database ID → put it in
   `wrangler.toml`.
2. **Worker**: Workers & Pages → Create → Worker `stretch-sync`. Paste
   `worker.js` into the editor, Deploy. Settings → Variables → D1 Database
   Bindings → add binding `DB` → database `stretch-logs`. Redeploy.
   (Dashboard editor gotcha: after any Search/Replace, grep the code for a
   literal `$$` — the replace panel once inserted it.)
3. **Custom domain**: Worker → Settings → Domains → Add Custom Domain →
   `stretch-sync.delianpetrov.com`. Verify `GET /` returns
   `stretch-sync ok`.
4. **Pages**: Workers & Pages → Create → Pages → Connect to Git →
   repo `delian7/stretch-dashboard`, production branch `main`, build
   command empty, output directory `/` (static files at repo root).
   Every branch then gets a `*.stretch-dashboard.pages.dev` preview URL.
5. **Verify the preview** (branch `cf-migration`): all four tabs render;
   tick a wind-down step + set a sleep rating; reload and confirm it
   persists; confirm the row landed in D1 (`SELECT * FROM logs;` in the
   D1 console, or `GET /api/log?key=sd-winddown-log-v1`).
6. **DNS cutover — only after step 5 passes**: DNS → record `stretches`
   CNAME: change `delian7.github.io` → `stretch-dashboard.pages.dev`
   (proxied). Verify `stretches.delianpetrov.com` serves the new version
   (page contains "Wind-down" and "CryoGlow").
7. **Rollback**: GitHub Pages stays live from `main` until Delian says
   otherwise. To roll back, point the `stretches` CNAME back to
   `delian7.github.io`. Do NOT delete the repo or disable Pages.

## Free-tier note

Pages (unlimited sites/requests), Workers (100k req/day), D1 (5M rows
read / 100k written per day, 5 GB) — all free for this usage; one person
tapping a dashboard a few times a day is a rounding error.
