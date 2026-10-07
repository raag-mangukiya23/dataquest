"""Domain prototype vectors in the canonical space, used by the deterministic fallback.

Each prototype starts at a neutral 0.5 and overrides the dimensions that characterise the
domain. Values are expert-judgement priors inspired by the public Holland RIASEC framework,
not fitted parameters; they are documented in /system/methodology as such.
"""

from app.core.dimensions import DIMENSIONS, CareerDomain

_OVERRIDES: dict[CareerDomain, dict[str, float]] = {
    CareerDomain.ENGINEERING: {
        "riasec_r": 0.85,
        "riasec_i": 0.80,
        "riasec_a": 0.35,
        "riasec_s": 0.30,
        "apt_numerical": 0.85,
        "apt_logical": 0.80,
        "apt_spatial": 0.80,
        "apt_verbal": 0.45,
        "cog_analytical": 0.80,
        "cog_practical": 0.75,
        "val_security": 0.60,
    },
    CareerDomain.COMPUTING_AI: {
        "riasec_i": 0.90,
        "riasec_c": 0.65,
        "riasec_r": 0.45,
        "riasec_s": 0.25,
        "apt_numerical": 0.85,
        "apt_logical": 0.90,
        "apt_verbal": 0.50,
        "cog_analytical": 0.90,
        "val_financial": 0.70,
        "val_autonomy": 0.65,
    },
    CareerDomain.HEALTH_LIFE_SCIENCES: {
        "riasec_i": 0.85,
        "riasec_s": 0.80,
        "riasec_r": 0.55,
        "riasec_e": 0.30,
        "apt_verbal": 0.65,
        "apt_numerical": 0.65,
        "apt_logical": 0.70,
        "val_impact": 0.85,
        "val_security": 0.70,
        "grit": 0.85,
        "cog_analytical": 0.70,
    },
    CareerDomain.DESIGN_ARTS: {
        "riasec_a": 0.95,
        "riasec_c": 0.25,
        "riasec_i": 0.45,
        "riasec_e": 0.55,
        "apt_spatial": 0.80,
        "apt_verbal": 0.60,
        "cog_creative": 0.95,
        "cog_analytical": 0.40,
        "val_autonomy": 0.80,
        "val_security": 0.35,
        "risk_tolerance": 0.65,
    },
    CareerDomain.BUSINESS_FINANCE: {
        "riasec_e": 0.85,
        "riasec_c": 0.75,
        "riasec_s": 0.50,
        "riasec_a": 0.30,
        "riasec_r": 0.25,
        "apt_numerical": 0.80,
        "apt_verbal": 0.70,
        "cog_practical": 0.70,
        "val_financial": 0.85,
        "risk_tolerance": 0.60,
    },
    CareerDomain.LAW_POLICY: {
        "riasec_e": 0.75,
        "riasec_s": 0.65,
        "riasec_i": 0.60,
        "riasec_r": 0.20,
        "apt_verbal": 0.90,
        "apt_logical": 0.80,
        "apt_spatial": 0.30,
        "cog_analytical": 0.75,
        "val_impact": 0.70,
        "grit": 0.75,
    },
    CareerDomain.EDUCATION_RESEARCH: {
        "riasec_s": 0.85,
        "riasec_i": 0.80,
        "riasec_e": 0.40,
        "riasec_r": 0.35,
        "apt_verbal": 0.75,
        "cog_analytical": 0.70,
        "val_impact": 0.85,
        "val_financial": 0.35,
        "val_security": 0.65,
        "grit": 0.75,
    },
    CareerDomain.MEDIA_COMMUNICATION: {
        "riasec_a": 0.80,
        "riasec_e": 0.75,
        "riasec_s": 0.65,
        "riasec_c": 0.30,
        "riasec_r": 0.25,
        "apt_verbal": 0.90,
        "cog_creative": 0.80,
        "val_autonomy": 0.70,
        "val_security": 0.35,
        "risk_tolerance": 0.65,
    },
    CareerDomain.AGRI_ENVIRONMENT: {
        "riasec_r": 0.80,
        "riasec_i": 0.75,
        "riasec_s": 0.55,
        "riasec_e": 0.40,
        "apt_spatial": 0.60,
        "cog_practical": 0.85,
        "val_impact": 0.85,
        "val_financial": 0.40,
        "grit": 0.75,
    },
    CareerDomain.ENERGY_MANUFACTURING: {
        "riasec_r": 0.90,
        "riasec_c": 0.65,
        "riasec_i": 0.65,
        "riasec_a": 0.25,
        "riasec_s": 0.30,
        "apt_numerical": 0.75,
        "apt_spatial": 0.80,
        "cog_practical": 0.90,
        "val_security": 0.75,
    },
    CareerDomain.AEROSPACE_MOBILITY: {
        "riasec_r": 0.85,
        "riasec_i": 0.85,
        "riasec_s": 0.25,
        "apt_numerical": 0.90,
        "apt_spatial": 0.90,
        "apt_logical": 0.85,
        "cog_analytical": 0.85,
        "grit": 0.85,
        "risk_tolerance": 0.60,
    },
    CareerDomain.HOSPITALITY_SERVICES: {
        "riasec_s": 0.85,
        "riasec_e": 0.75,
        "riasec_c": 0.55,
        "riasec_i": 0.30,
        "apt_verbal": 0.75,
        "cog_practical": 0.85,
        "cog_analytical": 0.40,
        "val_security": 0.55,
        "val_autonomy": 0.45,
    },
}


def _build(overrides: dict[str, float]) -> tuple[float, ...]:
    unknown = set(overrides) - set(DIMENSIONS)
    if unknown:
        raise ValueError(f"unknown dimensions in prototype: {sorted(unknown)}")
    return tuple(overrides.get(d, 0.5) for d in DIMENSIONS)


DOMAIN_PROTOTYPES: dict[str, tuple[float, ...]] = {d.value: _build(o) for d, o in _OVERRIDES.items()}
