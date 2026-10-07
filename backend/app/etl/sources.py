"""Registry of real data sources and dataset refresh cadences.

Every URL here was checked to exist before being added. 'access' says how data arrives:
  api      - fetched by an adapter on a schedule (needs a free key; disabled without one)
  download - a published file loaded by the ETL
  manual   - a person copies figures from an official notice and records the evidence
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SourceSpec:
    key: str
    name: str
    url: str | None  # None when there is no single official page (the row's evidence cites the document)
    access: str  # api | download | manual
    cadence_days: int
    license: str
    supplies: tuple[str, ...]
    notes: str


@dataclass(frozen=True)
class DatasetSpec:
    key: str
    label: str
    cadence_days: int
    sources: tuple[str, ...]
    demo_critical: bool


SOURCES: dict[str, SourceSpec] = {
    s.key: s
    for s in [
        SourceSpec(
            "adzuna",
            "Adzuna job-search API (India)",
            "https://developer.adzuna.com",
            "api",
            1,
            "Free developer key; attribution required",
            ("market_signals", "salary_bands"),
            "Live posting counts and mean advertised salary per keyword and city. Free tier: 25 calls/min, "
            "250/day. Coverage leans towards urban, white-collar listings.",
        ),
        SourceSpec(
            "naukri_jobspeak",
            "Naukri JobSpeak monthly hiring index",
            "https://www.naukri.com/blog",
            "manual",
            30,
            "Public press release",
            ("market_signals",),
            "Monthly white-collar hiring index by sector and city, with year-on-year change.",
        ),
        SourceSpec(
            "epfo_payroll",
            "EPFO monthly payroll data",
            "https://www.epfindia.gov.in",
            "manual",
            30,
            "Government press release",
            ("market_signals",),
            "Net new formal-sector payroll by industry and state; provisional and revised monthly.",
        ),
        SourceSpec(
            "plfs",
            "Periodic Labour Force Survey (MoSPI)",
            "https://www.mospi.gov.in",
            "download",
            30,
            "Government publication",
            ("market_signals", "salary_bands"),
            "Monthly and quarterly unemployment and participation rates; annual earnings tables.",
        ),
        SourceSpec(
            "onet",
            "O*NET database (US Department of Labor)",
            "https://www.onetcenter.org",
            "download",
            365,
            "CC BY 4.0",
            ("careers",),
            "RIASEC interest profiles, abilities and work values for 900+ occupations; mapped to Indian "
            "careers to build requirement vectors.",
        ),
        SourceSpec(
            "nirf",
            "National Institutional Ranking Framework",
            "https://www.nirfindia.org",
            "download",
            365,
            "Government publication",
            ("institutions",),
            "Annual rankings by discipline; 2025 edition out.",
        ),
        SourceSpec(
            "nta",
            "National Testing Agency",
            "https://nta.ac.in",
            "manual",
            30,
            "Government notice",
            ("exams",),
            "Exam calendar and information bulletins for JEE Main, NEET-UG, CUET-UG.",
        ),
        SourceSpec(
            "nsp",
            "National Scholarship Portal",
            "https://scholarships.gov.in",
            "manual",
            365,
            "Government portal",
            ("scholarships",),
            "Central and state scholarship schemes, rates and deadlines.",
        ),
        SourceSpec(
            "data_gov_in",
            "Open Government Data Platform India",
            "https://data.gov.in",
            "api",
            30,
            "Government Open Data License - India; free key",
            ("market_signals", "institutions"),
            "API access to ministry datasets; used for district-level indicators.",
        ),
        SourceSpec(
            "ncs",
            "National Career Service portal",
            "https://www.ncs.gov.in",
            "manual",
            30,
            "Government portal",
            ("market_signals",),
            "Vacancy listings by occupation and location.",
        ),
        SourceSpec(
            "institution_notices",
            "Institution and fee-committee fee notices",
            None,
            "manual",
            365,
            "Official notices",
            ("pathways",),
            "Fees are copied from each institution's or state fee committee's notice for the academic year; "
            "the notice itself is cited in the row's evidence.",
        ),
        SourceSpec(
            "prism_curated",
            "PRISM curated estimate",
            None,
            "manual",
            365,
            "Team estimate",
            ("local_opportunities", "pathways", "salary_bands", "market_signals"),
            "Placeholder figures the team has not yet checked; always shown as estimates.",
        ),
    ]
}

DATASETS: dict[str, DatasetSpec] = {
    d.key: d
    for d in [
        DatasetSpec(
            "market_signals",
            "Market demand and job velocity",
            30,
            ("adzuna", "naukri_jobspeak", "epfo_payroll", "plfs", "ncs"),
            True,
        ),
        DatasetSpec("salary_bands", "Salary bands", 180, ("adzuna", "plfs"), True),
        DatasetSpec("careers", "Career requirement profiles", 365, ("onet",), True),
        DatasetSpec("institutions", "Institutions and rankings", 365, ("nirf",), False),
        DatasetSpec("pathways", "Courses and fees", 365, ("institution_notices",), True),
        DatasetSpec("exams", "Entrance exams and dates", 30, ("nta",), True),
        DatasetSpec("scholarships", "Scholarships", 365, ("nsp",), True),
        DatasetSpec("local_opportunities", "Hyper-local STEAM problems", 365, ("prism_curated",), False),
    ]
}
