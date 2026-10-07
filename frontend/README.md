# PRISM frontend

React + TypeScript + Tailwind app for PRISM Engine, wired to the FastAPI backend in `../backend`.

## Run it

Two terminals.

**1. Backend**:
```bash
cd backend
pip install -e ".[dev]"
python scripts/seed.py --demo --reset          # database + catalogue + 5 demo families
# macOS / Linux
MOCK_MODE=false DEMO_MODE=true DEMO_TODAY=2026-10-07 uvicorn app.main:app --port 8000
# Windows PowerShell
$env:MOCK_MODE="false"; $env:DEMO_MODE="true"; $env:DEMO_TODAY="2026-10-07"; uvicorn app.main:app --port 8000
```

**2. Frontend**:
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (calls to /api are proxied to the backend on :8000)
```

## Settings (`.env.example`)

| Variable | Meaning |
|---|---|
| `VITE_PROXY_TARGET` | Backend address for the development proxy (default `http://localhost:8000`). |
| `VITE_API_URL` | For production builds whose backend is on another origin. Empty = same origin. |
| `VITE_DATA_MODE` | `api` (default) or `fixtures`, which answers from saved sample responses in `src/fixtures`. Use it as an offline backup for demos. |
| `VITE_AUTH_MODE` | `live` (default, real sign-in) or `mock` (developers only; backend in `MOCK_MODE`). |
| `VITE_DEV_TOOLS` | `true` adds the developer panel: demo quick sign-in, role switcher and presenter mode. On in `.env.development`; off in production builds. |

## Build and checks

```bash
npm run build          # type check + production bundle in dist/
npm test               # unit tests (money formatting, API client)
npm run fixtures       # refresh src/fixtures from backend/contracts/fixtures
npm run types          # regenerate src/api/schema.ts from backend/contracts/openapi.json
node scripts/shoot.mjs --role parent --paths /results,/family --out ../shots   # screenshots + error report
```

## Deploy

- **Static hosting (Vercel, Netlify):** run `npm run build` and publish `dist/` with an SPA fallback to `index.html`. Set `VITE_API_URL` to the backend URL, and add the site's URL to the backend's `CORS_ORIGINS`.
- **Offline backup:** `VITE_DATA_MODE=fixtures npm run build` gives a build that needs no backend.

## Developer and judging accounts

These are only for developers and judges, never shown in the product UI. They need the backend seeded with `--demo` and `DEMO_MODE=true`. The password for all is `Prism@Demo2026`.

| Who | Email |
|---|---|
| Ananya (student, Coimbatore) and parent | `creative_risk_averse.student@prism.example`, `creative_risk_averse.parent@prism.example` |
| Karthik (low income) | `high_aptitude_low_budget.student@…`, `…parent@…` |
| Meena (rural innovator) | `rural_steam_innovator.student@…`, `…parent@…` |
| Rahul (loan-dependent) | `loan_dependent_family.student@…`, `…parent@…` |
| Sara (aligned family) | `aligned_family.student@…`, `…parent@…` |
| School counsellor | `counsellor@prism.example` |
| Admin | `admin@prism.example` |

## Layout

```
src/api          client (response unwrapping, sign-in tokens, fixtures), endpoints (one function per API call), queries, types
src/state        session (sign-in), settings (theme, text size, motion, language, parent mode)
src/components   ui (kit), score (score bars, badges, Money), shell (layout, nav, search, deadline bell) and one folder per screen group
src/pages        one file per route
src/devtools     developer panel and presenter mode (bundled only with VITE_DEV_TOOLS=true)
index.html       includes the loading screen (inline SVG, shown before any JavaScript runs)
```
