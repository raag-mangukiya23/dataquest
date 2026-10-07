# PRISM Engine — DataQuest 3.0

Multi-Dimensional STEAM Career Guidance & Hyper-Local Innovation Platform.

## Run it

- **Windows:** double-click `run_site.bat`.
- **macOS / Linux:** run `bash run_site.sh`.

Either one sets up Python packages and the database on first run, then opens http://localhost:8000. It needs
Python 3.11 or newer.

- `site/`: the public site (served by the backend at `/`)
- `backend/`: FastAPI service (see `backend/README.md` for quick start)
- `docs/ARCHITECTURE.md`: assumptions, layering, MOCK_MODE, folder tree
- `docs/ER_DIAGRAM.md`: database design (Mermaid)
- `docs/API_CONTRACT.md`: endpoint list, examples, privacy matrix
- `docs/DEMO_PLAN.md`: demo script, fail-safes, persona switcher, judge Q&A
- `docs/DATA_TRUTH.md`: what "real-time" means here, how every figure is checked, sources, pre-demo audit
- `docs/QUESTIONNAIRE.md`: the 74-item questionnaire, scoring, quality checks, pilot plan
- `docs/FRONTEND_STITCH_PROMPTS.md`: Google Stitch prompts for every screen, wired to the API
- `backend/contracts/`: frozen OpenAPI spec and example JSON for every endpoint
