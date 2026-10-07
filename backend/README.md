# PRISM Engine — Backend

FastAPI backend for **PRISM Engine: Multi-Dimensional STEAM Career Guidance & Hyper-Local Innovation Platform**
(DataQuest 3.0). Current status: real scoring engine, database, seed catalog and login are done (Phases 0-5).

## Quick start (MOCK_MODE, no database)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env            # MOCK_MODE=true by default
uvicorn app.main:app --reload   # http://localhost:8000/docs
```

```bash
curl -s localhost:8000/api/v1/system/health | jq
curl -s -X POST localhost:8000/api/v1/analysis/runs -H 'Content-Type: application/json' \
     -H 'X-Mock-Role: parent' -d '{"student_id":"132394f2-e097-5d31-8e5b-bfa2fade9b38"}' | jq '.data.recommendations[0]'
curl -s -X POST localhost:8000/api/predict -H 'Content-Type: application/json' -d '{}' | jq
```

## Live mode (database + real engine)

```bash
python scripts/seed.py --reset   # migrate, load data/seed/*.json, create 5 demo families (~4 s)
MOCK_MODE=false uvicorn app.main:app --reload
curl -s -X POST localhost:8000/api/v1/auth/login -H 'Content-Type: application/json' \
     -d '{"email":"creative_risk_averse.parent@prism.example","password":"Prism@Demo2026"}' | jq .data.access_token
```

SQLite is the default (`DATABASE_URL=sqlite:///./prism.db`). For PostgreSQL set
`DATABASE_URL=postgresql+psycopg://...`; Postgres also gets immutability triggers on runs and the
admin analytics materialized view. Demo logins are listed by `GET /api/v1/demo/personas`.
Fees are stored on each pathway row per quota (government / management), not on the institution.

## For teammates

- **Frontend (Person 1)**: build against `contracts/fixtures/*.json` or the running mock server. Shapes are
  identical to live mode. Use the `X-Mock-Role` header to see the student and parent views.
- **ML (Person 3)**: put a `predict(vector: dict[str, float]) -> dict` in a `.py` file and set
  `ML_MODEL_PATH=/path/to/model.py`. Input: the 19 canonical dimensions (`app/core/dimensions.py`).
  Output: `{"scores": {domain: 0..1}, "confidence": 0..1}` (the flat or `domain_scores` shapes also work).
  If the model is missing or fails, the API falls back to a deterministic cosine model.

## Data and questionnaire tools

```bash
python scripts/data_audit.py --demo --strict     # quality gates + figures the demo still shows unchecked
python scripts/pilot_analysis.py responses.csv   # item analysis after a questionnaire pilot
```

Optional live job-postings feed: set `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` (free at developer.adzuna.com).
If the demo network blocks the API, fetch on any open connection and import offline:

```bash
python scripts/market.py fetch --out data/market/postings.csv   # on a hotspot / at home
python scripts/market.py import data/market/postings.csv        # on the demo machine, no internet needed
```

Each import publishes a new dataset version; older runs stay reproducible and are flagged `is_outdated`.

## Plain-language summaries (optional language model)

`GET /api/v1/analysis/runs/{id}/narrative?lang=en|ta|hi` explains a run in English, Tamil or Hindi.
With `GROK_API_KEY` set, xAI Grok (or any OpenAI-compatible endpoint via `GROK_BASE_URL`) rephrases it.
The model only receives the anonymised `facts` shown in the response; an answer with any number not in
those facts is rejected. Without a key, or when the network blocks the call, fixed templates are used.
The language model never scores careers: ranking stays deterministic and reproducible.

## Tests & lint

```bash
pytest                 # contracts, engine properties, fairness, golden personas, live mode
ruff check . && ruff format --check .
python scripts/export_contracts.py   # regenerate contracts/openapi.json + fixtures
```

Docs: `../docs/ARCHITECTURE.md`, `../docs/ER_DIAGRAM.md`, `../docs/API_CONTRACT.md`.
