"""Export openapi.json and one example JSON per endpoint (MOCK_MODE) into contracts/.

Person 1 can build the UI straight from contracts/fixtures/*.json; they are byte-for-byte what
the API returns in MOCK_MODE. Run from backend/:  python scripts/export_contracts.py
"""

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ["MOCK_MODE"] = "true"
os.environ["RATE_LIMIT_PER_MINUTE"] = "0"
os.environ["LOG_LEVEL"] = "WARNING"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402
from app.mocks import world as w  # noqa: E402

RUN = w.RUN_ID
PARENT = {"X-Mock-Role": "parent"}
ADMIN = {"X-Mock-Role": "admin"}

CALLS = [
    (
        "auth_login",
        "POST",
        "/api/v1/auth/login",
        {"email": "student.demo@prism.example", "password": "demo-pass"},
        {},
    ),
    ("auth_me", "GET", "/api/v1/auth/me", None, {}),
    ("student_profile", "GET", "/api/v1/students/me/profile", None, {}),
    ("student_traits", "GET", f"/api/v1/students/{w.STUDENT_ID}/traits", None, {}),
    ("family_me", "GET", "/api/v1/families/me", None, {}),
    ("family_invite", "POST", "/api/v1/families/invites", None, PARENT),
    ("family_finance_parent_view", "GET", f"/api/v1/families/{w.FAMILY_ID}/finance", None, PARENT),
    ("family_finance_student_view", "GET", f"/api/v1/families/{w.FAMILY_ID}/finance", None, {}),
    ("parent_preferences", "GET", f"/api/v1/families/{w.FAMILY_ID}/preferences", None, PARENT),
    ("consents", "GET", "/api/v1/consents", None, {}),
    ("assessment_instruments", "GET", "/api/v1/assessments/instruments", None, {}),
    ("assessment_questions_riasec", "GET", "/api/v1/assessments/riasec_v1/questions", None, {}),
    (
        "assessment_submit",
        "POST",
        "/api/v1/assessments/riasec_v1/submit",
        {"answers": [{"question_id": "q1", "value": "4"}]},
        {},
    ),
    ("analysis_run_parent_view", "POST", "/api/v1/analysis/runs", {"student_id": w.STUDENT_ID}, PARENT),
    ("analysis_run_student_view", "GET", f"/api/v1/analysis/runs/{RUN}", None, {}),
    ("analysis_runs_list", "GET", "/api/v1/analysis/runs", None, {}),
    (
        "analysis_compare",
        "GET",
        f"/api/v1/analysis/compare?run_a={RUN}&run_b={w.WHATIF_RUN_ID}",
        None,
        PARENT,
    ),
    (
        "analysis_what_if",
        "POST",
        f"/api/v1/analysis/runs/{RUN}/what-if",
        {
            "overrides": {"allocatable_savings": 1_400_000, "loan_tolerance": 0.7},
            "label": "Add savings + accept loan",
        },
        PARENT,
    ),
    ("conflict_parent_view", "GET", f"/api/v1/analysis/runs/{RUN}/conflict", None, PARENT),
    ("conflict_student_view", "GET", f"/api/v1/analysis/runs/{RUN}/conflict", None, {}),
    ("swot", "GET", f"/api/v1/analysis/runs/{RUN}/swot", None, {}),
    ("roadmap", "GET", f"/api/v1/analysis/runs/{RUN}/roadmap", None, {}),
    ("careers_list", "GET", "/api/v1/careers", None, {}),
    ("career_detail", "GET", "/api/v1/careers/data-scientist", None, {}),
    ("career_alternatives", "GET", "/api/v1/careers/data-scientist/alternatives", None, {}),
    ("regions", "GET", "/api/v1/regions", None, {}),
    ("market_trends", "GET", "/api/v1/market/trends?region_code=IN-TN-CBE", None, {}),
    ("pathways", "GET", "/api/v1/pathways", None, {}),
    ("exams", "GET", "/api/v1/exams", None, {}),
    ("scholarships", "GET", "/api/v1/scholarships", None, {}),
    ("local_opportunities", "GET", "/api/v1/local-opportunities?pincode=642001", None, {}),
    ("admin_analytics", "GET", "/api/v1/admin/analytics", None, ADMIN),
    (
        "admin_refresh",
        "POST",
        "/api/v1/admin/data/refresh",
        {"datasets": ["market_signals"], "dry_run": True},
        ADMIN,
    ),
    ("system_health", "GET", "/api/v1/system/health", None, {}),
    ("system_methodology", "GET", "/api/v1/system/methodology", None, {}),
    ("error_not_found", "GET", "/api/v1/analysis/runs/unknown", None, {}),
    ("error_validation", "POST", "/api/v1/auth/register", {"email": "not-an-email"}, {}),
    ("compat_login", "POST", "/api/login", {"email": "student.demo@prism.example", "password": "x"}, {}),
    ("compat_get_user", "GET", f"/api/users/{w.STUDENT_USER_ID}", None, {}),
    ("compat_predict", "POST", "/api/predict", {"user_id": w.STUDENT_USER_ID}, {}),
    ("compat_result", "GET", f"/api/results/{RUN}", None, {}),
]


def _stable(obj):
    """Replace volatile values so regenerated fixtures diff cleanly."""
    if isinstance(obj, dict):
        out = {k: _stable(v) for k, v in obj.items()}
        if "request_id" in out:
            out["request_id"] = "00000000000000000000000000000000"
        if "time" in out and isinstance(out["time"], str):
            out["time"] = "2026-10-07T09:30:00Z"
        return out
    if isinstance(obj, list):
        return [_stable(x) for x in obj]
    return obj


def main() -> None:
    app = create_app()
    client = TestClient(app)
    out_dir = ROOT / "contracts"
    fx = out_dir / "fixtures"
    fx.mkdir(parents=True, exist_ok=True)
    (out_dir / "openapi.json").write_text(json.dumps(app.openapi(), indent=2) + "\n")
    index = []
    for name, method, path, body, headers in CALLS:
        r = client.request(method, path, json=body, headers=headers)
        (fx / f"{name}.json").write_text(json.dumps(_stable(r.json()), indent=2, ensure_ascii=False) + "\n")
        index.append(
            {
                "name": name,
                "method": method,
                "path": path,
                "status": r.status_code,
                "headers": headers,
                "request": body,
            }
        )
    (fx / "_index.json").write_text(json.dumps(index, indent=2) + "\n")
    print(f"wrote openapi.json and {len(CALLS)} fixtures to {out_dir}")


if __name__ == "__main__":
    main()
