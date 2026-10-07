# PRISM Engine — Demo Plan

Goal: a 7-minute live demo that cannot fail on stage, tells one family's story, and shows judges every part
of the problem statement working, with the "why" visible on screen.

## 1. The story (one family, ten beats)

Persona: **Ananya R., Grade 12 PCM, Coimbatore 641004.** She is analytical and creative; her parents want
medicine and stability; family income is ₹9 L a year. The scripted steps are served by
`GET /api/v1/demo/walkthrough`, with a presenter line and the JSON paths to point at for each step.

| # | Beat | Endpoint | What the judge should notice | Time |
|---|---|---|---|---|
| 1 | Credibility first | `GET /system/methodology` | Formulas, weights, fairness safeguards and limitations are public | 0:30 |
| 2 | Student profile | `GET /students/{id}/traits` | 19-dimension vector, Holland code, no protected attributes | 0:40 |
| 3 | Parent's private inputs | `GET /families/{id}/finance` (parent) | Budget, EMI limit, risk appetite, kept private from the student | 0:30 |
| 4 | One run, explained | `POST /analysis/runs` | Score split into six parts, pathway costed against the budget, six buckets | 1:00 |
| 5 | Family conflict | `GET /runs/{id}/conflict` (parent) | Index 46/100, top three drivers, conversation prompts, bridge careers | 0:45 |
| 6 | Student view | same, as student | Gentle summary only | 0:20 |
| 7 | What-if | `POST /runs/{id}/what-if` | +₹8 L savings: Robotics goes loan-dependent → stretch, ranks shift | 0:45 |
| 8 | 5-year roadmap | `GET /runs/{id}/roadmap` | Exam sessions, scholarship deadlines, skill actions, local project | 0:40 |
| 9 | Hyper-local | `GET /local-opportunities?pincode=642001` | Coconut-pest drone problem in Pollachi, linked careers | 0:30 |
| 10 | Trust | `GET /runs/{id}` | Robustness 0.82, top-1 stable in 89 % of 64 scenarios, input hash | 0:30 |

Total: 6:10, leaving about 50 seconds for questions inside a 7-minute slot.

Close on: "Every number you saw is explainable, reproducible from the stored inputs, and marked as an
estimate until it has been verified."

## 2. Making it fail-proof

| Risk on stage | Guard |
|---|---|
| Venue wifi drops | Run everything locally with `docker compose up` (Phase 8). The hosted copy is a backup, not the primary. |
| Free-tier host is asleep (cold start ~30 s) | Hit `/system/health` 2 minutes before going on; Phase 8 adds a keep-warm ping. |
| Database or engine bug during the demo | Restart with `MOCK_MODE=true`. The frontend works unchanged because mock and live return identical shapes, and the walkthrough is tested against mock mode in CI (`tests/test_demo.py`). |
| Earlier rehearsal left the data in a strange state | `POST /api/v1/demo/reset` restores every persona (live from Phase 1; a no-op in mock mode). |
| Deadlines appear "in the past" because the demo date moved | `DEMO_TODAY` freezes the engine's "today"; a test asserts no year-1 deadline is before it. |
| A step silently breaks after a code change | `tests/test_demo.py` replays all ten steps and checks each highlighted JSON path exists. |
| Slow response on stage | Target < 500 ms per full run; `X-Response-Time-ms` header shows it live. |
| A judge asks "is this real data?" | Every figure carries `source_name`, `as_of`, `confidence` and `is_estimate`; `/system/methodology` lists limitations. Say "estimates, clearly labelled". |

## 3. Persona switcher

`GET /api/v1/demo/personas` returns five personas with login emails and a shared demo password
(`DEMO_MODE` only). Each one proves something different:

| Persona | Proves |
|---|---|
| creative_risk_averse (Ananya, Coimbatore) | Conflict index, bridge careers, infeasible stretch goals, hidden gem |
| high_aptitude_low_budget (Karthik, Madurai) | Scholarship knapsack turns a stretch path into a comfortable one |
| rural_steam_innovator (Meena, Dharmapuri) | Pincode-level local opportunities drive recommendations |
| loan_dependent_family (Rahul, Pune) | EMI, burden ratio, payback, loan-tolerance what-if |
| aligned_family (Sara, Bengaluru) | Low conflict, high robustness |

Only Ananya has full fixtures in mock mode. The other four become fully live once Phase 1 seeds them, and
Phase 4 turns all five into golden-file tests.

## 4. Before going on stage

- [ ] `docker compose up` from a clean clone works on the presenting laptop
- [ ] `POST /api/v1/demo/reset` returns `status: reset`
- [ ] `/system/health` shows database ok; ML model ok or "fallback active" (both fine; say which)
- [ ] Every number shown in steps 3–8 checked against the data verification list (exam dates, fee figures,
      scholarship amounts); anything unverified stays labelled as an estimate
- [ ] Browser zoom at 125 %, dark mode off, notifications off
- [ ] Backup: screen recording of a clean run, kept on the desktop

## 5. Likely judge questions

| Question | Answer |
|---|---|
| How do you avoid bias? | No gender, caste, religion or community in any feature; quota affects fees only; analytics are k-anonymised. |
| Why should we trust the ranking? | Per-component contributions, sensitivity analysis (±20 %), and reproducible runs (input hash + dataset version). |
| Is the market data live? | No. It's a versioned snapshot with an admin refresh endpoint; we never call it real-time. |
| What if the ML model is wrong or missing? | Its weight `alpha` is in the versioned config, and a deterministic cosine fallback keeps the system working. |
| How do parents and students stay private from each other? | Role-based views; raw answers or finances are shared only with explicit, revocable consent. |
