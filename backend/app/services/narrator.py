"""Plain-language run summaries in English, Tamil and Hindi, optionally rephrased by a language model.

The engine decides; the narrator only explains. Rules:
  1. Facts are pulled from the run deterministically. Only that anonymised fact sheet leaves the server:
     no names, ids, emails, pincodes, answers or family money (savings, income, loan size).
  2. The model may rephrase and translate, never add. Any number in its answer that is not in the facts
     rejects the whole answer (see `_numbers_ok`), and the fixed template is used instead.
  3. No key, a timeout, a blocked network or a bad answer -> the template. Same response shape, source="template".
Works with any OpenAI-compatible chat endpoint (xAI Grok by default: GROK_API_KEY, GROK_MODEL, GROK_BASE_URL).
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from collections import OrderedDict

import httpx

from app.core.config import get_settings
from app.schemas.analysis import AnalysisRun
from app.schemas.common import Role
from app.schemas.reports import Language, Narrative

log = logging.getLogger(__name__)
REVIEWED = {Language.EN}  # flip to include TA/HI once a native speaker has checked the templates
_CACHE: OrderedDict[str, tuple[str, list[str], str]] = OrderedDict()
_CACHE_MAX = 500

AFFORD = {
    Language.EN: {
        "comfortable": "comfortable",
        "stretch": "a stretch",
        "loan_dependent": "possible with an education loan",
        "infeasible": "out of reach for now",
    },
    Language.TA: {
        "comfortable": "எளிதில் சமாளிக்கக்கூடியது",
        "stretch": "சற்று சிரமமானது",
        "loan_dependent": "கல்விக் கடனுடன் சாத்தியம்",
        "infeasible": "தற்போது எட்ட முடியாதது",
    },
    Language.HI: {
        "comfortable": "आसानी से संभव",
        "stretch": "थोड़ा कठिन",
        "loan_dependent": "शिक्षा ऋण के साथ संभव",
        "infeasible": "अभी पहुँच से बाहर",
    },
}
BAND = {
    Language.EN: {
        "aligned": "agree",
        "mild": "mostly agree",
        "moderate": "partly disagree",
        "high": "disagree a lot",
    },
    Language.TA: {
        "aligned": "ஒத்த கருத்து",
        "mild": "சிறிய வேறுபாடு",
        "moderate": "மிதமான வேறுபாடு",
        "high": "அதிக வேறுபாடு",
    },
    Language.HI: {"aligned": "एकमत", "mild": "हल्का मतभेद", "moderate": "मध्यम मतभेद", "high": "गहरा मतभेद"},
}
T = {
    Language.EN: {
        "headline": "Best match: {name} ({score}% overall)",
        "fit": "{name} fits the student's profile at {fit}%.",
        "route": "Study route: {pathway}, about Rs {cost} in total. For this family it is {afford}.",
        "admission": "Admission is competitive: about {chance}% chance with current scores (estimate).",
        "others": "Other strong options: {names}.",
        "family": "Student and parents {band} on career direction. Careers both sides accept: {names}.",
        "stable": "The first place held in {stab}% of {n} tests where the weights were changed.",
        "schol": "Scholarships to check: {names}.",
        "notice": "Estimates from dataset {version}. Confirm fees, dates and eligibility on official websites.",
    },
    Language.TA: {
        "headline": "சிறந்த பொருத்தம்: {name} (மொத்தம் {score}%)",
        "fit": "{name} மாணவரின் சுயவிவரத்துடன் {fit}% பொருந்துகிறது.",
        "route": "படிப்பு வழி: {pathway}, மொத்தம் சுமார் ₹{cost}. இந்தக் குடும்பத்திற்கு இது {afford}.",
        "admission": "சேர்க்கை போட்டி அதிகம்: தற்போதைய மதிப்பெண்களுடன் வாய்ப்பு சுமார் {chance}% (மதிப்பீடு).",
        "others": "மற்ற நல்ல வாய்ப்புகள்: {names}.",
        "family": "தொழில் தேர்வில் மாணவர்-பெற்றோர் நிலை: {band}. இருவரும் ஏற்கும் தொழில்கள்: {names}.",
        "stable": "எடைகளை மாற்றிய {n} சோதனைகளில் {stab}% முறை முதல் இடம் மாறவில்லை.",
        "schol": "பார்க்க வேண்டிய உதவித்தொகைகள்: {names}.",
        "notice": "{version} தரவின் மதிப்பீடுகள். கட்டணம், தேதிகள், தகுதியை அதிகாரப்பூர்வ இணையதளங்களில் உறுதிசெய்யவும்.",
    },
    Language.HI: {
        "headline": "सबसे अच्छा मेल: {name} (कुल {score}%)",
        "fit": "{name} छात्र की प्रोफ़ाइल से {fit}% मेल खाता है।",
        "route": "पढ़ाई का रास्ता: {pathway}, कुल लगभग ₹{cost}। इस परिवार के लिए यह {afford} है।",
        "admission": "दाख़िला कठिन है: मौजूदा अंकों से लगभग {chance}% संभावना (अनुमान)।",
        "others": "अन्य अच्छे विकल्प: {names}।",
        "family": "करियर की दिशा पर छात्र और माता-पिता: {band}। दोनों को स्वीकार्य करियर: {names}।",
        "stable": "वज़न बदलकर किए गए {n} परीक्षणों में से {stab}% में पहला स्थान नहीं बदला।",
        "schol": "देखने लायक छात्रवृत्तियाँ: {names}।",
        "notice": "डेटासेट {version} पर आधारित अनुमान। फ़ीस, तारीखें और पात्रता आधिकारिक वेबसाइटों पर जाँचें।",
    },
}
LANG_NAME = {Language.EN: "English", Language.TA: "Tamil", Language.HI: "Hindi"}


def facts_for(run: AnalysisRun, audience: str) -> dict:
    """The anonymised fact sheet. Career and course names are catalogue entries, not personal data."""
    top = run.recommendations[0]
    f = top.financial
    out: dict = {
        "audience": audience,
        "top": {
            "name": top.career.name,
            "score": round(100 * top.final_score),
            "fit": round(100 * top.fit.fit),
            "pathway": f"{f.pathway_name} ({f.institution_name})",
            "cost": f.total_cost,
            "afford": f.affordability_class.value,
        },
        "others": [r.career.name for r in run.recommendations[1:3]],
        "family_band": run.conflict.band.value,
        "bridges": [b.career.name for b in run.conflict.bridge_careers[:2]],
        "scholarships": [s.name for s in f.scholarship_plan[:3]],
        "version": run.reproducibility.dataset_version,
    }
    if f.admission_chance < 0.6:
        out["top"]["chance"] = round(100 * f.admission_chance)
    if run.sensitivity:
        out["stability"] = {
            "stab": round(100 * run.sensitivity.top1_stability),
            "n": run.sensitivity.scenarios,
        }
    return out


def template(facts: dict, lang: Language) -> tuple[str, list[str], str]:
    t, top = T[lang], facts["top"]
    cost = f"{top['cost']:,}"
    bullets = [
        t["fit"].format(**top),
        t["route"].format(pathway=top["pathway"], cost=cost, afford=AFFORD[lang][top["afford"]]),
    ]
    if "chance" in top:
        bullets.append(t["admission"].format(chance=top["chance"]))
    if facts["others"]:
        bullets.append(t["others"].format(names=", ".join(facts["others"])))
    if facts["bridges"]:
        bullets.append(
            t["family"].format(band=BAND[lang][facts["family_band"]], names=", ".join(facts["bridges"]))
        )
    if "stability" in facts:
        bullets.append(t["stable"].format(**facts["stability"]))
    if facts["scholarships"]:
        bullets.append(t["schol"].format(names=", ".join(facts["scholarships"])))
    return t["headline"].format(**top), bullets, t["notice"].format(version=facts["version"])


_NUM = re.compile(r"\d[\d,.]*")


def _numbers(text: str) -> set[int]:
    out = set()
    for m in _NUM.findall(text):
        digits = m.split(".")[0].replace(",", "")
        if digits:
            out.add(int(digits))  # int() also reads Tamil and Devanagari digits
    return out


def _numbers_ok(answer: str, facts: dict) -> bool:
    allowed = _numbers(json.dumps(facts, ensure_ascii=False)) | set(range(0, 11))
    return _numbers(answer) <= allowed


def _ask_model(facts: dict, lang: Language, client: httpx.Client | None) -> tuple[str, list[str]] | None:
    s = get_settings()
    if not s.grok_api_key:
        return None
    system = (
        "You explain a career-guidance result to an Indian family. Use ONLY the JSON facts given. "
        "Do not add numbers, careers, colleges, scholarships, advice or promises that are not in the facts. "
        f"Write in simple {LANG_NAME[lang]} for a {facts['audience']}; keep career and course names as given. "
        'Return JSON: {"headline": "...", "bullets": ["...", "..."]} with at most 7 short bullets.'
    )
    body = {
        "model": s.grok_model,
        "temperature": 0.2,
        "max_tokens": 700,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(facts, ensure_ascii=False)},
        ],
    }
    http = client or httpx.Client(timeout=s.grok_timeout_sec)
    try:
        r = http.post(
            f"{s.grok_base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {s.grok_api_key}"},
            json=body,
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
        data = json.loads(content[content.find("{") : content.rfind("}") + 1])
        headline, bullets = str(data["headline"]).strip(), [str(b).strip() for b in data["bullets"]][:7]
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as e:
        log.warning("narrator model call failed, using template: %s", type(e).__name__)
        return None
    finally:
        if client is None:
            http.close()
    if not headline or not bullets or not _numbers_ok(" ".join([headline, *bullets]), facts):
        log.warning("narrator answer rejected (empty or invented numbers), using template")
        return None
    return headline, bullets


def narrate(
    run: AnalysisRun, role: Role, lang: Language = Language.EN, client: httpx.Client | None = None
) -> Narrative:
    audience = "student" if role is Role.STUDENT else "parent"
    facts = facts_for(run, audience)
    s = get_settings()
    key = hashlib.sha256(
        json.dumps([facts, lang.value, s.grok_model, bool(s.grok_api_key)], sort_keys=True).encode()
    ).hexdigest()
    headline, bullets, notice = template(facts, lang)
    if key in _CACHE:
        headline, bullets, source = _CACHE[key]
    else:
        got = _ask_model(facts, lang, client)
        source = "model" if got else "template"
        if got:
            headline, bullets = got
            _CACHE[key] = (headline, bullets, source)
            if len(_CACHE) > _CACHE_MAX:
                _CACHE.popitem(last=False)
    return Narrative(
        run_id=run.run_id,
        language=lang,
        audience=audience,
        headline=headline,
        bullets=bullets,
        source=source,
        model=s.grok_model if source == "model" else None,
        facts=facts,
        translation_reviewed=lang in REVIEWED and source == "template",
        notice=notice,
    )
