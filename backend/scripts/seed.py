"""Create the schema, load the seed catalog and, for development or judging only, the five demo families.

  python scripts/seed.py                 # migrate + catalog (what a real deployment runs)
  python scripts/seed.py --demo          # also create the demo families (idempotent)
  python scripts/seed.py --demo --reset  # wipe and recreate the demo families

Demo accounts share a published password, so they are refused when APP_ENV=production.

Uses DATABASE_URL (SQLite by default). All demo accounts use the password in app/mocks/demo_families.py.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("LOG_LEVEL", "WARNING")

from sqlalchemy import delete, select, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.assessment.bank import get_bank  # noqa: E402
from app.core.clock import today  # noqa: E402
from app.mocks import demo_families as df  # noqa: E402
from app.mocks.persona import SKIPPED_ITEMS, answers_for  # noqa: E402
from app.models import catalog as cm  # noqa: E402
from app.models import identity as im  # noqa: E402
from app.schemas.analysis import AnalysisRunRequest  # noqa: E402
from app.schemas.assessment import SubmitAnswersRequest  # noqa: E402
from app.schemas.auth import RegisterRequest  # noqa: E402
from app.schemas.common import Role  # noqa: E402
from app.schemas.family import (  # noqa: E402
    ConsentIn,
    ConsentType,
    FamilyFinanceIn,
    JoinFamilyRequest,
    ParentPreferencesIn,
    RankedPreference,
)
from app.schemas.profiles import StudentProfileIn  # noqa: E402


def migrate(url: str | None = None) -> None:
    from alembic.config import Config

    from alembic import command

    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "alembic"))
    if url:
        cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")


def _demo_emails() -> list[str]:
    out = [df.ADMIN_EMAIL, df.COUNSELLOR_EMAIL]
    for f in df.FAMILIES:
        out += [df.student_email(f["key"]), df.parent_email(f["key"])]
    return out


def wipe_demo(db: Session) -> None:
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SET LOCAL prism.allow_erasure = 'on'"))  # sanctioned erasure of demo data only
    ids = list(db.scalars(select(im.User.id).where(im.User.email.in_(_demo_emails()))))
    if ids:
        db.execute(delete(im.Family).where(im.Family.created_by.in_(ids)))
        db.execute(delete(im.User).where(im.User.id.in_(ids)))
    db.flush()


def seed_demo(db: Session, reset: bool = False) -> int:
    from app.core.security import hash_password
    from app.services.live import LiveGateway

    if reset:
        wipe_demo(db)
    elif db.scalar(select(im.User).where(im.User.email == df.student_email(df.FAMILIES[0]["key"]))):
        return 0
    gw = LiveGateway(db)
    db.add(
        im.User(
            email=df.ADMIN_EMAIL,
            password_hash=hash_password(df.DEMO_PASSWORD),
            full_name="PRISM Admin",
            role="admin",
        )
    )
    counsellor = im.User(
        email=df.COUNSELLOR_EMAIL,
        password_hash=hash_password(df.DEMO_PASSWORD),
        full_name="School Counsellor",
        role="educator",
    )
    db.add(counsellor)
    db.flush()
    careers = {c.slug: c.id for c in db.scalars(select(cm.Career))}
    bank = get_bank()
    for fam in df.FAMILIES:
        st = gw.register(
            RegisterRequest(
                email=df.student_email(fam["key"]),
                password=df.DEMO_PASSWORD,
                full_name=fam["student"],
                role=Role.STUDENT,
                date_of_birth=df.DEMO_DOB,
            )
        ).user
        pa = gw.register(
            RegisterRequest(
                email=df.parent_email(fam["key"]),
                password=df.DEMO_PASSWORD,
                full_name=fam["parent"],
                role=Role.PARENT,
            )
        ).user
        sp = gw.principal(st.id)
        gw.put_student_profile(sp, StudentProfileIn(**fam["profile"]))
        family = gw.create_family(sp)
        code = gw.create_invite(sp).invite_code
        gw.join_family(gw.principal(pa.id), JoinFamilyRequest(invite_code=code, relation=fam["relation"]))
        pp = gw.principal(pa.id)
        gw.create_consent(
            pp, ConsentIn(consent_type=ConsentType.MINOR_DATA_PROCESSING, subject_user_id=st.id, granted=True)
        )
        gw.create_consent(
            gw.principal(st.id),
            ConsentIn(
                consent_type=ConsentType.SHARE_RAW_ANSWERS_WITH_PARENT, subject_user_id=st.id, granted=True
            ),
        )
        gw.put_finance(pp, family.id, FamilyFinanceIn(**fam["finance"]))
        gw.put_preferences(
            pp,
            family.id,
            ParentPreferencesIn(
                preferences=[
                    RankedPreference(
                        rank=x["rank"],
                        career_id=careers[x["career"]] if "career" in x else None,
                        domain=x.get("domain"),
                        note=x.get("note"),
                    )
                    for x in fam["preferences"]
                ]
            ),
        )
        skipped = frozenset(SKIPPED_ITEMS) if fam.get("skip_financial_items") else frozenset()
        sp = gw.principal(st.id)
        for code_, inst in bank.instruments.items():
            gw.submit(sp, code_, SubmitAnswersRequest(answers=answers_for(inst, fam["vector"], skipped)))
        db.add(
            im.EducatorAssignment(
                educator_user_id=counsellor.id,
                student_user_id=st.id,
                school_name="Demo Higher Secondary School",
            )
        )
        gw.create_run(pp, AnalysisRunRequest(student_id=st.id))
    db.flush()
    return len(df.FAMILIES)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "--demo", action="store_true", help="create the demo families (development / judging only)"
    )
    ap.add_argument("--reset", action="store_true", help="with --demo: wipe and recreate the demo families")
    args = ap.parse_args()
    from app.core.config import get_settings

    if args.demo and get_settings().app_env.lower() in ("prod", "production"):
        print("Refusing to create demo accounts with APP_ENV=production")
        return 2

    from app.db.session import get_sessionmaker
    from app.etl import loader

    migrate()
    with get_sessionmaker()() as db:
        if db.scalar(select(cm.DatasetVersion).where(cm.DatasetVersion.is_active.is_(True))) is None:
            res = loader.load(db, today(), label="seed-2026-09-30")
            if res["status"] != "completed":
                print("Catalog failed quality gates:\n  " + "\n  ".join(res["errors"]))
                return 1
            print(f"Catalog loaded: {res['counts']} ({len(res['warnings'])} warnings)")
        else:
            print("Catalog already loaded (use POST /api/v1/admin/data/refresh to load a new version)")
        if args.demo:
            n = seed_demo(db, reset=args.reset)
            print(
                f"Demo families created: {n}"
                if n
                else "Demo families already present (use --reset to recreate)"
            )
        db.commit()
    if args.demo:
        print(f"Demo password for every demo account: {df.DEMO_PASSWORD}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
