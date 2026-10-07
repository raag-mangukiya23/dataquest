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

STUDENT_VECTOR: dict[str, float] = dict(
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
# Engine-derived for this persona (Phase 4 computes these; fixed here for the UI).
FAMILY_FUNDS = 940_000
LOAN_CAPACITY = 908_000  # PV of Rs 12,000/month for 120 months at 10 % p.a.

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
SCORES = {
    "data-scientist": (0.86, 0.84, 0.78, 0.55, 0.25),
    "biomedical-engineer": (0.78, 0.70, 0.62, 0.85, 0.18),
    "computational-biologist": (0.82, 0.66, 0.55, 0.72, 0.15),
    "robotics-engineer": (0.79, 0.72, 0.64, 0.62, 0.14),
    "agri-drone-engineer": (0.74, 0.68, 0.58, 0.60, 0.12),
    "ux-designer": (0.80, 0.74, 0.66, 0.35, 0.30),
    "doctor-mbbs": (0.58, 0.80, 0.70, 0.95, 0.08),
}

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
        date(2027, 1, 21),
        date(2027, 1, 31),
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
        3,
        ["tuition", "living"],
        {
            "all": [
                {"field": "board_percentile", "op": ">=", "value": 80},
                {"field": "annual_income", "op": "<=", "value": 450_000},
            ]
        },
        "Top 20th percentile in Class 12 board; family income cap applies",
        0.35,
        True,
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
