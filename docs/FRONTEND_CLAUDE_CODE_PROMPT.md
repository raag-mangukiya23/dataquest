# PRISM frontend: prompt for Claude Code

Paste everything inside the block below into a Claude Code session opened at the repository root.

````
You are building the frontend for PRISM Engine, our DataQuest 3.0 (VIT Chennai) entry. Submission is tomorrow at 10:00 AM, so ship a polished, working demo tonight. Build in priority order, commit after every screen that works, and never leave the app broken. Polish the screens judges will see; skip what they won't.

## What PRISM is
Career guidance for Indian Grade 9-12 students and their parents. A student answers a 25-minute questionnaire. Parents privately enter budget and career hopes. The backend engine ranks careers on six weighted parts: fit, market, affordability, ROI, family alignment and disruption risk. It also returns:
- a financial plan per course (cost, scholarships, loan, EMI);
- a parent-student conflict index with bridge careers;
- a what-if simulator;
- a 5-year roadmap and a SWOT;
- local STEAM problems in the student's own district.
Every figure carries provenance: whether it is checked or an estimate. The selling points are explainability, honesty about the data, fairness and privacy. The UI must make those visible.

## Read these first (the backend already exists in this repo, do not change it)
- docs/API_CONTRACT.md: every endpoint, who may call it, and the privacy matrix.
- backend/contracts/openapi.json: generate TypeScript types from this.
- backend/contracts/fixtures/*.json: a real response for every endpoint. Use them for types, sample data and fixture mode.
- docs/REAL_WORLD.md: reminders, report, counsellor dashboard, loans, fairness, mentors.
- docs/DEMO_PLAN.md and backend/contracts/fixtures/demo_walkthrough.json: the 7-minute demo script.
- docs/FRONTEND_STITCH_PROMPTS.md: an earlier screen-by-screen design brief. Use it for layout ideas, but take numbers from the fixtures; its sample numbers are out of date.

## Stack (fast to build, easy to deploy)
- Vite + React 18 + TypeScript in a new `frontend/` folder.
- Tailwind CSS with design tokens as CSS variables (light and dark).
- React Router; TanStack Query for data; Recharts for charts; lucide-react for icons; Framer Motion for subtle motion only.
- Generate API types with `npx openapi-typescript ../backend/contracts/openapi.json -o src/api/schema.ts`. Do not hand-write response types.
- No component library beyond small Radix primitives if needed (dialog, tabs, slider, tooltip).
- Fonts from Google Fonts: Bricolage Grotesque (headings), Source Sans 3 (body), JetBrains Mono (all numbers, tabular figures).

## Running the backend locally
cd backend && pip install -e ".[dev]"
- Mock mode (default, no DB): `uvicorn app.main:app --reload --port 8000`.
- Live mode: `python scripts/seed.py --reset && MOCK_MODE=false uvicorn app.main:app --port 8000`.

CORS already allows http://localhost:5173. Put the API base URL in VITE_API_URL (default http://localhost:8000).

## API rules (follow exactly)
1. Envelope. Every JSON response is `{success, data, error, meta}`. Unwrap `data` in one fetch helper. On `success:false`, throw `error.code` and `error.message` and show `error.message` to the user; it is already friendly. `meta.mock` tells you whether the data is mock.
2. Auth has two modes behind one switch, VITE_AUTH_MODE = mock | live.
   - **mock:** no login; send the header `X-Mock-Role: student|parent|educator|admin` from a role switcher in the top bar.
   - **live:** `POST /api/v1/auth/login {email,password}` returns `data.user` and `data.tokens.access_token / refresh_token`. Send `Authorization: Bearer <access>`. On 401, call `POST /api/v1/auth/refresh {refresh_token}` once, then retry. Keep tokens in memory plus sessionStorage.
   - Demo accounts: `<key>.student@prism.example` and `<key>.parent@prism.example`; keys come from GET /api/v1/demo/personas. Also counsellor@prism.example and admin@prism.example. Password for all: Prism@Demo2026.
3. Fixture mode. VITE_DATA_MODE = api | fixtures. In fixtures mode, the same API layer returns the JSON files copied into src/fixtures (write a small script for the copy). This is our safety net if the backend or wifi fails on stage, so every P0 screen must work in fixtures mode.
4. Privacy is enforced by the backend; the UI must handle it gracefully.
   - In the student and educator views, FinancialAssessment.family_funds, loan_capacity, loan_required, monthly_emi, burden_ratio and funding_gap are null. Show "Shared with parents only", never 0 and never a crash.
   - `conflict.visibility` is "full" (parent) or "summary" (student). Summary has no per-dimension gaps.
   - GET /families/{id}/finance returns FamilyFinanceSummary for students: budget_comfort plus booleans, no rupees.
5. Two endpoints are not JSON:
   - GET /api/v1/analysis/runs/{id}/report?lang=en|ta|hi returns an HTML page. Open it in a new tab via fetch → blob URL, because live mode needs the auth header.
   - GET /api/v1/students/{id}/deadlines.ics returns a calendar file. Download it the same way.
6. Never invent numbers. Every figure on screen comes from the API. Where an object has `provenance` or `data_trust`, show a small badge: "Checked" (verification verified or secondary) or "Estimate" (is_estimate true). Show date-status labels too: announced, tentative or estimated.
7. Questionnaire. GET /assessments/instruments, then GET /assessments/{code}/questions.
   - Question ids are opaque (`q_…`) and must be sent back unchanged.
   - Submit with `POST /assessments/{code}/submit {answers:[{question_id, value, response_ms}], client_submission_id}`. Use crypto.randomUUID() for client_submission_id and keep answers in localStorage until the submit succeeds; resubmitting the same id is safe.
   - Never show which trait a question measures.
8. A run: POST /api/v1/analysis/runs {student_id}. Read runs with GET /analysis/runs and GET /analysis/runs/{id}. If `reproducibility.is_outdated` is true, show a "Newer data available — re-run" banner.

## Design system ("a calm scientific instrument")
Concept: a prism splitting light into six colours. Colours are used ONLY for the six score parts, so colour always means something:
- fit #6B5BE2, market #2F80ED, affordability #12A594, roi #5FA83A, family_alignment #E0A21B, disruption #E5534B (hatched, because it subtracts).

Base palette:
- Light: background #F5F7FB, surface #FFFFFF, ink #141826, muted #5B6273, hairline #DDE1EA, primary #3F4FD6.
- Dark: background #0F1218, surface #171B24, text #E8EBF2.

Funding classes: comfortable #1D8A5C, stretch #B7791F, loan_dependent #D2691E, infeasible #C23B33.

Money: Indian format, with ₹6.6 L / ₹1.2 Cr in summaries and ₹6,56,991 in ledgers. Write one formatINR helper.

Reusable components:
- ScoreBar: one bar split by `contributions[].contribution`, with a tooltip per part. Disruption is drawn as a hatched negative segment.
- FundingPill.
- ConfidenceChip: "0.71 · 0.59–0.84" from final_score, ci_low and ci_high.
- TrustBadge: "1 of 5 inputs checked" from data_trust.
- ProvenanceBadge.
- DateStatusTag.
- EmptyState, ErrorState and skeleton loaders.

Look: cards with 12px radius and a 1px hairline instead of heavy shadows, an 8px spacing grid, left-aligned layouts, generous white space.

Motion: score bars grow in once; numbers count up once on first view; that is all.

Must work at 360px phone width (students use phones): the sidebar becomes a bottom nav, with no horizontal scroll. Meet WCAG AA contrast, visible focus rings and 44px tap targets.

Shell:
- Left sidebar: Home, Questionnaire, My profile, Results, Family, Plan, Explore, How we know.
- Top bar: role switcher (mock mode) or user menu (live mode), language select (English / தமிழ் / हिन्दी), and a "Mock data" or "Live" chip from meta.mock.
- The language select changes the narrative and the report (`?lang=`); the UI chrome stays English for now.

## Screens, by priority. Build P0 completely before touching P1.

### P0: the demo path (must be stunning)
1. **Landing + persona picker.**
   - Headline "See every path. Choose yours together." Sub: "Career guidance that weighs your interests, your family's budget and real job demand — and shows its working."
   - Below it, the 5 demo families from GET /demo/personas as cards: name, location, scenario, highlights.
   - "Enter as student" / "Enter as parent" buttons (live mode: logs in with the demo accounts; mock mode: sets the role).
   - A small "Counsellor" and "Admin" link.
2. **Results dashboard** (hero screen; data from the latest run).
   - Top: 6 composite tiles from `composite_scores`.
   - A plain-language summary card from GET /analysis/runs/{id}/narrative?lang=… (headline + bullets, with a small "Rephrased by AI" tag when source=model).
   - Tabs for the six `buckets`. A ranked list of `recommendations`; each card shows rank, career, sector, ScoreBar, final score, FundingPill, total_cost, ConfidenceChip, TrustBadge, and bucket tags. Stretch-goal items show their `reason` text.
   - Right rail: conflict mini-card (index, band, "3 things to talk about") and robustness card (sensitivity.top1_stability, scenarios, most_sensitive_weight).
   - Buttons: What-if, Family conversation, Plan, Download report.
3. **Career detail** (drawer or page, from the same run payload).
   - "Why this score": a waterfall of the six contributions plus the `explanation` sentences.
   - "Can we afford it": the `financial` ledger (cost, family funds, scholarship_plan, loan, EMI, gap, roi.payback_years, starting_salary, loan_scheme), plus alternative_pathways and admission_chance when it is below 0.6.
   - "How you match": fit.gaps as student-vs-required bars.
   - "Where these numbers come from": data_trust.inputs with badges.
   - "Similar paths": GET /careers/{id}/alternatives.
4. **Family conversation.** GET /analysis/runs/{id}/conflict.
   - Parent view: a semicircle gauge 0–100 with zones aligned < 20, mild < 40, moderate < 60, high; dimension bars; top_drivers as conversation cards (conversation_prompt); bridge_careers with two mini bars (student_fit, parent_acceptance).
   - Student view (visibility=summary): the warm summary text, prompts and bridge careers, with no gauge numbers.
5. **What-if.** POST /analysis/runs/{id}/what-if {overrides, label}.
   - Controls: allocatable_savings, loan_tolerance, relocation_willingness, abroad_willingness, and the six weights in prism colours.
   - Results show comparison.deltas with rank arrows, funding-class before→after pills, rank_correlation and the summary lines.
6. **How we know** (trust page; judges love this).
   - GET /system/data-status: the statement in large type, a datasets table with freshness, checked share and next refresh, and the feeds.
   - GET /system/methodology: the formulas in plain language plus mono, the weights and limitations.
   - GET /system/fairness: each probe as a pass/fail row with its detail, with "protected attributes used: none" prominent.

### P1: the full product story
7. **Questionnaire.** Hub of the 5 instruments with progress; a distraction-free one-question-per-screen player; a countdown pill for timed sections; save-and-exit; local autosave; a section-complete card that shows quality flags gently.
8. **My profile.** GET /students/{id}/traits: Holland code hero, RIASEC radar, aptitude bars, thinking style, values, disposition, with reliability dots. Show "Percentiles appear after 200 students" when percentile is null.
9. **Parent inputs.** PUT /families/{id}/finance and /families/{id}/preferences, with grouped cards, sliders and a privacy banner ("Only parents see these figures"). Validation must show the API's error.message inline. Include a "What your child sees" preview card.
10. **Plan.**
    - GET /analysis/runs/{id}/roadmap: a 5-year horizontal timeline, with milestones as typed icons and DateStatusTags.
    - GET /students/{id}/deadlines: a countdown list, with "Add to calendar (.ics)" and a "Remind me on WhatsApp/SMS" dialog (POST /students/{id}/reminders {channel, phone in +91… format, lead_days}).
    - GET /analysis/runs/{id}/swot: a 2×2 grid.
    - A "Download family report" button with a language choice.
11. **Loan explainer.** GET /loans/explain?amount&course_years&annual_income&institution_tier: sliders, the plain_language lines, an EMI comparison chart across tenors, scheme cards (applies yes/no/unknown, with provenance) and cautions. Prefill from a career's financial.loan_required when opened from career detail.
12. **Counsellor dashboard** (educator role). GET /educator/dashboard: a student table sorted by urgency with flag chips (urgent red, warn amber, info grey), flag_counts summary tiles, and a click-through to that student's results.

### P2: only if time remains
13. **Explore:** GET /careers (filters), /market/trends?region_code (always label it a snapshot with its date, never "real-time"), /local-opportunities?pincode with starter-project callouts.
14. **Outcomes form** (POST /students/{id}/outcomes) and **mentors** directory (GET /mentors?pincode, with an honest empty state).
15. **Admin:** /admin/analytics (k-anonymised charts) and /admin/outcomes/summary.
16. **Presenter mode:** steps from GET /demo/walkthrough in a slim rail, with the "say" line, a timer, and Next / Previous that navigate the app.

## Build order and time boxes (adjust if behind; P0 matters most)
1. 0:00–0:45 — scaffold, tokens, fonts, shell, API layer (envelope, auth modes, fixture mode), generated types, formatINR, ScoreBar, pills and badges.
2. 0:45–1:15 — landing and persona picker.
3. 1:15–2:45 — results dashboard and career detail.
4. 2:45–3:30 — family conversation and what-if.
5. 3:30–4:00 — how we know.
6. 4:00–4:30 — **checkpoint.** Run the whole demo path in mock, live and fixtures modes; fix bugs; deploy.
7. 4:30+ — P1 in order 10, 7, 9, 11, 12, 8. Then P2.

Commit after each step with a clear message. If something blocks you for more than 20 minutes, stub it with an honest empty state and move on.

## Deploy
- Frontend: `npm run build`, then deploy `frontend/dist` to Vercel or Netlify. Use VITE_DATA_MODE=fixtures if no backend is hosted.
- If the backend is hosted, set its CORS_ORIGINS to include the frontend URL.
- Add frontend/README.md with run, env and deploy steps, plus the demo accounts.

## Definition of done
- The demo path (landing → results → career detail → family conversation → what-if → how we know) works in mock, live and fixtures modes, at 1440px and 360px, in light and dark.
- No console errors. Every async view has loading, empty and error states. No invented numbers.
- The student view never shows family rupee amounts.
- `npm run build` and `npm run lint` pass. Write a few Vitest tests for formatINR, the envelope unwrap and ScoreBar segment widths.
- At the end, give me a short summary: what works, what is stubbed, and the deployed URL.
````

## Tips while it runs

- Open a second terminal with the backend running in mock mode so the frontend has data immediately.
- If time runs short, say "stop at P0, deploy, then continue with P1 item 10" so a working build exists first.
- For the demo, keep a fixtures-mode deployment ready as a backup in case the network fails.
