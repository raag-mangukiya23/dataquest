"""A small, internally consistent fixture world for MOCK_MODE.

Persona: a Grade 12 PCM student in Coimbatore (Tamil Nadu) with an Investigative-Artistic-
Realistic profile, whose parents lean towards medicine and value stability. All rupee
figures, dates and indices here are ILLUSTRATIVE ESTIMATES for UI development only.
"""

import uuid
from datetime import date, datetime

from app.core.dimensions import DIMENSIONS

_NS = uuid.UUID("6f1c1f4e-6c1e-4d55-9d0b-7c0a3c5e2a10")


def sid(kind: str, key: str) -> str:
    """Stable UUID so fixture ids never change between requests or releases."""
    return str(uuid.uuid5(_NS, f"{kind}:{key}"))


TODAY = date(2026, 10, 7)
NOW = datetime(2026, 10, 7, 9, 30, 0)
DATA_AS_OF = date(2026, 9, 30)
DATASET_VERSION = "seed-2026-09-30"
FAMILY_FINANCE_VERSION = 3

STUDENT_USER_ID = sid("user", "student-demo")
PARENT_USER_ID = sid("user", "parent-demo")
STUDENT_ID = sid("student", "demo")
FAMILY_ID = sid("family", "demo")
RUN_ID = sid("run", "baseline-demo")
WHATIF_RUN_ID = sid("run", "whatif-demo")

STUDENT = {
    "full_name": "Ananya R.",
    "email": "student.demo@prism.example",
    "grade": 12,
    "board": "CBSE",
    "stream": "PCM",
    "pincode": "641004",
    "city": "Coimbatore",
    "state": "Tamil Nadu",
    "region_code": "IN-TN-CBE",
    "languages": ["Tamil", "English", "Hindi"],
    "interests": ["robotics", "sketching", "biology documentaries", "data puzzles"],
    "extracurriculars": ["school science fair (state finalist)", "digital art club"],
    "recent_score_pct": 88.4,
}
PARENT = {"full_name": "R. Raman", "email": "parent.demo@prism.example"}

# Intended profile; persona.py turns it into concrete questionnaire answers, and the trait scores the
# rest of the fixtures use come from scoring those answers with the real engine.
STUDENT_TARGET_VECTOR: dict[str, float] = dict(
    zip(
        DIMENSIONS,
        (
            0.62,
            0.86,
            0.74,
            0.41,
            0.38,
            0.47,  # RIASEC  R I A S E C
            0.81,
            0.66,
            0.84,
            0.77,  # aptitude num verbal logical spatial
            0.80,
            0.71,
            0.55,  # cognitive analytical creative practical
            0.52,
            0.70,
            0.68,
            0.58,  # values security autonomy impact financial
            0.73,
            0.57,  # grit, risk tolerance
        ),
        strict=True,
    )
)

FINANCE = {
    "income_band": "6l_10l",
    "annual_income": 900_000,
    "income_growth_rate": 0.06,
    "allocatable_savings": 600_000,
    "existing_debt_emi": 5_000,
    "dependents": 2,
    "max_affordable_emi": 12_000,
    "loan_tolerance": 0.4,
    "risk_appetite": 0.3,
    "relocation_willingness": 0.4,
    "abroad_willingness": 0.1,
    "time_to_earn_years": 4,
    "prestige_vs_stability": "stability",
    "preferred_regions": ["IN-TN-CBE", "IN-TN-CHN"],
}

WEIGHTS = {
    "fit": 0.30,
    "market": 0.15,
    "affordability": 0.20,
    "roi": 0.15,
    "family_alignment": 0.15,
    "disruption": 0.05,
}

REGIONS = [
    {
        "code": "IN-TN-CBE",
        "name": "Coimbatore",
        "state": "Tamil Nadu",
        "country": "India",
        "type": "tier2",
        "cost_of_living_index": 0.72,
    },
    {
        "code": "IN-TN-CHN",
        "name": "Chennai",
        "state": "Tamil Nadu",
        "country": "India",
        "type": "metro",
        "cost_of_living_index": 0.88,
    },
    {
        "code": "IN-KA-BLR",
        "name": "Bengaluru",
        "state": "Karnataka",
        "country": "India",
        "type": "metro",
        "cost_of_living_index": 1.00,
    },
    {
        "code": "IN-TG-HYD",
        "name": "Hyderabad",
        "state": "Telangana",
        "country": "India",
        "type": "metro",
        "cost_of_living_index": 0.90,
    },
    {
        "code": "DE",
        "name": "Germany",
        "state": None,
        "country": "Germany",
        "type": "international",
        "cost_of_living_index": 2.60,
    },
]

# slug, name, sector, steam tags, entry education, automation risk, description
CAREERS = [
    (
        "data-scientist",
        "Data Scientist",
        "computing_ai",
        ["S", "T", "M"],
        "B.Tech / B.Sc in CS, Data Science or Statistics",
        0.25,
        "Turns messy data into decisions using statistics, machine learning and storytelling.",
    ),
    (
        "biomedical-engineer",
        "Biomedical Engineer",
        "health_life_sciences",
        ["S", "T", "E"],
        "B.Tech Biomedical / Medical Electronics",
        0.18,
        "Designs medical devices, diagnostics and hospital technology at the meeting point of medicine and engineering.",
    ),
    (
        "computational-biologist",
        "Computational Biologist",
        "health_life_sciences",
        ["S", "T", "M"],
        "BS-MS (IISER) / B.Tech Biotechnology + coding",
        0.15,
        "Uses code and models to decode genomes, proteins and disease.",
    ),
    (
        "robotics-engineer",
        "Robotics & Automation Engineer",
        "engineering",
        ["S", "T", "E", "M"],
        "B.Tech Mechatronics / Robotics / ECE",
        0.14,
        "Builds machines that sense, decide and act, from factory arms to farm robots.",
    ),
    (
        "agri-drone-engineer",
        "Agri-Drone & Precision Farming Engineer",
        "agri_environment",
        ["S", "T", "E"],
        "B.Tech Agricultural Engineering / B.Sc Agri + drone certification",
        0.12,
        "Applies drones, sensors and analytics to raise farm yields and cut input waste.",
    ),
    (
        "ux-designer",
        "UX / Product Designer",
        "design_arts",
        ["T", "A"],
        "B.Des Interaction / Communication Design",
        0.30,
        "Researches users and designs digital products that are useful, usable and delightful.",
    ),
    (
        "doctor-mbbs",
        "Doctor (MBBS)",
        "health_life_sciences",
        ["S"],
        "MBBS (5.5 years incl. internship) via NEET-UG",
        0.08,
        "Diagnoses and treats patients; long training path with high social trust.",
    ),
]

# slug -> (fit, market, roi_norm, family_alignment(parent acceptance), disruption)
# Market seeds per career: (demand index, automation/disruption risk). Illustrative estimates; real values
# come from the market-signal sources in app/etl/sources.py.
MARKET_SEED = {
    "data-scientist": (0.84, 0.25),
    "biomedical-engineer": (0.70, 0.18),
    "computational-biologist": (0.66, 0.15),
    "robotics-engineer": (0.72, 0.14),
    "agri-drone-engineer": (0.68, 0.12),
    "ux-designer": (0.74, 0.30),
    "doctor-mbbs": (0.80, 0.08),
}

# Career trait requirements = the sector's prototype plus these career-specific adjustments.
# Expert estimates until mapped to O*NET occupation data (see docs/DATA_TRUTH.md).
CAREER_TRAIT_OVERRIDES: dict[str, dict[str, float]] = {
    "data-scientist": {
        "riasec_i": 0.85,
        "riasec_c": 0.65,
        "apt_numerical": 0.85,
        "apt_logical": 0.85,
        "cog_analytical": 0.85,
        "val_financial": 0.65,
    },
    "biomedical-engineer": {
        "riasec_r": 0.75,
        "riasec_i": 0.8,
        "riasec_s": 0.55,
        "apt_spatial": 0.7,
        "apt_numerical": 0.7,
        "cog_practical": 0.7,
        "val_impact": 0.8,
        "risk_tolerance": 0.45,
    },
    "computational-biologist": {
        "riasec_i": 0.9,
        "riasec_s": 0.4,
        "riasec_r": 0.4,
        "apt_numerical": 0.8,
        "apt_logical": 0.8,
        "cog_analytical": 0.85,
        "val_impact": 0.7,
    },
    "robotics-engineer": {
        "riasec_r": 0.85,
        "riasec_i": 0.75,
        "apt_spatial": 0.8,
        "apt_logical": 0.8,
        "cog_creative": 0.6,
        "cog_practical": 0.8,
    },
    "agri-drone-engineer": {
        "riasec_r": 0.8,
        "riasec_i": 0.7,
        "apt_spatial": 0.7,
        "cog_practical": 0.85,
        "risk_tolerance": 0.6,
        "val_impact": 0.8,
    },
    "ux-designer": {
        "riasec_a": 0.9,
        "riasec_s": 0.6,
        "riasec_i": 0.55,
        "apt_verbal": 0.65,
        "cog_creative": 0.9,
        "cog_analytical": 0.55,
    },
    "doctor-mbbs": {
        "riasec_s": 0.85,
        "riasec_i": 0.8,
        "apt_verbal": 0.7,
        "grit": 0.9,
        "val_impact": 0.85,
        "val_security": 0.7,
        "risk_tolerance": 0.4,
    },
}

# What the parents ranked (career slug or sector), most wanted first.
PARENT_PREFERENCES = [
    {"rank": 1, "career": "doctor-mbbs", "note": "Respected and stable"},
    {"rank": 2, "career": "biomedical-engineer"},
    {"rank": 3, "domain": "engineering"},
]

INSTITUTIONS = {
    "gct-cbe": {
        "name": "Government College of Technology, Coimbatore",
        "city": "Coimbatore",
        "state": "Tamil Nadu",
        "country": "India",
        "tier": 2,
        "ranking_source": None,
        "rank": None,
        "ownership": "public",
    },
    "psg-cbe": {
        "name": "PSG College of Technology",
        "city": "Coimbatore",
        "state": "Tamil Nadu",
        "country": "India",
        "tier": 2,
        "ranking_source": None,
        "rank": None,
        "ownership": "private",
    },
    "tnau-cbe": {
        "name": "Tamil Nadu Agricultural University",
        "city": "Coimbatore",
        "state": "Tamil Nadu",
        "country": "India",
        "tier": 2,
        "ranking_source": None,
        "rank": None,
        "ownership": "public",
    },
    "iiser-tvm": {
        "name": "IISER Thiruvananthapuram",
        "city": "Thiruvananthapuram",
        "state": "Kerala",
        "country": "India",
        "tier": 1,
        "ranking_source": None,
        "rank": None,
        "ownership": "public",
    },
    "pvt-des-blr": {
        "name": "Private Design School, Bengaluru (illustrative)",
        "city": "Bengaluru",
        "state": "Karnataka",
        "country": "India",
        "tier": 2,
        "ranking_source": None,
        "rank": None,
        "ownership": "private",
    },
    "pvt-med-tn": {
        "name": "Private Medical College, Tamil Nadu (illustrative)",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "country": "India",
        "tier": 2,
        "ranking_source": None,
        "rank": None,
        "ownership": "private",
    },
    "govt-med-tn": {
        "name": "Government Medical College, Tamil Nadu (illustrative)",
        "city": "Coimbatore",
        "state": "Tamil Nadu",
        "country": "India",
        "tier": 2,
        "ranking_source": None,
        "rank": None,
        "ownership": "public",
    },
}

# key, course, level, inst, years, tuition, hostel, living, misc, exams, career slugs
PATHWAYS = [
    (
        "gct-cse-ds",
        "B.Tech Computer Science (Data Science)",
        "UG",
        "gct-cbe",
        4,
        55_000,
        40_000,
        30_000,
        10_000,
        ["TNEA"],
        ["data-scientist"],
    ),
    (
        "psg-bme",
        "B.E. Biomedical Engineering",
        "UG",
        "psg-cbe",
        4,
        150_000,
        70_000,
        30_000,
        15_000,
        ["TNEA"],
        ["biomedical-engineer"],
    ),
    (
        "iiser-bsms",
        "BS-MS Biological Sciences",
        "Integrated",
        "iiser-tvm",
        5,
        60_000,
        30_000,
        36_000,
        10_000,
        ["IISER_IAT"],
        ["computational-biologist"],
    ),
    (
        "psg-robotics",
        "B.E. Robotics & Automation",
        "UG",
        "psg-cbe",
        4,
        250_000,
        90_000,
        36_000,
        20_000,
        ["TNEA"],
        ["robotics-engineer"],
    ),
    (
        "tnau-agri",
        "B.Tech Agricultural Engineering",
        "UG",
        "tnau-cbe",
        4,
        50_000,
        35_000,
        30_000,
        10_000,
        ["TNAU_COUNSELLING"],
        ["agri-drone-engineer"],
    ),
    (
        "pvt-bdes",
        "B.Des Interaction Design",
        "UG",
        "pvt-des-blr",
        4,
        450_000,
        150_000,
        72_000,
        30_000,
        ["UCEED", "NID_DAT"],
        ["ux-designer"],
    ),
    (
        "pvt-mbbs",
        "MBBS",
        "UG",
        "pvt-med-tn",
        6,
        1_800_000,
        150_000,
        60_000,
        40_000,
        ["NEET_UG"],
        ["doctor-mbbs"],
    ),
    (
        "govt-mbbs",
        "MBBS (government quota)",
        "UG",
        "govt-med-tn",
        6,
        20_000,
        30_000,
        40_000,
        10_000,
        ["NEET_UG"],
        ["doctor-mbbs"],
    ),
]

EXAMS = [
    (
        "JEE_MAIN",
        "JEE Main",
        "National Testing Agency",
        "national",
        "twice a year",
        date(2027, 1, 22),
        date(2027, 1, 30),
        date(2026, 11, 22),
        "Class 12 with Physics, Chemistry, Mathematics",
        "https://jeemain.nta.nic.in",
        ["data-scientist", "robotics-engineer"],
    ),
    (
        "NEET_UG",
        "NEET-UG",
        "National Testing Agency",
        "national",
        "once a year",
        date(2027, 5, 2),
        date(2027, 5, 2),
        date(2027, 3, 7),
        "Class 12 with Physics, Chemistry, Biology/Biotechnology and English",
        "https://neet.nta.nic.in",
        ["doctor-mbbs", "biomedical-engineer"],
    ),
    (
        "CUET_UG",
        "CUET-UG",
        "National Testing Agency",
        "national",
        "once a year",
        date(2027, 5, 13),
        date(2027, 6, 3),
        date(2027, 3, 22),
        "Class 12 in relevant subjects",
        "https://cuet.nta.nic.in",
        ["computational-biologist"],
    ),
    (
        "IISER_IAT",
        "IISER Aptitude Test",
        "IISER Joint Admission Committee",
        "institutional",
        "once a year",
        date(2027, 6, 6),
        date(2027, 6, 6),
        date(2027, 4, 25),
        "Class 12 science stream",
        None,
        ["computational-biologist"],
    ),
    (
        "UCEED",
        "UCEED",
        "IIT Bombay",
        "national",
        "once a year",
        date(2027, 1, 17),
        date(2027, 1, 17),
        date(2026, 11, 1),
        "Class 12 any stream",
        None,
        ["ux-designer"],
    ),
    (
        "NID_DAT",
        "NID Design Aptitude Test",
        "National Institute of Design",
        "institutional",
        "once a year",
        date(2026, 12, 21),
        date(2026, 12, 21),
        date(2026, 11, 15),
        "Class 12 any stream",
        None,
        ["ux-designer"],
    ),
    (
        "TNEA",
        "TNEA Counselling (marks-based)",
        "Directorate of Technical Education, Tamil Nadu",
        "state",
        "once a year",
        date(2027, 7, 1),
        date(2027, 8, 15),
        date(2027, 6, 6),
        "Class 12 PCM marks; Tamil Nadu nativity rules apply",
        None,
        ["data-scientist", "biomedical-engineer", "robotics-engineer"],
    ),
    (
        "TNAU_COUNSELLING",
        "TNAU UG Admission (marks-based)",
        "Tamil Nadu Agricultural University",
        "state",
        "once a year",
        date(2027, 7, 15),
        date(2027, 8, 30),
        date(2027, 6, 15),
        "Class 12 science marks",
        None,
        ["agri-drone-engineer"],
    ),
]

# key, name, provider, type, amount/yr, years, covers, rules, summary, prob, stackable, deadline, url
SCHOLARSHIPS = [
    (
        "css-nsp",
        "Central Sector Scheme of Scholarship (College & University Students)",
        "Ministry of Education",
        "central_govt",
        12_000,
        5,
        ["tuition", "living"],
        {
            "all": [
                {"field": "board_percentile", "op": ">", "value": 80},
                {"field": "annual_income", "op": "<", "value": 450_000},
            ]
        },
        "Above the 80th percentile of successful Class 12 candidates in your board; family income below "
        "Rs 4.5 lakh; cannot be combined with any other scholarship",
        0.35,
        False,
        date(2026, 10, 31),
        "https://scholarships.gov.in",
    ),
    (
        "inspire-she",
        "INSPIRE Scholarship for Higher Education (natural & basic sciences)",
        "Department of Science & Technology",
        "central_govt",
        80_000,
        5,
        ["tuition", "living"],
        {
            "all": [
                {"field": "course_area", "op": "in", "value": ["basic_sciences"]},
                {"field": "board_percentile", "op": ">=", "value": 99},
            ]
        },
        "Top 1 % in Class 12 board (or equivalent rank) and enrolled in natural/basic sciences",
        0.30,
        False,
        date(2026, 11, 30),
        None,
    ),
    (
        "tn-first-grad",
        "Tamil Nadu First Graduate Tuition Fee Concession",
        "Government of Tamil Nadu",
        "state_govt",
        25_000,
        4,
        ["tuition"],
        {
            "all": [
                {"field": "first_graduate", "op": "==", "value": True},
                {"field": "admission_route", "op": "==", "value": "single_window_counselling"},
            ]
        },
        "First graduate in the family, admitted via state single-window counselling",
        0.80,
        True,
        None,
        None,
    ),
    (
        "inst-merit",
        "Institutional merit fee waiver (illustrative)",
        "Partner institutions",
        "institution",
        50_000,
        4,
        ["tuition"],
        {"all": [{"field": "entrance_percentile", "op": ">=", "value": 90}]},
        "Top 10 % entrance performers at participating private colleges",
        0.40,
        True,
        date(2027, 7, 31),
        None,
    ),
    (
        "pvt-ug-merit",
        "Private foundation UG merit-cum-means scholarship (illustrative)",
        "Private foundation",
        "private",
        100_000,
        2,
        ["tuition", "living"],
        {
            "all": [
                {"field": "annual_income", "op": "<=", "value": 1_500_000},
                {"field": "recent_score_pct", "op": ">=", "value": 60},
            ]
        },
        "Merit-cum-means; aptitude test and interview",
        0.15,
        True,
        date(2026, 12, 15),
        None,
    ),
]

LOCAL_OPPORTUNITIES = [
    (
        "cbe-coconut-drone",
        "Early detection of coconut pest attack with low-cost drones",
        "Coconut groves in Pollachi and Kinathukadavu lose yield to rugose whitefly and red palm weevil; "
        "detection is manual and late.",
        "Coimbatore",
        ["642001", "642109"],
        ["S", "T", "E"],
        ["agri-drone-engineer", "data-scientist"],
        ["drone imaging", "computer vision", "field surveys"],
        "district agriculture department & FPOs",
        "Collect 300 labelled leaf photos from 3 farms and train a phone-based classifier.",
    ),
    (
        "cbe-pump-efficiency",
        "Energy-efficient pump sets for MSME foundries and farms",
        "Coimbatore's pump and motor cluster supplies the nation; small units lack affordable efficiency testing.",
        "Coimbatore",
        ["641004", "641021"],
        ["S", "T", "E", "M"],
        ["robotics-engineer", "data-scientist"],
        ["IoT sensors", "embedded C", "data logging"],
        "MSME cluster",
        "Build an Arduino power logger and benchmark 5 pump sets with a local workshop.",
    ),
    (
        "tirupur-effluent",
        "Low-cost textile effluent monitoring",
        "Textile dyeing units around Tiruppur need cheap, continuous water-quality monitoring for compliance.",
        "Tiruppur",
        ["641601", "641604"],
        ["S", "T", "E"],
        ["biomedical-engineer", "computational-biologist"],
        ["sensor design", "chemistry", "dashboards"],
        "NGO",
        "Prototype a pH/TDS sensor buoy and publish a weekly open data dashboard.",
    ),
]


# ---------------------------------------------------------------- data audit of 2026-10-07
# Figures checked against sources. Everything not listed here is an unverified estimate.
# 'secondary' = matches reputable reporting of the official notice; it becomes 'verified' once someone
# checks the official page itself (this build environment could not reach the official sites).
CHECKED_ON = date(2026, 10, 7)

EXAM_CHECKS: dict[str, dict[str, str]] = {
    "JEE_MAIN": {
        "verification": "secondary",
        "session1_status": "tentative",
        "evidence": "NTA examination calendar released 16 Sep 2026: Session 1 on 22-24 and 28-30 Jan 2027 with "
        "31 Jan as buffer; dates are tentative (reported by Careers360, ThePrint and CareerIndia). Registration "
        "dates and Session 2 are not announced yet. Confirm on nta.ac.in.",
    },
}
EXAM_NOTES: dict[str, str] = {
    "NEET_UG": "Not in NTA's 16 Sep 2026 calendar; date projected from earlier cycles.",
    "CUET_UG": "Not in NTA's 16 Sep 2026 calendar; dates projected from earlier cycles.",
}

SCHOLARSHIP_CHECKS: dict[str, dict[str, str]] = {
    "css-nsp": {
        "verification": "secondary",
        "evidence": "Ministry of Education scheme rules: Rs 12,000 a year for years 1-3 and Rs 20,000 for years 4-5; "
        "family income below Rs 4.5 lakh; above the 80th percentile of successful Class 12 candidates in the "
        "board; not available with any other scholarship. Applications via scholarships.gov.in. The award "
        "probability is a PRISM heuristic and the 2026-27 deadline is not yet confirmed.",
    },
    "inspire-she": {
        "verification": "secondary",
        "evidence": "DST INSPIRE-SHE: Rs 80,000 a year (Rs 60,000 scholarship + Rs 20,000 summer research "
        "attachment) for up to 5 years; top 1 % in the Class 12 board; natural and basic sciences only. Confirm "
        "the 2026-27 call on DST's INSPIRE portal. The award probability is a PRISM heuristic.",
    },
}
SCHOLARSHIP_YEAR_AMOUNTS: dict[str, list[int]] = {"css-nsp": [12_000, 12_000, 12_000, 20_000, 20_000]}

# Search keywords for the live postings feed (becomes careers.search_keywords in the database).
CAREER_KEYWORDS: dict[str, str] = {
    "data-scientist": "data scientist",
    "biomedical-engineer": "biomedical engineer",
    "computational-biologist": "bioinformatics",
    "robotics-engineer": "robotics engineer",
    "agri-drone-engineer": "agriculture drone",
    "ux-designer": "ux designer",
    "doctor-mbbs": "mbbs doctor",
}
CITY_NAMES: dict[str, str] = {
    "IN-TN-CBE": "Coimbatore",
    "IN-TN-CHN": "Chennai",
    "IN-KA-BLR": "Bangalore",
    "IN-TG-HYD": "Hyderabad",
}

# Course area and admission route per pathway (used by scholarship eligibility rules).
# (course area, admission route, selectivity estimate: 0 = open, 1 = extremely competitive)
PATHWAY_META: dict[str, tuple[str, str, float]] = {
    "gct-cse-ds": ("engineering", "single_window_counselling", 0.75),
    "psg-bme": ("engineering", "single_window_counselling", 0.65),
    "iiser-bsms": ("basic_sciences", "national_exam", 0.85),
    "psg-robotics": ("engineering", "single_window_counselling", 0.65),
    "tnau-agri": ("agriculture", "single_window_counselling", 0.55),
    "pvt-bdes": ("design", "institutional", 0.4),
    "pvt-mbbs": ("medicine", "management_quota", 0.35),
    "govt-mbbs": ("medicine", "single_window_counselling", 0.97),
}
# Institution-specific scholarships offered with a pathway.
PATHWAY_SCHOLARSHIPS: dict[str, list[str]] = {
    "psg-bme": ["inst-merit"],
    "psg-robotics": ["inst-merit"],
    "pvt-bdes": ["inst-merit"],
}
