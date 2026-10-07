"""Pure follow-through logic shared by mock and live modes: deadlines, calendar files, the loan explainer,
the printable family report and the fairness probes. No database access here."""

from __future__ import annotations

import html
import json
from dataclasses import fields, replace
from datetime import UTC, date, datetime, timedelta
from functools import lru_cache
from pathlib import Path

from app.engine import finance
from app.engine.config import DEFAULT_CONFIG, ScoringConfig
from app.engine.types import CatalogInput, FamilyInput, StudentInput
from app.schemas.analysis import AnalysisRun
from app.schemas.catalog import DateStatus
from app.schemas.common import Bucket, Provenance, Role
from app.schemas.engagement import (
    DeadlineItem,
    DeadlineKind,
    Deadlines,
    FairnessProbe,
    FairnessReport,
    LoanExplanation,
    LoanOption,
    LoanSchemeCheck,
)
from app.schemas.reports import Language

SEED_DIR = Path(__file__).resolve().parents[2] / "data" / "seed"
PROTECTED = ("gender", "sex", "caste", "category", "religion", "community", "tribe", "disability", "name")


# ---------------------------------------------------------------- deadlines
def deadlines(run: AnalysisRun, cat: CatalogInput, today: date, horizon_days: int = 365) -> Deadlines:
    """Exam registrations, exam dates and scholarship deadlines for the courses in this run."""
    pathways = {p.id: p for p in cat.pathways}
    schols = {s.id: s for s in cat.scholarships}
    end = today + timedelta(days=horizon_days)
    items: dict[str, DeadlineItem] = {}

    def add(
        ref: str, kind: DeadlineKind, title: str, due: date | None, status: DateStatus, career: str, url, src
    ):
        if due is None or not today <= due <= end:
            return
        if ref in items:
            if career not in items[ref].for_careers:
                items[ref].for_careers.append(career)
            return
        items[ref] = DeadlineItem(
            ref_id=ref,
            kind=kind,
            title=title,
            due=due,
            days_left=(due - today).days,
            date_status=status,
            for_careers=[career],
            official_url=url,
            source_name=src,
        )

    for rec in run.recommendations[:10]:
        name = rec.career.name
        for fa in [rec.financial, *rec.alternative_pathways]:
            p = pathways.get(fa.pathway_id)
            for code in p.entrance_exam_codes if p else []:
                exam = cat.exams.get(code)
                if exam is None:
                    continue
                for s in exam.sessions:
                    base = f"exam:{code}:{s.cycle_year}:{s.session_no}"
                    label = f"{exam.name} {s.cycle_year}" + (
                        f" (session {s.session_no})" if len(exam.sessions) > 1 else ""
                    )
                    src = exam.provenance.source_name
                    add(
                        f"{base}:reg",
                        DeadlineKind.EXAM_REGISTRATION,
                        f"Last day to register: {label}",
                        s.registration_close,
                        s.registration_status,
                        name,
                        exam.official_url,
                        src,
                    )
                    add(
                        f"{base}:exam",
                        DeadlineKind.EXAM,
                        f"Exam starts: {label}",
                        s.exam_start,
                        s.exam_date_status,
                        name,
                        exam.official_url,
                        src,
                    )
            for pick in fa.scholarship_plan:
                sc = schols.get(pick.scholarship_id)
                if sc is not None:
                    add(
                        f"scholarship:{sc.id}",
                        DeadlineKind.SCHOLARSHIP,
                        f"Scholarship deadline: {sc.name}",
                        sc.deadline,
                        sc.deadline_status,
                        name,
                        sc.provenance.source_url,
                        sc.provenance.source_name,
                    )
    ordered = sorted(items.values(), key=lambda i: (i.due, i.ref_id))
    return Deadlines(
        student_id=run.student_id,
        run_id=run.run_id,
        as_of=today,
        items=ordered,
        notice="Dates marked tentative or estimated can move. Always confirm on the official website before "
        "the deadline.",
    )


def _ics_text(s: str) -> str:
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def to_ics(d: Deadlines, now: datetime | None = None) -> str:
    """RFC 5545 calendar with all-day events and a 3-day alarm. Imports into Google Calendar or a phone."""
    stamp = (now or datetime.now(UTC)).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//PRISM Engine//Deadlines//EN",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:PRISM deadlines",
    ]
    for i in d.items:
        desc = f"For: {', '.join(i.for_careers)}. Date is {i.date_status.value}. Source: {i.source_name}."
        if i.official_url:
            desc += f" Check: {i.official_url}"
        lines += [
            "BEGIN:VEVENT",
            f"UID:{i.ref_id.replace(':', '-')}-{d.student_id[:8]}@prism-engine",
            f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{i.due.strftime('%Y%m%d')}",
            f"DTEND;VALUE=DATE:{(i.due + timedelta(days=1)).strftime('%Y%m%d')}",
            f"SUMMARY:{_ics_text(i.title)}",
            f"DESCRIPTION:{_ics_text(desc)}",
            *([f"URL:{i.official_url}"] if i.official_url else []),
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            "TRIGGER:-P3D",
            f"DESCRIPTION:{_ics_text(i.title)}",
            "END:VALARM",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    out = []
    for line in lines:  # fold at 75 octets as the RFC asks
        b = line.encode()
        while len(b) > 75:
            cut = 75
            while (b[cut] & 0xC0) == 0x80:  # do not split a UTF-8 character
                cut -= 1
            out.append(b[:cut].decode())
            b = b" " + b[cut:]
        out.append(b.decode())
    return "\r\n".join(out) + "\r\n"


# ---------------------------------------------------------------- loan explainer
@lru_cache
def loan_schemes() -> list[dict]:
    return json.loads((SEED_DIR / "loan_schemes.json").read_text())["loan_schemes"]


def explain_loan(
    amount: int,
    course_years: int,
    annual_income: int | None,
    institution_tier: int | None,
    rate: float | None = None,
    cfg: ScoringConfig = DEFAULT_CONFIG,
) -> LoanExplanation:
    r = cfg.loan_rate if rate is None else rate
    cfg = replace(cfg, loan_rate=r)
    moratorium_years = course_years + cfg.moratorium_extra_years
    checks: list[LoanSchemeCheck] = []
    morat_rate, covered = r, 0
    for s in loan_schemes():
        if annual_income is None:
            applies, why = None, "Tell us the family income to check."
        elif annual_income > s["income_limit"]:
            applies, why = False, f"Family income is above Rs {s['income_limit']:,}."
        elif s["key"] == "pm-vidyalaxmi" and institution_tier is None:
            applies, why = (
                None,
                "Only for students admitted to top-ranked institutions (QHEIs); check your college.",
            )
        elif s["key"] == "pm-vidyalaxmi" and institution_tier != 1:
            applies, why = False, "Only for top-ranked institutions (QHEIs)."
        else:
            applies, why = True, f"Family income is within Rs {s['income_limit']:,}."
        if applies and s["key"] == "csis" and morat_rate == r:
            morat_rate, covered = 0.0, min(amount, s["loan_cap"])
        elif applies and s["key"] == "pm-vidyalaxmi" and morat_rate == r:
            morat_rate, covered = max(0.0, r - finance.VIDYALAXMI_SUBVENTION), min(amount, s["loan_cap"])
        checks.append(
            LoanSchemeCheck(
                key=s["key"],
                name=s["name"],
                applies=applies,
                why=why,
                benefit=s["benefit"],
                how_to_apply=s["how"],
                provenance=Provenance(**s["provenance"]),
            )
        )
    # Relief applies up to the scheme's loan cap (CSIS: Rs 7.5 lakh, PM-Vidyalaxmi: Rs 10 lakh); the rest pays full rate
    relieved = covered if morat_rate != r else 0
    interest = int(round((relieved * morat_rate + (amount - relieved) * r) * moratorium_years))
    owed = amount + interest
    options = []
    for years in (5, 7, 10, 15):
        n, m = years * 12, r / 12
        e = int(round(owed * m * (1 + m) ** n / ((1 + m) ** n - 1))) if m else int(round(owed / n))
        options.append(
            LoanOption(tenor_years=years, monthly_emi=e, total_repaid=e * n, total_interest=e * n - amount)
        )
    ten = options[2]
    plain = [
        f"You borrow Rs {amount:,}. Usually nothing is paid while studying and for one year after "
        f"({moratorium_years * 12} months).",
        f"Interest still adds up in that time: about Rs {interest:,}, so you owe about Rs {owed:,} when "
        "repayment starts."
        if interest
        else "With the government scheme, no interest is added while studying.",
        f"Over 10 years that is about Rs {ten.monthly_emi:,} a month, Rs {ten.total_repaid:,} in total.",
        "A longer loan means a smaller EMI but more interest in total.",
    ]
    if annual_income:
        share = ten.monthly_emi / (annual_income / 12)
        plain.append(f"The 10-year EMI is about {share:.0%} of today's monthly family income.")
    return LoanExplanation(
        amount=amount,
        course_years=course_years,
        assumed_rate=r,
        moratorium_months=moratorium_years * 12,
        interest_while_studying=interest,
        owed_when_repayment_starts=owed,
        options=options,
        schemes=checks,
        plain_language=plain,
        cautions=[
            f"The {r:.1%} rate is an estimate. Banks quote different rates; compare at least two.",
            "Ask whether interest during the course is simple or compound, and whether you can pay it as you go.",
            "Loans above Rs 7.5 lakh may need collateral or a guarantor, except under PM-Vidyalaxmi.",
            "Scheme rules change. Confirm with the bank or the official portal before applying.",
        ],
    )


# ---------------------------------------------------------------- printable family report
L = {
    Language.EN: {
        "title": "PRISM family report",
        "top": "Top careers",
        "career": "Career",
        "overall": "Overall",
        "course": "Suggested course",
        "cost": "Total cost",
        "family": "For your family",
        "dates": "Coming up",
        "talk": "Talk about together",
        "none": "No dates in the next year for these courses.",
        "how": "How to read this: scores combine the student's fit, jobs outlook, cost, family views and "
        "automation risk. They are estimates, not a verdict.",
        "made": "Made on",
    },
    Language.TA: {
        "title": "PRISM குடும்ப அறிக்கை",
        "top": "முன்னணி தொழில்கள்",
        "career": "தொழில்",
        "overall": "மொத்தம்",
        "course": "பரிந்துரைக்கும் படிப்பு",
        "cost": "மொத்தச் செலவு",
        "family": "உங்கள் குடும்பத்திற்கு",
        "dates": "வரவிருக்கும் தேதிகள்",
        "talk": "சேர்ந்து பேச வேண்டியவை",
        "none": "இந்தப் படிப்புகளுக்கு அடுத்த ஓராண்டில் தேதிகள் இல்லை.",
        "how": "எப்படிப் படிப்பது: மதிப்பெண்கள் மாணவரின் பொருத்தம், வேலைவாய்ப்பு, செலவு, குடும்பக் கருத்து, "
        "தானியங்கி அபாயம் ஆகியவற்றை இணைக்கின்றன. இவை மதிப்பீடுகள் மட்டுமே, இறுதி முடிவு அல்ல.",
        "made": "தயாரித்த நாள்",
    },
    Language.HI: {
        "title": "PRISM पारिवारिक रिपोर्ट",
        "top": "शीर्ष करियर",
        "career": "करियर",
        "overall": "कुल",
        "course": "सुझाया गया कोर्स",
        "cost": "कुल ख़र्च",
        "family": "आपके परिवार के लिए",
        "dates": "आने वाली तारीख़ें",
        "talk": "साथ बैठकर बात करें",
        "none": "इन कोर्सों के लिए अगले एक साल में कोई तारीख़ नहीं।",
        "how": "कैसे पढ़ें: स्कोर में छात्र का मेल, नौकरी की संभावना, ख़र्च, परिवार की राय और ऑटोमेशन का जोखिम "
        "शामिल हैं। ये अनुमान हैं, अंतिम फ़ैसला नहीं।",
        "made": "बनाने की तारीख़",
    },
}


def report_html(run: AnalysisRun, role: Role, lang: Language, d: Deadlines, narrative) -> str:
    from app.services.narrator import AFFORD

    t, e = L[lang], html.escape
    rows = "".join(
        f"<tr><td>{r.rank}</td><td>{e(r.career.name)}</td><td>{round(100 * r.final_score)}%</td>"
        f"<td>{e(r.financial.pathway_name)}<br><small>{e(r.financial.institution_name)}</small></td>"
        f"<td>Rs {r.financial.total_cost:,}</td><td>{e(AFFORD[lang][r.financial.affordability_class.value])}</td></tr>"
        for r in run.recommendations[:5]
    )
    dates = (
        "".join(
            f"<li><b>{i.due.strftime('%d %b %Y')}</b> {e(i.title)} <small>({e(i.date_status.value)})</small></li>"
            for i in d.items[:8]
        )
        or f"<li>{e(t['none'])}</li>"
    )
    talk = ""
    if role is not Role.STUDENT and run.conflict.top_drivers:
        talk = (
            f"<h2>{e(t['talk'])}</h2><ul>"
            + "".join(f"<li>{e(x.conversation_prompt)}</li>" for x in run.conflict.top_drivers)
            + "</ul>"
        )
    bullets = "".join(f"<li>{e(b)}</li>" for b in narrative.bullets)
    stretch = run.buckets.get(Bucket.STRETCH_GOALS, [])
    stretch_html = "".join(f"<li>{e(i.career_name)}: {e(i.reason)}</li>" for i in stretch[:3])
    return f"""<!doctype html>
<html lang="{lang.value}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(t["title"])}</title>
<style>
body{{font-family:"Noto Sans","Noto Sans Tamil","Noto Sans Devanagari",system-ui,sans-serif;max-width:780px;margin:24px auto;
padding:0 16px;color:#1b1b1f;background:#fff;line-height:1.45}}
h1{{font-size:22px;margin:0 0 4px}}h2{{font-size:16px;margin:18px 0 6px;border-bottom:1px solid #ddd}}
table{{width:100%;border-collapse:collapse;font-size:13px}}td,th{{border-bottom:1px solid #eee;padding:6px 4px;
text-align:left;vertical-align:top}}small{{color:#555}}.lead{{font-size:17px;font-weight:600}}
.note{{font-size:12px;color:#555;margin-top:18px}}@media print{{body{{margin:0}}a{{color:inherit}}}}
</style></head><body>
<h1>{e(t["title"])}</h1><div class="note">{e(t["made"])}: {run.created_at.date().isoformat()} · {e(run.reproducibility.dataset_version)}</div>
<p class="lead">{e(narrative.headline)}</p><ul>{bullets}</ul>
<h2>{e(t["top"])}</h2>
<table><tr><th>#</th><th>{e(t["career"])}</th><th>{e(t["overall"])}</th><th>{e(t["course"])}</th><th>{e(t["cost"])}</th>
<th>{e(t["family"])}</th></tr>{rows}</table>
{f"<ul>{stretch_html}</ul>" if stretch_html else ""}
<h2>{e(t["dates"])}</h2><ul>{dates}</ul>
{talk}
<p class="note">{e(t["how"])}</p><p class="note">{e(narrative.notice)}</p>
</body></html>"""


# ---------------------------------------------------------------- fairness probes
def fairness_report(
    student: StudentInput, family: FamilyInput, cat: CatalogInput, today: date, now: datetime
) -> FairnessReport:
    """Counterfactual checks on the live engine and catalogue, plus a structural check of its inputs."""
    from app.services.analysis import run_analysis

    inputs = [f"student.{f.name}" for f in fields(StudentInput)] + [
        f"family.{f.name}" for f in fields(FamilyInput)
    ]
    used = [i for i in inputs if any(p in i.split(".")[1] for p in PROTECTED)]

    def go(s: StudentInput, f: FamilyInput) -> AnalysisRun:
        return run_analysis(s, f, cat, today=today, now=now, top_k=10)

    probes: list[FairnessProbe] = [
        FairnessProbe(
            name="no_protected_attributes",
            description="The engine has no input for gender, caste, religion, community, disability or name.",
            passed=not used,
            detail="none found" if not used else ", ".join(used),
        )
    ]
    poor_f = replace(family, annual_income=240_000, savings=50_000, max_emi=3_000, existing_emi=0)
    rich_f = replace(family, annual_income=2_500_000, savings=3_000_000, max_emi=40_000, existing_emi=0)
    poor, rich = go(student, poor_f), go(student, rich_f)

    def ids(r: AnalysisRun, *ks: Bucket) -> set[str]:
        return {i.career_id for k in ks for i in r.buckets.get(k, [])}

    visible = ids(poor, Bucket.BEST_FOR_STUDENT, Bucket.STRETCH_GOALS, Bucket.BEST_OVERALL)
    visible |= {r.career.id for r in poor.recommendations}  # the ranked list the family sees
    high_fit = [r for r in rich.recommendations if r.fit.fit >= 0.75]
    hidden = [r.career.name for r in high_fit if r.career.id not in visible]
    probes.append(
        FairnessProbe(
            name="money_never_hides_best_fits",
            description="Same student, family income Rs 2.4 lakh vs Rs 25 lakh: every career that fits the "
            "student well (fit at least 75 %) stays visible to the low-income family, in the ranked list or "
            "in stretch goals.",
            passed=not hidden,
            detail=f"{len(high_fit)} high-fit careers checked; hidden: {', '.join(hidden) or 'none'}",
        )
    )
    same_student = [i.career_id for i in poor.buckets.get(Bucket.BEST_FOR_STUDENT, [])] == [
        i.career_id for i in rich.buckets.get(Bucket.BEST_FOR_STUDENT, [])
    ]
    probes.append(
        FairnessProbe(
            name="best_for_student_ignores_money",
            description="The 'best for the student' list is identical whatever the family earns.",
            passed=same_student,
            detail="identical" if same_student else "differs",
        )
    )
    other_region = next((c for c in cat.regions if c != student.region_code and c.startswith("IN-")), None)
    moved = go(replace(student, region_code=other_region), family) if other_region else None
    base = go(student, family)
    fit_a = {r.career.id: r.fit.fit for r in base.recommendations}
    fit_b = {r.career.id: r.fit.fit for r in moved.recommendations} if moved else fit_a
    same_fit = all(abs(fit_a[k] - fit_b[k]) < 1e-9 for k in fit_a.keys() & fit_b.keys())
    probes.append(
        FairnessProbe(
            name="fit_ignores_home_region",
            description="Where a student lives changes costs and local jobs, never how well a career fits them.",
            passed=same_fit,
            detail=f"compared {student.region_code} with {other_region}",
        )
    )
    declared = {s.id for s in cat.scholarships if s.self_declared_criteria}
    auto = {
        p.scholarship_id
        for r in (poor, rich, base)
        for rec in r.recommendations
        for fa in [rec.financial, *rec.alternative_pathways]
        for p in fa.scholarship_plan
    } & declared
    probes.append(
        FairnessProbe(
            name="category_scholarships_never_assumed",
            description="Scholarships that depend on category, gender or disability are listed for students to "
            "check themselves and are never added to a funding plan automatically.",
            passed=not auto,
            detail=f"{len(declared)} such scholarships in the catalogue; auto-applied: {len(auto)}",
        )
    )
    return FairnessReport(
        dataset_version=cat.dataset_version,
        model_inputs=inputs,
        protected_attributes_used=used,
        probes=probes,
        passed=all(p.passed for p in probes),
        generated_at=now,
    )


# ---------------------------------------------------------------- counsellor dashboard flags
SEVERITY_ORDER = {"urgent": 0, "warn": 1, "info": 2}


def dashboard_flags(
    *,
    consent_status: str,
    submissions: int,
    run: AnalysisRun | None,
    run_age_days: int | None,
    deadlines_soon: list[DeadlineItem],
    has_outcome: bool,
) -> list:
    from app.schemas.common import AffordabilityClass, ConflictBand
    from app.schemas.engagement import FlagSeverity, StudentFlag

    out: list[StudentFlag] = []

    def flag(code: str, sev: FlagSeverity, msg: str) -> None:
        out.append(StudentFlag(code=code, severity=sev, message=msg))

    if consent_status == "pending":
        flag("consent_pending", FlagSeverity.WARN, "A parent has not yet approved processing for this minor.")
    if submissions == 0:
        flag("no_assessment", FlagSeverity.INFO, "Has not started the questionnaire.")
    if run is None:
        if submissions:
            flag("no_run", FlagSeverity.INFO, "Questionnaire done but no recommendations generated yet.")
    else:
        if run.conflict.band in (ConflictBand.HIGH,):
            flag(
                "high_conflict",
                FlagSeverity.WARN,
                "Student and parents disagree strongly; a family meeting may help.",
            )
        top = run.recommendations[:3]
        if top and all(r.financial.affordability_class is AffordabilityClass.INFEASIBLE for r in top):
            flag(
                "top_matches_out_of_reach",
                FlagSeverity.URGENT,
                "None of the top three matches is affordable yet; discuss scholarships and loans.",
            )
        dq = run.data_quality
        if dq.confidence_penalty >= 0.1 or dq.completeness < 0.8:
            why = "; ".join(dq.warnings[:2]) or f"{dq.completeness:.0%} of answers complete"
            flag("low_data_quality", FlagSeverity.WARN, f"Results are less certain: {why}.")
        if run.reproducibility.is_outdated:
            flag("run_outdated", FlagSeverity.INFO, "New data is available; re-run to refresh the results.")
        if run_age_days is not None and run_age_days >= 180 and not has_outcome:
            flag(
                "follow_up_due",
                FlagSeverity.INFO,
                "Six months since the results; record what the student chose.",
            )
    for d in deadlines_soon[:3]:
        flag(
            "deadline_soon",
            FlagSeverity.URGENT if d.days_left <= 7 else FlagSeverity.WARN,
            f"{d.title} in {d.days_left} days ({d.due.isoformat()}).",
        )
    return sorted(out, key=lambda f: SEVERITY_ORDER[f.severity.value])


def followed_rank(run: AnalysisRun | None, career_id: str | None) -> int | None:
    if run is None or career_id is None:
        return None
    return next((r.rank for r in run.recommendations if career_id in (r.career.id, r.career.slug)), None)


def outcome_summary(rows: list[dict], k: int = 5):
    """rows: dicts with status, followed_recommendation_rank, satisfaction, scholarship_received."""
    from collections import Counter

    from app.schemas.engagement import OutcomeSummary

    n = len(rows)
    notice = (
        "Outcomes are self-reported 6-12 months after the results. They are the honest test of whether "
        "the recommendations helped."
    )
    if n < k:
        return OutcomeSummary(
            responses=n,
            by_status={},
            followed_top3_share=None,
            followed_top10_share=None,
            mean_satisfaction=None,
            scholarship_received_share=None,
            suppressed=True,
            notice=notice + f" Shares are hidden until at least {k} families respond.",
        )
    ranks = [r["followed_recommendation_rank"] for r in rows]
    sats = [r["satisfaction"] for r in rows if r["satisfaction"] is not None]
    sch = [r["scholarship_received"] for r in rows if r["scholarship_received"] is not None]
    by_status = {s: c for s, c in Counter(r["status"] for r in rows).items() if c >= k}
    return OutcomeSummary(
        responses=n,
        by_status=by_status,
        followed_top3_share=round(sum(1 for x in ranks if x and x <= 3) / n, 4),
        followed_top10_share=round(sum(1 for x in ranks if x and x <= 10) / n, 4),
        mean_satisfaction=round(sum(sats) / len(sats), 2) if len(sats) >= k else None,
        scholarship_received_share=round(sum(sch) / len(sch), 4) if len(sch) >= k else None,
        suppressed=False,
        notice=notice,
    )


def reminder_plan(d: Deadlines, lead_days: list[int], today: date) -> list[tuple[str, str, date, date]]:
    """(ref_id, title, due, send_on) for every deadline x lead time that is still in the future."""
    out = []
    for item in d.items:
        for lead in sorted(set(lead_days), reverse=True):
            send_on = item.due - timedelta(days=lead)
            if send_on >= today:
                out.append((f"{item.ref_id}@{lead}d"[:60], item.title[:200], item.due, send_on))
    return out
