# prism-engine — source

Front-end source plus the shared scoring core and the Worker API.
See the [root README](../README.md) for the architecture and the pipeline.

```
engine.js    pure isomorphic scoring core — no DOM, no network.
             Owns REGIONS, INTERESTS, TRAITS, PRIORITY and the 15 CAREERS
             (cost / salary / demand / exams / funding tables live here).
             Imported by BOTH app.js (browser) and api.js (Worker), so the
             client and the server cannot disagree about a score.
api.js       Cloudflare Worker: routing, input validation, D1 persistence,
             same-origin + throttle guards. Not served to the browser.
app.js       Browser layer: renders the roadmap, wires the simulator, draws the
             radar, syncs with the API, and drives the battery UI.
battery.js   The 43-item aptitude battery: item bank, weighted scoring, and
             resolution of the full engine profile from an answer sheet.
motion.js    Motion layer — opening sequence, WebGL dispersion background,
             scroll choreography, odometer counters, radar morphing.
             Progressive enhancement only: fails soft, reduced-motion aware.
index.html   All sections, including #simulator, #battery and #intel.
styles.css   Theme, layout, responsive rules, battery section.
motion.css   Motion styles + the opening sequence (resolves on pure CSS).
```

## Run it

The frontend alone needs no build step and no dependencies:

```bash
python3 -m http.server 3000 --bind 0.0.0.0     # http://localhost:3000
```

Without an API the site still works — it scores locally and reports that the engine
index is unreachable. For the full stack (API + local D1), see `../deploy`:

```bash
cd ../deploy && npx wrangler dev --port 3000 --ip 0.0.0.0
```

## Editing the domain data

Career cost, salary, demand and funding tables are in `engine.js` (`CAREERS`,
`REGIONS`, `INTERESTS`, `TRAITS`). Change them there — never in a copy — because both
the browser and the Worker read the same definitions.
