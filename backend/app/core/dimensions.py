"""Canonical feature space shared by the scoring engine, the ML model and the frontend.

The student vector S and every career vector C live in this exact, ordered 19-dimensional
space, each component normalised to [0, 1]. Changing the order or the members is a breaking
contract change: bump VECTOR_SPEC_VERSION and tell Person 3 (ML) and Person 1 (frontend).

Fairness safeguard: gender, caste, religion and community are NOT part of this space and
must never be added as features.
"""

from enum import StrEnum

VECTOR_SPEC_VERSION = "vec-1"

RIASEC = ("riasec_r", "riasec_i", "riasec_a", "riasec_s", "riasec_e", "riasec_c")
APTITUDE = ("apt_numerical", "apt_verbal", "apt_logical", "apt_spatial")
COGNITIVE = ("cog_analytical", "cog_creative", "cog_practical")
WORK_VALUES = ("val_security", "val_autonomy", "val_impact", "val_financial")
DISPOSITION = ("grit", "risk_tolerance")

DIMENSIONS: tuple[str, ...] = RIASEC + APTITUDE + COGNITIVE + WORK_VALUES + DISPOSITION

DIMENSION_LABELS: dict[str, str] = {
    "riasec_r": "Realistic (hands-on, building, tools)",
    "riasec_i": "Investigative (analysing, researching)",
    "riasec_a": "Artistic (creating, designing, expressing)",
    "riasec_s": "Social (helping, teaching, caring)",
    "riasec_e": "Enterprising (leading, persuading, starting)",
    "riasec_c": "Conventional (organising, data, procedures)",
    "apt_numerical": "Numerical aptitude",
    "apt_verbal": "Verbal aptitude",
    "apt_logical": "Logical reasoning",
    "apt_spatial": "Spatial reasoning",
    "cog_analytical": "Analytical thinking style",
    "cog_creative": "Creative thinking style",
    "cog_practical": "Practical thinking style",
    "val_security": "Values job security",
    "val_autonomy": "Values autonomy",
    "val_impact": "Values social impact",
    "val_financial": "Values financial reward",
    "grit": "Grit / perseverance",
    "risk_tolerance": "Personal risk tolerance",
}


class DimensionGroup(StrEnum):
    RIASEC = "riasec"
    APTITUDE = "aptitude"
    COGNITIVE = "cognitive"
    WORK_VALUES = "work_values"
    DISPOSITION = "disposition"


DIMENSION_GROUP: dict[str, DimensionGroup] = {
    **{d: DimensionGroup.RIASEC for d in RIASEC},
    **{d: DimensionGroup.APTITUDE for d in APTITUDE},
    **{d: DimensionGroup.COGNITIVE for d in COGNITIVE},
    **{d: DimensionGroup.WORK_VALUES for d in WORK_VALUES},
    **{d: DimensionGroup.DISPOSITION for d in DISPOSITION},
}


class CareerDomain(StrEnum):
    """Coarse domains the ML model predicts over (and the sector taxonomy for careers)."""

    ENGINEERING = "engineering"
    COMPUTING_AI = "computing_ai"
    HEALTH_LIFE_SCIENCES = "health_life_sciences"
    DESIGN_ARTS = "design_arts"
    BUSINESS_FINANCE = "business_finance"
    LAW_POLICY = "law_policy"
    EDUCATION_RESEARCH = "education_research"
    MEDIA_COMMUNICATION = "media_communication"
    AGRI_ENVIRONMENT = "agri_environment"
    ENERGY_MANUFACTURING = "energy_manufacturing"
    AEROSPACE_MOBILITY = "aerospace_mobility"
    HOSPITALITY_SERVICES = "hospitality_services"


DOMAINS: tuple[str, ...] = tuple(d.value for d in CareerDomain)
