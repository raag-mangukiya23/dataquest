# Real-time and truthful data in PRISM

Two separate promises are involved, and we only make the ones we can keep:

1. **Recommendations are computed live.** Every request reruns the engine on the student's current
   answers, the family's current inputs and the active dataset. Nothing is precomputed.
2. **Data is as current as its source, and labelled.** Each dataset follows its publisher's update
   cycle. We show the date of every figure and whether anyone has checked it.

We never call the market data "real-time" unless the live postings feed is configured and has run that
day. `GET /api/v1/system/data-status` states the current situation in one sentence, and the demo shows it.

## 1. How "real-time" actually works

| Dataset | Publisher's cycle | How PRISM refreshes it | Freshness rule |
|---|---|---|---|
| Market demand, job velocity | Daily (job ads), monthly (indices) | **Adzuna API, daily** when a free key is set; Naukri JobSpeak and EPFO payroll monthly by hand | fresh ≤ 30 days |
| Salary bands | Continuous (ads), annual (surveys) | Adzuna mean advertised salary; PLFS earnings tables | fresh ≤ 180 days |
| Career requirement profiles | Annual | O*NET database download, mapped to Indian careers | fresh ≤ 365 days |
| Fees | Once per academic year | Copied from the institution's or fee committee's notice | fresh ≤ 365 days |
| Exam dates | When NTA or a state body publishes | Copied from the calendar or information bulletin | fresh ≤ 30 days in notification season |
| Scholarships | Once per year | National Scholarship Portal and provider notices | fresh ≤ 365 days |

Mechanics:

- **Live feed.** `app/etl/adapters/adzuna.py` counts live job ads per career, for India and per city. The
  free tier allows 250 calls a day. National counts come first, and the rest of the budget rotates through
  city × career pairs. Demand is a career's percentile rank by posting count within its region; velocity is
  the change against the snapshot about 30 days earlier. Without a key the feed reports itself disabled,
  and nothing else breaks.
- **Freshness and decay.** `app/engine/freshness.py` marks each dataset fresh, aging or stale against its
  cycle. Older observations count less (half-life of one cycle), and stale inputs lower a recommendation's
  confidence and widen its range.
- **Old runs never change silently.** A refresh creates a new dataset version. Earlier runs keep the data
  they used and show `is_outdated: true`; the UI can offer "Re-run with latest data", and
  `/analysis/compare` shows what moved.
- **Refreshes fail closed.** If new data fails a quality gate, the previous version stays active.

## 2. How we make sure figures are true

Enforced in code, not just policy:

1. **Every figure carries provenance**: source, date, confidence, `is_estimate`, plus a verification
   status: `unverified`, `secondary` (matches reputable reporting of the official notice), `verified`
   (checked on the official page) or `disputed`.
2. **A figure can't be shown as fact unless it's checked.** The schema rejects `is_estimate=false` without
   a checked status, evidence and a check date. `verified` also requires the official https URL, and
   `disputed` figures must stay estimates. The database will carry the same rules as CHECK constraints.
3. **Quality gates** (`app/etl/quality.py`) run on every dataset:
   - salary ordering and plausible ranges
   - exam date order (registration before the exam)
   - fee year not in the future
   - per-year scholarship amounts that match the number of years
   - machine-checkable eligibility rules: only known fields and operators, so no protected attributes
   - outlier detection on market signals
   - duplicate keys and future dates
4. **Each recommendation reports its own trust.** `data_trust` lists every input behind it (market, salary,
   fees, scholarships, exam dates), says which are checked, and lowers `confidence` when they aren't:
   `0.85 × (0.7 + 0.3 × checked share) × freshness factor × (1 − imputation penalty)`.
5. **Two-person check.** One person enters a figure with its evidence: the document, the section or table,
   and the date. A second person opens the official page and marks it `verified`. If sources disagree,
   it's marked `disputed`.

## 3. What the first source check found (7 Oct 2026)

I checked 4 figures that appear in the demo. 3 were wrong or incomplete.

| Figure | Our fixture said | The source says | Now |
|---|---|---|---|
| JEE Main 2027 Session 1 | 21–31 Jan 2027 | NTA calendar of 16 Sep 2026: 22–24 and 28–30 Jan 2027, 31 Jan buffer, tentative | corrected, `secondary` |
| Central Sector Scholarship | ₹12,000 × 3 years, combinable | ₹12,000/yr in years 1–3, ₹20,000/yr in years 4–5; income below ₹4.5 L; above 80th percentile; **not with any other scholarship** | corrected, `secondary` |
| INSPIRE-SHE | ₹80,000/yr, top 1 % | ₹60,000 + ₹20,000 summer attachment = ₹80,000/yr, top 1 %, basic sciences, 5 years | matched, `secondary` |
| NEET-UG / CUET-UG 2027 dates | May 2027 | not in NTA's 16 Sep 2026 calendar | stay estimates, labelled |

"Secondary" means multiple news outlets reported the same official notice. This build environment
couldn't open nta.ac.in or scholarships.gov.in directly, so someone needs to confirm these on the
official pages to make them `verified`.

Overall: **3 of 80 figures (4 %) are checked.** The other 77 are labelled estimates. Two scholarships in
the fixtures are made-up placeholders and must be replaced with real schemes before the demo.

## 4. Sources

| Source | Access | Cycle | Supplies | Notes |
|---|---|---|---|---|
| [Adzuna API](https://developer.adzuna.com) | API, free key | daily | demand, salaries | India supported; 250 calls/day; skews urban and white-collar |
| [Naukri JobSpeak](https://www.naukri.com/blog) | manual | monthly | demand by sector and city | e.g. July 2026 index 3,227, +5 % YoY |
| [EPFO payroll data](https://www.epfindia.gov.in) | manual | monthly | formal job growth by industry and state | provisional, revised monthly |
| [PLFS, MoSPI](https://www.mospi.gov.in) | download | monthly and quarterly | unemployment, earnings | monthly bulletins since 2025 |
| [O*NET](https://www.onetcenter.org) | download | several releases a year | career trait profiles | CC BY 4.0; RIASEC profiles for 900+ occupations |
| [NIRF](https://www.nirfindia.org) | download | annual | institution rankings | 2025 edition out |
| [NTA](https://nta.ac.in) | manual | as published | exam dates | 2026-27 calendar out 16 Sep 2026 |
| [National Scholarship Portal](https://scholarships.gov.in) | manual | annual | central and state schemes | |
| [data.gov.in](https://data.gov.in) | API, free key | varies | district indicators | no adapter yet |
| [National Career Service](https://www.ncs.gov.in) | manual | monthly | vacancies by occupation | |

The registry lives in `app/etl/sources.py`. Only sources whose URLs were confirmed to exist are listed.

## 5. Before the demo

```bash
cd backend
python scripts/data_audit.py --demo           # what's checked, what's stale, what the demo still shows unchecked
python scripts/data_audit.py --demo --strict  # exits 1 until every on-screen figure is checked
```

- [ ] Split the "Verify before the demo" list across the team; it's 30 figures, roughly 3 hours for four people.
      For each one, record the source URL, the evidence (document, section, date) and the check date.
- [ ] Replace the two placeholder scholarships with real schemes, or remove them.
- [ ] Confirm the JEE Main, Central Sector and INSPIRE-SHE figures on the official pages, which flips them
      to `verified`.
- [ ] Get a free Adzuna key and run `POST /api/v1/admin/data/refresh {"source": "adapter"}` on the
      morning of the demo, so "refreshed today" is true.
- [ ] Show `/system/data-status` in the demo (step 11 of the walkthrough).

## 6. Limitations we state openly

- Adzuna counts online ads, so it under-represents informal and rural work.
- Career requirement profiles are expert estimates until they're mapped to O*NET data.
- Scholarship award probabilities are PRISM heuristics, not published figures.
- Psychometric percentiles stay empty until 200 students in a grade band have taken the questionnaire
  (see `QUESTIONNAIRE.md`).
