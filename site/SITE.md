# PRISM Engine — Sites project

- siteId: f7b72b7c-e7cb-48ba-a492-85b6c1c42d28
- preview:    https://site-18e1b9309267495da7b0b339d34a7c29.freebuff.page
- production: https://site-332c9d8b69464e5e8cf08cd45d87e80b.freebuff.page

Both environments have their own D1 database bound as `DB`.

## Deploy bundle
`../deploy` — built by `node ../deploy/build.mjs`:
- `worker.js` — engine.js + api.js inlined, no runtime imports
- `manifest.json` — entrypoint/compatibilityDate/modules/assets
- `public/` — index.html, styles.css, motion.css, engine.js, battery.js, app.js, motion.js

Redeploy with `sites_deploy` (a new `requestId` per change). Publish to production
only with explicit authorisation.

## API
- `GET  /api/health`          → engine + storage status
- `GET  /api/market?region=`  → 15 careers, demand-sorted for that region
- `POST /api/assess`          → run the engine on a profile, persist it, return the roadmap
- `GET  /api/assess/:id`      → reproduce a stored roadmap (drives `?r=<id>` share links)
- `POST /api/battery`         → record one aptitude-battery sitting (scores recomputed server-side)
- `GET  /api/insights`        → cohort aggregates, now including measured aptitude by domain

Writes are same-origin only (403 otherwise) and rate limited per client IP.

## Local checks
`wrangler dev --port 8788` in `../deploy` runs the real bundle against local D1.
