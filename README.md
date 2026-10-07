# PRISM Engine — DataQuest 3.0

Multi-Dimensional STEAM Career Guidance & Hyper-Local Innovation Platform.

- `backend/`: FastAPI service (see `backend/README.md` for quick start)
- `docs/ARCHITECTURE.md`: assumptions, layering, MOCK_MODE, folder tree
- `docs/ER_DIAGRAM.md`: database design (Mermaid)
- `docs/API_CONTRACT.md`: endpoint list, examples, privacy matrix
- `docs/DEMO_PLAN.md`: demo script, fail-safes, persona switcher, judge Q&A
- `docs/DATA_TRUTH.md`: what "real-time" means here, how every figure is checked, sources, pre-demo audit
- `docs/QUESTIONNAIRE.md`: the 74-item questionnaire, scoring, quality checks, pilot plan
- `docs/FRONTEND_STITCH_PROMPTS.md`: Google Stitch prompts for every screen, wired to the API
- `docs/FRONTEND_SHOWPIECE_PROMPT.md`: Claude Code prompt for the animated frontend (builds on `docs/FRONTEND_CLAUDE_CODE_PROMPT.md`)
- `backend/contracts/`: frozen OpenAPI spec and example JSON for every endpoint
