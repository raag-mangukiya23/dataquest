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
- Mock mode (default, no DB): `DEMO_MODE=true uvicorn app.main:app --reload --port 8000`.
- Live mode: `python scripts/seed.py --demo --reset && MOCK_MODE=false DEMO_MODE=true uvicorn app.main:app --port 8000`.
- DEMO_MODE turns on the developer-only /api/v1/demo/* endpoints; it is off by default and refused in production.

CORS already allows http://localhost:5173. Put the API base URL in VITE_API_URL (default http://localhost:8000).

## API rules (follow exactly)
1. Envelope. Every JSON response is `{success, data, error, meta}`. Unwrap `data` in one fetch helper. On `success:false`, throw `error.code` and `error.message` and show `error.message` to the user; it is already friendly. `meta.mock` tells you whether the data is mock; use it only inside the developer tools.
2. Auth has two modes behind one switch, VITE_AUTH_MODE = live | mock (default live).
   - **mock** (developer only): no login; send the header `X-Mock-Role: student|parent|educator|admin` chosen in the developer tools panel (see "Developer tools" below).
   - **live:** `POST /api/v1/auth/login {email,password}` returns `data.user` and `data.tokens.access_token / refresh_token`. Send `Authorization: Bearer <access>`. On 401, call `POST /api/v1/auth/refresh {refresh_token}` once, then retry. Keep tokens in memory plus sessionStorage.
   - Demo accounts (developer and judging use only, never shown to normal users): `<key>.student@prism.example` and `<key>.parent@prism.example`, where the keys come from GET /api/v1/demo/personas, plus counsellor@prism.example and admin@prism.example. The password for all is Prism@Demo2026. They can always be typed into the normal sign-in form.
3. Fixture mode (developer setting, invisible to users). VITE_DATA_MODE = api | fixtures. In fixtures mode, the same API layer returns the JSON files copied into src/fixtures (write a small script for the copy). This is our safety net if the backend or wifi fails on stage, so every P0 screen must work in fixtures mode. In fixtures mode the normal sign-in form still appears: it accepts any password and picks the student, parent, educator or admin fixtures from the role word in the email (e.g. `...parent@...`).
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
- Top bar: user menu (name, role, sign out) and language select (English / தமிழ் / हिन्दी). Nothing about mock data, demo or developer settings appears here.
- The language select changes the narrative and the report (`?lang=`); the UI chrome stays English for now.

## Screens, by priority. Build P0 completely before touching P1.

### P0: the core path (must be stunning)
1. **Landing + sign in / create account.**
   - Headline "See every path. Choose yours together." Sub: "Career guidance that weighs your interests, your family's budget and real job demand — and shows its working."
   - Below it, three short explainers: "Know yourself" (questionnaire), "Plan with your family" (budget, loans, scholarships, honest conversations), "See your future" (roadmap and local projects). Footer line: "Every number shows its source and whether it has been checked."
   - Primary buttons "Sign in" and "Create account". Register (POST /api/v1/auth/register) asks for full name, email, password, role (student / parent / teacher) and date of birth for students; show the note that a parent must approve for students under 18.
   - After sign-in, route by role: student → results (or questionnaire if no run yet), parent → results, educator → counsellor dashboard, admin → admin.
   - No demo families, persona cards or role switches on this page.
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
16. **Presenter mode** (part of the developer tools below): steps from GET /demo/walkthrough in a slim rail, with the "say" line, a timer, and Next / Previous that navigate the app.

## Developer tools: off by default, never part of the product
Put everything below in `src/devtools/` and render it only when `import.meta.env.VITE_DEV_TOOLS === "true"`. Load it with a dynamic import inside that check, so a normal build (VITE_DEV_TOOLS unset) does not contain any of it.
- A small floating "Dev" button (bottom-right) opening a panel with:
  - the X-Mock-Role switcher (mock auth only);
  - a data-source chip (mock / live / fixtures, from meta.mock and VITE_DATA_MODE);
  - "Sign in as demo family" quick-fill. It calls GET /api/v1/demo/personas and lists the 5 families; picking one fills the normal sign-in form. If that endpoint returns 404 (DEMO_MODE off), hide the list.
  - A link to presenter mode at /presenter.
- No other screen may import from src/devtools.
- For judging, the team may deploy one build with VITE_DEV_TOOLS=true. The public build keeps it off.

## Build order and time boxes (adjust if behind; P0 matters most)
1. 0:00–0:45 — scaffold, tokens, fonts, shell, API layer (envelope, auth modes, fixture mode), generated types, formatINR, ScoreBar, pills and badges.
2. 0:45–1:15 — landing, sign in and register (role-based routing).
3. 1:15–2:45 — results dashboard and career detail.
4. 2:45–3:30 — family conversation and what-if.
5. 3:30–4:00 — how we know.
6. 4:00–4:30 — **checkpoint.** Run the whole core path in live and fixtures modes; fix bugs; deploy. Then add the developer tools panel (about 30 min), because judging is easier with quick sign-in.
7. 4:30+ — P1 in order 10, 7, 9, 11, 12, 8. Then P2.

Commit after each step with a clear message. If something blocks you for more than 20 minutes, stub it with an honest empty state and move on.

## Deploy
- Frontend: `npm run build`, then deploy `frontend/dist` to Vercel or Netlify. Use VITE_DATA_MODE=fixtures if no backend is hosted.
- If the backend is hosted, set its CORS_ORIGINS to include the frontend URL.
- Add frontend/README.md with run, env and deploy steps. Put the demo accounts in a "Developer and judging" section of the README, not in the UI.

## Definition of done
- The core path (landing → sign in → results → career detail → family conversation → what-if → how we know) works in live and fixtures modes, at 1440px and 360px, in light and dark.
- A build without VITE_DEV_TOOLS shows no demo, mock or developer UI: `grep -ri "persona\|X-Mock-Role\|presenter" dist/` finds nothing.
- No console errors. Every async view has loading, empty and error states. No invented numbers.
- The student view never shows family rupee amounts.
- `npm run build` and `npm run lint` pass. Write a few Vitest tests for formatINR, the envelope unwrap and ScoreBar segment widths.
- At the end, give me a short summary: what works, what is stubbed, and the deployed URL.
````

## Tips while it runs

- Open a second terminal with the backend running in mock mode (`DEMO_MODE=true`) so the frontend has data immediately.
- If time runs short, say "stop at P0, deploy, then continue with P1 item 10" so a working build exists first.
- For judging, keep a fixtures-mode deployment ready as a backup in case the network fails. Turn on VITE_DEV_TOOLS only in the build you show judges, if you want quick sign-in.
