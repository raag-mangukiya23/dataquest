# The PRISM questionnaire

The student takes five short instruments; the parent fills in a separate finance and aspirations form.
Items live in `backend/data/instruments/*.json` so teachers and reviewers can read and edit them without
touching code, and the loader rejects a malformed bank at start-up.

## What the student takes

| Instrument | Measures | Items | Format | Time |
|---|---|---|---|---|
| Interest Explorer (`riasec_v1`) | Holland RIASEC interests (6) | 24 | How much would you enjoy this? (1–5) | ~4 min |
| Reasoning Sprint (`aptitude_v1`) | Numerical, verbal, logical, spatial | 16 | Multiple choice, easy → hard, 20-minute limit | ~15 min |
| Thinking Style (`cognitive_v1`) | Analytical, creative, practical | 12 | Agree (1–5), 1 reverse item per trait | ~2 min |
| What Matters To You (`values_v1`) | Security, autonomy, impact, financial reward | 12 | Agree (1–5), 1 reverse item per trait | ~2 min |
| Grit & Risk (`disposition_v1`) | Perseverance, risk tolerance | 10 | Agree (1–5), 2 reverse items per trait | ~2 min |

74 items, about 25 minutes. Offer it in two sittings: interests and styles first, aptitude second.

## Design rules

- **Original items only.** The frameworks are public: Holland's RIASEC theory, work-values research, and
  the triarchic view of thinking styles. The International Personality Item Pool, which is public domain,
  served as a style reference. No wording comes from commercial inventories or copyrighted scales such as
  the Grit Scale.
- **Written for Indian Grade 9–12 students.** The items describe activities (fixing a fan, a science fair
  model, keeping shop accounts), not job titles, so students aren't steered towards careers they already
  know.
- **Reverse-worded items** in every agree-scale trait counter "yes to everything" answering. Interest items
  aren't reverse-worded, which is standard for interest inventories.
- **Aptitude:** 4 questions per area, easy to hard. The correct answer is in each position (a/b/c/d)
  exactly 4 times, so guessing one letter doesn't pay off. Every key was checked by hand.
- **Nothing to game.** Clients receive opaque question ids, items interleaved across traits, and no
  answer keys, reverse flags or trait names.
- **No protected attributes.** Nothing asks about gender, caste, religion or community.

## Scoring (`app/engine/psychometrics.py`)

| Step | Rule |
|---|---|
| Reverse keying | `keyed = 6 − answer` for reverse-worded items |
| Agree and interest traits | `score = (mean(keyed) − 1) / 4`, giving 0–1 |
| Aptitude | Difficulty-weighted accuracy (1 / 1.5 / 2), corrected for guessing: `max(0, (p − 0.25) / 0.75)` |
| Missing answers | Fewer than half the items answered: the trait is set to a neutral 0.5 and marked imputed. Imputed traits lower recommendation confidence. A skipped aptitude question counts as wrong unless the whole section was skipped. |
| Per-student reliability | `coverage × (0.5 + 0.5 × consistency)`, where consistency = `1 − sd/2` across the trait's items |
| Percentiles | **Not shown** until at least 200 students in the same grade band have taken the instrument. We don't invent a comparison group. |

## Quality checks on every submission

| Flag | Trigger | Effect |
|---|---|---|
| `straight_lining` | 8 or more answers, all identical | Agree and interest traits' reliability × 0.5 |
| `speeding` | Median answer under 0.8 s (agree items) or 3 s (aptitude) | Reliability × 0.7 |
| `contradictory_answers:<trait>` | Agrees, or disagrees, with both a statement and its reverse | That trait's reliability × 0.6 |
| `incomplete` | Under 80 % answered | Reported to the student and counsellor |

The flags are shown with the results, so a counsellor can ask the student to retake carelessly answered
sections.

## The demo student's profile is real output

The demo persona answered all 74 items, apart from two skipped "financial reward" items that show
imputation. Her profile is the engine's score of those answers (`app/mocks/persona.py`), not
hand-typed numbers: Holland code IAR, 18 of 19 traits measured, no quality flags.

## What we can and can't claim

- It indicates interests, styles and reasoning strengths. It's not a diagnosis and not a selection test.
- Per-student reliability is a consistency index. Whether each trait's scale is reliable (Cronbach's
  alpha) can only be known after a pilot.
- Four questions per aptitude area gives a rough signal, not a precise one. Aim for 8 or more per area
  after the pilot.

## Pilot plan (before the demo if possible)

1. With consent, have 25–40 students take the instruments. Export their answers as
   `respondent_id,question_id,value`.
2. Run `python scripts/pilot_analysis.py responses.csv`. It reports Cronbach's alpha per trait (target
   ≥ 0.6 at this stage), item-total correlations (flag below 0.2) and aptitude difficulty (flag if fewer
   than 20 % or more than 90 % get it right).
3. Rewrite or replace flagged items and publish them as a new instrument version. Old versions stay
   frozen, so earlier answers keep their meaning.
4. Record the median completion time and trim if it runs over 30 minutes.
5. For Tamil and Hindi versions, use two bilingual reviewers: one translates forward, the other back to
   English, and any disagreement is fixed before publishing.

## The parent form

The parent form isn't psychometric. It covers income band, savings, existing EMIs, dependents, the largest
EMI the family can afford, loan tolerance, risk appetite, willingness to relocate or study abroad, time to
first salary, prestige versus stability, and ranked career preferences. The API rejects incoherent inputs,
such as an EMI larger than monthly income. The student sees only a non-numeric summary of the family's
finances unless consent is given.
