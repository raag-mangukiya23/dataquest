"""Demo personas and the scripted walkthrough. Shared by mock and live modes."""

from app.mocks import world as w
from app.schemas.demo import DemoCall, DemoPersona, DemoStep, DemoWalkthrough

DEMO_PASSWORD = "Prism@Demo2026"

# key, student, parent, location, scenario, highlights, has full fixture
_PERSONAS = [
    (
        "creative_risk_averse",
        "Ananya R.",
        "R. Raman",
        "Coimbatore, TN (641004)",
        "Analytical-creative student; parents want medicine and stability.",
        [
            "Moderate conflict index with bridge careers",
            "Design and private MBBS are financially infeasible",
            "Hyper-local agri-drone hidden gem",
        ],
        True,
    ),
    (
        "high_aptitude_low_budget",
        "Karthik S.",
        "S. Selvi",
        "Madurai, TN (625001)",
        "Top-percentile aptitude, family income about Rs 2.4 L a year.",
        [
            "Scholarship knapsack turns a stretch path into a comfortable one",
            "Government-quota pathways ranked first",
        ],
        False,
    ),
    (
        "rural_steam_innovator",
        "Meena K.",
        "K. Murugan",
        "Dharmapuri district, TN (636701)",
        "Hands-on tinkerer in a farming village with little career information around her.",
        ["Local opportunities by pincode", "Agri and energy careers surface from local problems"],
        False,
    ),
    (
        "loan_dependent_family",
        "Rahul P.",
        "P. Patil",
        "Pune, MH (411001)",
        "Wants robotics at a private college; the family can only fund it with an education loan.",
        ["EMI, burden ratio and payback years", "What-if: raising loan tolerance changes the funding class"],
        False,
    ),
    (
        "aligned_family",
        "Sara M.",
        "M. Joseph",
        "Bengaluru, KA (560001)",
        "Design-minded student whose parents back the same direction.",
        ["Low conflict index", "High robustness score: rankings barely move under weight changes"],
        False,
    ),
]


def personas(live_ids: dict[str, tuple[str, str | None]] | None = None) -> list[DemoPersona]:
    """live_ids maps persona key -> (student user id, latest run id) in live mode."""
    out = []
    for key, student, parent, loc, scenario, hl, full in _PERSONAS:
        out.append(
            DemoPersona(
                key=key,
                student_name=student,
                parent_name=parent,
                location=loc,
                scenario=scenario,
                highlights=hl,
                student_email=f"{key}.student@prism.example",
                parent_email=f"{key}.parent@prism.example",
                demo_password=DEMO_PASSWORD,
                student_id=live_ids[key][0]
                if live_ids and key in live_ids
                else (w.STUDENT_ID if full else w.sid("student", key)),
                baseline_run_id=live_ids[key][1]
                if live_ids and key in live_ids
                else (w.RUN_ID if full else None),
                fixture_available=bool(live_ids and key in live_ids) or full,
            )
        )
    return out


def walkthrough(live_ctx: dict | None = None) -> DemoWalkthrough:
    """live_ctx (live mode) = {"run": AnalysisRun, "student_id", "family_id"}; otherwise uses the mock run."""
    from app.mocks.builders import analysis_run

    live = live_ctx["run"] if live_ctx else analysis_run()
    run_id = live.run_id
    student_id = live_ctx["student_id"] if live_ctx else w.STUDENT_ID
    family_id = live_ctx["family_id"] if live_ctx else w.FAMILY_ID
    conflict, sens = live.conflict, live.sensitivity
    top = live.recommendations[0]
    run = f"/api/v1/analysis/runs/{run_id}"
    parent = {"Authorization": "Bearer <parent access token>"} if live_ctx else {"X-Mock-Role": "parent"}
    steps = [
        (
            "Credibility first",
            "Every weight, formula, data source and limitation is public and versioned.",
            DemoCall(method="GET", path="/api/v1/system/methodology"),
            ["data.formulas", "data.fairness_safeguards", "data.limitations"],
            30,
        ),
        (
            "The student's profile",
            "Five short instruments become one 19-dimension vector. No gender, caste or religion.",
            DemoCall(method="GET", path=f"/api/v1/students/{student_id}/traits"),
            ["data.top_riasec_code", "data.vector"],
            40,
        ),
        (
            "The parent's side, privately",
            "Parents enter money and hopes. The student never sees the raw figures.",
            DemoCall(method="GET", path=f"/api/v1/families/{family_id}/finance", headers=parent),
            ["data.allocatable_savings", "data.max_affordable_emi"],
            30,
        ),
        (
            "One run, fully explained",
            "Each career's score splits into six weighted parts, with the pathway costed "
            "against the family's budget.",
            DemoCall(
                method="POST", path="/api/v1/analysis/runs", headers=parent, body={"student_id": student_id}
            ),
            ["data.recommendations[0].contributions", "data.recommendations[0].financial", "data.buckets"],
            60,
        ),
        (
            "Where the family disagrees",
            f"Conflict index {conflict.index:.0f} out of 100 ({conflict.band.value}), its top three drivers, and "
            "bridge careers both sides accept.",
            DemoCall(method="GET", path=f"{run}/conflict", headers=parent),
            ["data.index", "data.top_drivers", "data.bridge_careers"],
            45,
        ),
        (
            "Same report, student view",
            "The student gets a gentle summary instead of the raw gaps.",
            DemoCall(method="GET", path=f"{run}/conflict"),
            ["data.visibility", "data.summary"],
            20,
        ),
        (
            "What if?",
            "Add Rs 8 lakh of savings and a higher loan tolerance, then watch funding classes and ranks move.",
            DemoCall(
                method="POST",
                path=f"{run}/what-if",
                headers=parent,
                body={
                    "label": "Add savings + accept loan",
                    "overrides": {"allocatable_savings": 1_400_000, "loan_tolerance": 0.7},
                },
            ),
            ["data.comparison.summary", "data.comparison.rank_correlation"],
            45,
        ),
        (
            "A 5-year plan",
            "Exams with dates, scholarship deadlines, skill gaps to close and a local project to start.",
            DemoCall(method="GET", path=f"{run}/roadmap"),
            ["data.phases", "data.scholarship_deadlines"],
            40,
        ),
        (
            "Hyper-local innovation",
            "Real problems in the student's own district, linked to careers and skills.",
            DemoCall(method="GET", path="/api/v1/local-opportunities?pincode=642001"),
            ["data[0].title", "data[0].starter_project"],
            30,
        ),
        (
            "Trust the ranking",
            f"Weights perturbed by 20 % in {sens.scenarios} scenarios: {top.career.name} stays first in "
            f"{sens.top1_stability:.0%} of them; the {sens.most_sensitive_weight.replace('_', ' ')} weight matters most. "
            "The input hash makes the run reproducible.",
            DemoCall(method="GET", path=run),
            [
                "data.sensitivity.robustness_score",
                "data.reproducibility",
                "data.recommendations[0].data_trust",
            ],
            30,
        ),
        (
            "Fair to every family",
            "Same student at Rs 2.4 lakh and Rs 25 lakh family income: the best fits stay visible, and no input "
            "uses gender, caste or religion. These checks run live on the current data.",
            DemoCall(method="GET", path="/api/v1/system/fairness"),
            ["data.passed", "data.probes", "data.protected_attributes_used"],
            25,
        ),
        (
            "Something to take home",
            "A one-page report in Tamil or Hindi and the exam and scholarship dates as a calendar file.",
            DemoCall(method="GET", path=f"{run}/report?lang=ta", headers=parent),
            ["(printable page)"],
            20,
        ),
        (
            "How current, how checked",
            "Recommendations are computed live on every request. This page shows how fresh each dataset is, "
            "which live feeds are on, and what share of figures we have checked against official sources.",
            DemoCall(method="GET", path="/api/v1/system/data-status"),
            ["data.statement", "data.datasets", "data.feeds"],
            25,
        ),
    ]
    out = [
        DemoStep(step=i, title=t, say=s, call=c, show=sh, seconds=sec)
        for i, (t, s, c, sh, sec) in enumerate(steps, 1)
    ]
    return DemoWalkthrough(
        persona_key="creative_risk_averse", total_seconds=sum(x.seconds for x in out), steps=out
    )
