#!/usr/bin/env bash
# PRISM: one-command start on macOS / Linux. Run from anywhere: bash run_site.sh
set -euo pipefail
cd "$(dirname "$0")/backend"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -e ".[dev]"
python scripts/seed.py
echo "PRISM is running at http://localhost:8000 (Ctrl+C to stop)"
MOCK_MODE=false python -m uvicorn app.main:app --port 8000
