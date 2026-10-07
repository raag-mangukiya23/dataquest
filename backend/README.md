# PRISM Engine — Backend

FastAPI backend for **PRISM Engine: Multi-Dimensional STEAM Career Guidance & Hyper-Local Innovation Platform**
(DataQuest 3.0). Current status: **Phase 0**: contracts, MOCK_MODE and the ML plug-in point.

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

## Tests & lint

```bash
pytest                 # contract + predictor tests
ruff check . && ruff format --check .
python scripts/export_contracts.py   # regenerate contracts/openapi.json + fixtures
```

Docs: `../docs/ARCHITECTURE.md`, `../docs/ER_DIAGRAM.md`, `../docs/API_CONTRACT.md`.
