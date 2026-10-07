"""Data audit: quality gates plus a verification report, and the pre-demo checklist.

Usage (from backend/):
  python scripts/data_audit.py            # quality gates + verification share per dataset
  python scripts/data_audit.py --demo     # also list every figure the demo shows that is still unchecked
  python scripts/data_audit.py --demo --strict   # exit 1 if any demo figure is unchecked (pre-demo gate)

Exit code 1 when any quality gate fails (errors), or with --strict when demo figures are unchecked.
Today this audits the fixture world; from Phase 1 it audits the seeded database.
"""

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("MOCK_MODE", "true")
os.environ.setdefault("LOG_LEVEL", "WARNING")

from app.core.clock import today  # noqa: E402
from app.etl.quality import audit  # noqa: E402
from app.etl.sources import DATASETS, SOURCES  # noqa: E402
from app.mocks import builders as b  # noqa: E402
from app.mocks import world as w  # noqa: E402
from app.schemas.common import VerificationStatus  # noqa: E402

CHECKED = (VerificationStatus.VERIFIED, VerificationStatus.SECONDARY)
DEMO_PINCODE = "642001"

WHERE_TO_CHECK = {
    "market demand": "Naukri JobSpeak monthly report or the Adzuna feed (set ADZUNA_APP_ID / ADZUNA_APP_KEY)",
    "salary band": "Adzuna mean advertised salary, or PLFS earnings tables (mospi.gov.in)",
    "fees": "the institution's fee notice for 2026-27, or the state fee committee order",
    "scholarship": "the scheme page on scholarships.gov.in or the provider's notice",
    "exam dates": "the information bulletin on nta.ac.in or the state counselling authority",
    "local problem": "the district administration, an FPO or industry association, or a news report",
}


def _where(name: str) -> str:
    if "(illustrative)" in name:
        return "this is a made-up placeholder: replace it with a real scheme or remove it before the demo"
    for prefix, hint in WHERE_TO_CHECK.items():
        if name.startswith(prefix):
            return hint
    return "the official source for this dataset"


def demo_checklist() -> list[tuple[str, str]]:
    """Every figure the scripted demo puts on screen that has not been checked against a source."""
    seen: dict[str, str] = {}
    for rec in b.analysis_run().recommendations:
        for i in rec.data_trust.inputs:
            if i.verification not in CHECKED:
                name = (
                    f"{i.name}: {rec.career.name}" if i.name in ("market demand", "salary band") else i.name
                )
                seen.setdefault(name, _where(i.name))
    for row in w.LOCAL_OPPORTUNITIES:
        opp = b.local_opportunity(row)
        if DEMO_PINCODE in opp.pincodes and opp.provenance.verification not in CHECKED:
            seen.setdefault(f"local problem: {opp.title}", _where("local problem"))
    return sorted(seen.items())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--demo", action="store_true", help="list demo figures that are still unchecked")
    ap.add_argument("--strict", action="store_true", help="fail if any demo figure is unchecked")
    args = ap.parse_args()

    report = audit(b.catalog(), today())
    print(f"Data audit on {today().isoformat()} (dataset {w.DATASET_VERSION})\n")
    print(
        f"{'dataset':22s}{'rows':>6s}{'verified':>10s}{'secondary':>11s}{'unchecked':>11s}"
        f"{'disputed':>10s}  freshness  sources"
    )
    total = checked = 0
    for key, st in report.stats.items():
        total += st.rows
        checked += st.verified + st.secondary
        names = ", ".join(SOURCES[s].name for s in DATASETS[key].sources)
        print(
            f"{key:22s}{st.rows:6d}{st.verified:10d}{st.secondary:11d}{st.unverified:11d}{st.disputed:10d}"
            f"  {st.freshness.value:9s}  {names}"
        )
    share = checked / total if total else 0
    print(f"\n{checked} of {total} figures checked ({share:.0%}).")

    if report.issues:
        print("\nQuality gate findings:")
        for i in report.issues:
            print(f"  [{i.severity}] {i.dataset}/{i.key}: {i.rule} - {i.message}")
    else:
        print("All quality gates passed.")

    exit_code = 1 if report.errors else 0
    if args.demo:
        items = demo_checklist()
        print(f"\nVerify before the demo ({len(items)} figures shown on screen are still estimates):")
        for name, where in items:
            print(f"  [ ] {name}\n        check: {where}")
        if args.strict and items:
            exit_code = 1
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
