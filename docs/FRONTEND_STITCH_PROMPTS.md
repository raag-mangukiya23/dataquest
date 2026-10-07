# PRISM frontend: Google Stitch prompts

How to use these in Stitch:

1. Create a **Web** project and paste **Prompt 0** first. It fixes the brand, colours, type and components.
2. Add the screens one prompt at a time, in order. Stitch keeps the style consistent better that way than
   with one giant prompt.
3. Generate the questionnaire screens (Prompt 3) in a separate **Mobile** project too, because students
   will mostly answer on phones. Paste Prompt 0 there first.
4. After each screen, fix things with short follow-ups ("make the score bar thicker", "use the amber pill
   for loan-dependent") instead of regenerating everything.
5. Export to Figma or code. Labels in the prompts match the backend's JSON fields (shown in `code`), so
   developers can wire them up directly against `backend/contracts/fixtures/*.json`.

All sample data below is the real demo data our API returns.

---

## Prompt 0: app and design system (paste first)

```
Design a web app called PRISM, a career guidance platform for Indian school students (Grade 9-12) and their parents. It turns a student's interests, aptitude and values, plus the family's budget and hopes, into explained career recommendations, a 5-year roadmap and local innovation projects. Tone: trustworthy, warm, intelligent, never childish or salesy. Think of a calm scientific instrument, not a flashy ed-tech ad.

Visual concept: a prism splitting white light into six colours. The six colours are used ONLY to represent the six parts of a career score, so colour always carries meaning:
- Fit #6B5BE2 (violet), Market #2F80ED (blue), Affordability #12A594 (teal), ROI #5FA83A (green), Family alignment #E0A21B (amber), Disruption risk #E5534B (coral).

Base palette: background #F5F7FB (cool porcelain), surfaces #FFFFFF, ink text #141826, secondary text #5B6273, hairlines #DDE1EA, primary action colour deep indigo #3F4FD6. Also design a dark mode: background #0F1218, surface #171B24, text #E8EBF2.
Status colours: Comfortable = green #1D8A5C, Stretch = amber #B7791F, Loan-dependent = orange #D2691E, Infeasible = red #C23B33. Data labels: "Checked" badge (green outline, small tick) and "Estimate" badge (grey dashed outline).

Typography: headings in Bricolage Grotesque (semi-bold), body in Source Sans 3, all numbers and money in JetBrains Mono with tabular figures. Money is Indian format: ₹6.1 L, ₹1.5 Cr, ₹12,000.

Components to reuse everywhere:
- Stacked score bar: one horizontal bar split into the six prism colours by contribution, with a small hatched coral segment for disruption risk, and a tooltip showing each part.
- Status pill for funding class (Comfortable / Stretch / Loan-dependent / Infeasible).
- Confidence chip showing a range, e.g. "0.77 · range 0.65-0.89".
- Data-trust badge, e.g. "0 of 5 inputs checked", grey when low, green when high.
- Cards with 12px radius and a 1px hairline border, no heavy shadows. Generous white space, 8px grid, left-aligned layouts, not everything centred.

Layout: left sidebar navigation (Home, My Profile, Assessment, Results, Family, Roadmap, Explore, How we know) with the student's name and role at the bottom, a top bar with a role switch (Student / Parent view) and a language selector (English, தமிழ், हिन्दी). Accessible: WCAG AA contrast, visible focus states, large tap targets.

Start with the landing page: headline "See every path. Choose yours together." Subhead: "Career guidance that weighs your interests, your family's budget and real job demand, and shows its working." Two clear entry buttons: "I'm a student" and "I'm a parent". Below, three short explainers with small prism-colour icons: "Know yourself" (a 25-minute questionnaire), "Plan with your family" (budget, loans, scholarships, honest conversations), "See your future" (5-year roadmap and local projects). Footer line: "Every number shows its source and whether it has been checked."
```

---

## Prompt 1: sign in, register and student onboarding

```
Add three screens in the same PRISM style.

1) Sign in / Register: a split layout. Left: a calm illustration of light passing through a prism onto a path. Right: a form with tabs "Sign in" and "Create account". Create account fields: Full name, Email, Password, "I am a" (Student / Parent / Teacher), Date of birth (students only), Preferred language. For students under 18 show a gentle note: "A parent or guardian will be asked to approve before we process your answers."

2) Student profile setup (stepper with 3 steps: About you, Where you are, What you enjoy):
- About you: Grade (8-12, or gap year), Board (CBSE, ICSE, State board, IB), Stream (PCM, PCB, PCMB, Commerce, Humanities), latest exam percentage.
- Where you are: 6-digit Pincode with auto-filled City and State (example 641004 → Coimbatore, Tamil Nadu), languages spoken (chips), "Willing to move for study?" and "Open to studying abroad?" as 5-step sliders from "Not at all" to "Definitely", preferred cities as chips (Coimbatore, Chennai, Bengaluru, Hyderabad, Pune...).
- What you enjoy: interest chips (robotics, sketching, biology, coding, music, business...) and extracurricular chips.
Show a profile completeness ring (95%).

3) Family link: card showing "Raman family" with members (Ananya R., student, "self"; R. Raman, parent, "father"), a large invite code "PRSM7K2Q" with a copy button and "expires in 7 days, 3 uses", and a "Join with a code" input. A consent card: "Parental consent for data processing: Granted by R. Raman on 7 Oct 2026" with a "Manage consent" link.
```

---

## Prompt 2: assessment hub

```
Add the Assessment hub screen. Title "Your questionnaire", subtitle "About 25 minutes. You can stop and continue later. There are no right or wrong answers except in the Reasoning Sprint."

Show five instrument cards in a responsive grid, each with name, what it measures, item count, time, and a status (Not started / In progress with progress bar / Done with a tick):
1. Interest Explorer: what kinds of activities you enjoy. 24 items, 4 min. Done.
2. Reasoning Sprint: numbers, words, logic and shapes. 16 questions, timed 20 min. Done.
3. Thinking Style: how you approach problems. 12 items, 2 min. Done.
4. What Matters To You: your work values. 12 items, 2 min. In progress 10/12.
5. Grit & Risk: perseverance and comfort with uncertainty. 10 items, 2 min. Not started.

A top summary: overall progress 64/74 answered, and a reassuring note: "Answer honestly. Agreeing with everything or rushing makes your results less reliable, and we'll tell you if that happens." A primary button "Continue: What Matters To You".
```

---

## Prompt 3: question screens (also generate in a mobile project)

```
Design the question-taking screens, mobile-first, distraction-free, no sidebar. Top: section name ("What Matters To You"), a thin progress bar "Question 11 of 12", and a "Save and exit" link.

Variant A, agree scale: the statement in large type, e.g. "I would choose a secure job over an exciting but uncertain one." Five large full-width answer buttons stacked vertically: Strongly disagree, Disagree, Neutral, Agree, Strongly agree. The selected one fills with deep indigo. Back and Next buttons at the bottom.

Variant B, interest scale: "How much would you enjoy this?" then the activity, e.g. "Building a working model, like a solar car, for a science fair". Five options: Not at all, A little, Somewhat, Quite a lot, Very much.

Variant C, Reasoning Sprint (timed): a countdown pill top-right "14:32 left", the question "A shopkeeper buys a phone cover for Rs 200 and marks it up by 50%. In a sale he gives 20% off the marked price. What is his profit?" and four option cards labelled A-D (Rs 30, Rs 40, Rs 60, Rs 100), plus "Skip for now".

Variant D, section complete: a friendly summary card "What Matters To You: done. 12 of 12 answered." If a quality flag exists, show a soft amber note: "Many answers were identical. Want to review this section? It makes your results more accurate." with buttons "Review answers" and "Continue".

Do not show which trait a question measures.
```

---

## Prompt 4: my profile (trait results)

```
Add the "My Profile" results screen for the student Ananya R. (Grade 12, CBSE, PCM, Coimbatore).

Hero: her Holland code "IAR" in big letters with three labels: Investigative, Artistic, Realistic, and a one-line reading: "You love figuring out how things work, you think creatively, and you like building real things."

Sections:
1) Interests: a hexagon (radar) chart of the six RIASEC scores 0-100: Realistic 62, Investigative 88, Artistic 75, Social 44, Enterprising 38, Conventional 50.
2) Reasoning: four horizontal bars: Numerical 78, Verbal 67, Logical 78, Spatial 78.
3) Thinking style: Analytical 81, Creative 69, Practical 56.
4) Values: Security 50, Autonomy 67, Impact 67, Financial reward 50 with a grey "Not enough answers. Shown as neutral" tag.
5) Disposition: Grit 75, Risk tolerance 55.

Each bar has a small reliability dot (solid = high, hollow = lower) with a tooltip. A note card: "Percentiles will appear once 200 students in your grade have taken this questionnaire. We don't compare you with made-up averages." Profile completeness 95% (18 of 19 traits measured). Button: "See my career matches".
```

---

## Prompt 5: parent inputs (finance and hopes)

```
Add the Parent screens, shown when the role switch is on "Parent view" (R. Raman).

1) Family budget form with a privacy banner at the top: "Only parents see these figures. Your child sees a simple summary, never the numbers." Fields grouped in cards:
- Income: income band (Below 3L / 3-6L / 6-10L / 10-20L / 20-50L / Above 50L, selected 6-10L), exact annual income optional (₹9,00,000), expected yearly growth (6%).
- Savings and debts: savings available for education (₹6,00,000), existing EMIs per month (₹5,000), number of dependents (2).
- Loans: largest monthly education-loan EMI you can manage (₹12,000), and a slider "How comfortable are you with an education loan?" from "Avoid loans" to "Comfortable" (40%).
- Attitudes: sliders for "Appetite for risk" (30%), "Willing for your child to relocate" (40%), "Open to study abroad" (10%); "When should your child start earning?" (4 years); and a 3-way toggle "Stability / Balanced / Prestige" (Stability selected).
Live validation example: if the EMI plus existing EMIs exceeds monthly income, show an inline red message: "EMIs can't be more than your monthly income (₹75,000)."

2) Career hopes: a drag-to-rank list of up to 10 preferences with notes: 1. Doctor (MBBS), "Respected and stable"; 2. Biomedical Engineer; 3. Any engineering field. An "Add career or field" search.

3) A small "What your child sees" preview card: "Budget: moderate · Open to loans: yes · Relocation: prefers nearby".
```

---

## Prompt 6: results dashboard (the hero screen)

```
Add the Results dashboard, the most important screen. Make it stunning but calm and readable.

Top strip: six composite score tiles, small and elegant: Overall readiness 69, Aptitude 75, Interest clarity 63, Financial capacity 76, Family alignment 55, Market outlook 72.

Tabs for six buckets: Best overall · Best for you · Best for family · Bridge careers · Hidden gems · Stretch goals.

Ranked recommendation list (Best overall shown). Each row is a card: rank number, career name, sector chip, the prism stacked score bar, the final score in mono, a funding status pill, the full course cost, a confidence chip with range, and a data-trust badge. Data:
1. Data Scientist · Computing & AI · score 0.771 · Comfortable · ₹6.1 L total · range 0.65-0.89 · "0 of 5 inputs checked"
2. Biomedical Engineer · Health & Life Sciences · 0.751 · Loan-dependent · ₹11.9 L · tags "Bridge career", "Best for family"
3. Computational Biologist · Health & Life Sciences · 0.728 · Comfortable · ₹8.0 L · "1 of 5 checked" · tag "Hidden gem"
4. Agri-Drone & Precision Farming Engineer · Agriculture & Environment · 0.695 · Comfortable · ₹5.6 L · tag "Hidden gem: local problem in Pollachi"
5. Robotics & Automation Engineer · Engineering · 0.685 · Loan-dependent · ₹17.8 L
6. UX / Product Designer · Design & Arts · 0.577 · Infeasible · ₹31.6 L · tag "Stretch goal"
7. Doctor (MBBS) · Health · 0.555 · Infeasible · ₹1.5 Cr (private) · tag "Stretch goal: government seat via NEET"

Legend for the six colours under the list. Right column: a "Family conversation" mini card (conflict 46/100, Moderate, "3 things to talk about") and a "Ranking robustness" card ("Top pick holds in 89% of 64 what-if weightings · robustness 0.82"). Buttons: "Try a what-if", "Compare runs". Footer note: "Scores are computed live from your answers and today's data. Grey badges mark figures we haven't verified yet."
```

---

## Prompt 7: career detail (explainability)

```
Add the Career detail screen for "Data Scientist" opened from the dashboard.

Header: name, sector, final score 0.771, rank #1, confidence range 0.65-0.89, funding pill Comfortable.

Section "Why this score": a horizontal waterfall chart building the score from its six parts: Fit +0.258, Market +0.126, Affordability +0.200, ROI +0.117, Family alignment +0.083, Disruption -0.013 = 0.771, each in its prism colour. Under it, plain-language reasons: "Strong match on investigative interest, analytical thinking and logical reasoning." "B.Tech CSE (Data Science) at Government College of Technology, Coimbatore is comfortable for your family." "Demand outlook 84% with automation risk 25%."

Section "Can we afford it?" (financial solver), as a clean ledger: Total course cost ₹6,08,325 (4 years, 8% yearly fee inflation) · Family funds ₹9,40,000 · Expected scholarships ₹30,000 · Loan needed ₹0 · Monthly EMI ₹0 · Funding gap ₹0 · Starting salary ₹8 L/yr · Pays back in 2.2 years. A small donut showing the funding mix. Alternative pathways listed below.

Section "How you match": a list of trait gaps with small bullet bars (student vs required): Values financial reward 0.50 vs 0.70; Conventional 0.50 vs 0.65; Enterprising 0.38 vs 0.50, each with a tip to close the gap.

Section "Where this number comes from": a table of inputs with status badges: Market demand (Estimate), Salary band (Estimate), Fees: B.Tech CSE (Estimate), Scholarship: merit-cum-means (Estimate), Exam dates: TNEA (Estimate). Header text: "0 of 5 inputs checked against published sources."

Section "Similar paths": cards for Computational Biologist (62% skill overlap), Agri-Drone Engineer (38%), UX Designer (22%).
```

---

## Prompt 8: family conversation (conflict index)

```
Add the Family conversation screen in two variants.

Parent view: a semicircular gauge from 0 to 100 with four zones (Aligned 0-20, Mild 20-40, Moderate 40-60, High 60-100) and the needle at 46: "Moderate". Below, six horizontal bars showing points contributed: Field choice 21.0, Stability vs autonomy 8.3, Geography 4.5, Risk appetite 4.1, Time to first salary 4.0, Budget 3.8. Each row shows "Ananya: ..." vs "Parents: ..." positions, e.g. Field choice: "Data science, computational biology, design" vs "Medicine, biomedical engineering".
Then "Three things to talk about" as conversation cards with a speech-bubble icon:
1. "Which part of medicine excites you most, and could a health-technology career deliver the same impact?"
2. "What would 'secure enough' look like in numbers, and which careers meet that bar while staying creative?"
3. "Which cities feel safe and affordable to everyone, and what support would make a move comfortable?"
Then "Bridge careers both of you can love": Biomedical Engineer (0.81), Computational Biologist (0.77), Doctor (MBBS) (0.72), each with two small bars (Ananya's fit, parents' acceptance).

Student view: no gauge numbers or gap bars. A warm card: "You and your family agree on a lot, especially your interest in health and science. A few conversations, mainly about field choice and stability, will help you plan together." Show the same three conversation prompts and bridge careers.
```

---

## Prompt 9: what-if simulator

```
Add the What-if simulator. Left panel of controls: "Extra savings" slider (₹0 to ₹20 L, set to +₹8 L), "Loan comfort" slider (40% → 70%), "Willing to relocate" slider, "Open to abroad" toggle, preferred cities chips, and an "Adjust priorities" accordion with six weight sliders in the prism colours (Fit 30%, Market 15%, Affordability 20%, ROI 15%, Family 15%, Risk 5%). A scenario name field ("Add savings + accept loan") and a "Run scenario" button.

Right panel, results compared with the baseline: a ranked list with arrows showing movement and score deltas, and funding-class changes highlighted as before → after pills: "Robotics & Automation Engineer: Loan-dependent → Stretch (+0.042)", "Biomedical Engineer: Loan-dependent → Comfortable". A ranking similarity meter "Rank correlation 0.90 · mostly stable". Buttons "Save scenario" and "Compare with another".
```

---

## Prompt 10: 5-year roadmap and SWOT

```
Add two screens.

1) Roadmap for "Data Scientist": a horizontal 5-year timeline (Oct 2026 → Aug 2031) with five phases: Year 1 "Class 12, entrance exams, admission", Year 2 "Foundations", Year 3 "Specialise", Year 4 "Build proof of work", Year 5 "Placement and first role". Milestones are icon dots by type (exam, scholarship, skill, project, career, finance). Year 1 milestones: Register for JEE Main (22 Nov 2026, Estimate badge), Sit JEE Main Session 1 (22 Jan 2027, "Tentative, NTA calendar"), Class 12 board exams (15 Feb 2027), Register for TNEA counselling (6 Jun 2027). Year 2: "Start the local coconut-pest image project" (a hyper-local STEAM project). Side panels: "Ranked pathways" (B.Tech CSE Data Science, GCT Coimbatore, Comfortable, ₹6.1 L), "Scholarship deadlines" with countdowns, "Skills to build" (8-week practice plans), and "Plan B" career chips. Every date shows either a "Tentative" or "Estimate" label. Add an "Add to calendar" button.

2) SWOT: a 2x2 grid with soft tinted quadrants. Strengths: Investigative interest (88), Analytical thinking (81), Numerical, logical and spatial reasoning (78). Weaknesses: financial-reward values unclear, Conventional and Enterprising below requirement. Opportunities: "Rising demand for data roles in the Coimbatore-Bengaluru corridor", "Local agri-drone problems need solvers". Threats: "Automation of entry-level analytics", "Budget pressure on private courses". A one-line headline on top.
```

---

## Prompt 11: explore (careers, market, local opportunities)

```
Add the Explore section with three tabs.

1) Careers: a searchable, filterable grid (filters: sector, STEAM tag S/T/E/A/M, automation risk). Cards show career name, short description, entry education, automation-risk meter and demand dot.

2) Market by region: a region selector (Coimbatore, Chennai, Bengaluru, Hyderabad, Germany...) and a dashboard: sector demand bars, "Rising fastest" and "Most exposed to automation" lists, and a prominent freshness label: "Snapshot dated 30 Sep 2026 · next refresh due 30 Oct · live postings feed off". Never call this data "real-time".

3) Local opportunities near you: enter a pincode (642001) and show problem cards from the student's district, e.g. "Early detection of coconut pest attack with low-cost drones" (Pollachi, partner: district agriculture department and FPOs), "Energy-efficient pump sets for MSME foundries" (Coimbatore), "Low-cost textile effluent monitoring" (Tiruppur). Each card shows the problem statement, STEAM tags, linked careers, skills, and a "Starter project (4-8 weeks)" callout, e.g. "Collect 300 labelled leaf photos from 3 farms and train a phone-based classifier."
```

---

## Prompt 12: "How we know" (trust page) and admin

```
Add two screens.

1) "How we know": a transparency page judges and parents will love. Top statement in large type: "Recommendations are recomputed on every request. Market data is the snapshot dated 30 Sep 2026; no live feed is switched on. 3 of 80 figures (4%) are checked against published sources; the rest are labelled as estimates." A table of datasets with columns: dataset, rows, freshness pill (Fresh / Aging / Stale), checked share as a small progress bar, sources, next refresh due. Rows: Market demand (35 rows, 0% checked), Salary bands (21, 0%), Courses and fees (8, 0%), Exams (8, 13%), Scholarships (5, 40%), Local problems (3, 0%). A "Live feeds" card (Adzuna job postings: off; data.gov.in: no adapter yet). Then "How scores are calculated": formula cards for the final score, affordability, the conflict index and confidence, written in plain language with the formula in mono underneath. Then "Fairness": "We never use gender, caste, religion or community", and "Privacy": who sees what.

2) Admin analytics (role: admin): k-anonymised aggregate cards: students 128, families linked 97, runs 342, median run time 138 ms; bar charts for top recommended careers, funding-class distribution, conflict-band distribution and region distribution; a note "Groups smaller than 5 are hidden (6 suppressed)". A "Data refresh" panel with source selector (Seed / CSV / Live feed), a dry-run toggle and a results log.
```

---

## Prompt 13 (optional): demo presenter mode

```
Add a full-screen "Presenter mode" for live demos: a slim left rail listing 11 steps (Credibility first, The student's profile, The parent's side privately, One run fully explained, Where the family disagrees, Same report student view, What if?, A 5-year plan, Hyper-local innovation, Trust the ranking, How current how checked). The main area shows the current app screen. A bottom bar shows the step title, the line to say ("Each career's score splits into six weighted parts, with the pathway costed against the family's budget"), a timer (6:35 total) and Previous / Next buttons. A persona switcher in the top bar lists 5 demo families: Ananya (Coimbatore), Karthik (Madurai), Meena (Dharmapuri), Rahul (Pune), Sara (Bengaluru).
```

---

## Follow-up tweaks that usually help in Stitch

- "Keep the six prism colours only for score parts; use deep indigo for buttons and links."
- "Use Indian rupee formatting with lakh and crore everywhere."
- "Increase white space between cards and reduce shadows to a 1px hairline border."
- "Make all numbers JetBrains Mono with tabular figures so columns line up."
- "Create the dark mode version of this screen using the dark palette from the design system."
- "Show the empty state: before the questionnaire is finished, the results page explains what will appear and links to the assessment."

## Wiring notes for the frontend team

| Screen | Endpoint | Fixture |
|---|---|---|
| Sign in / register | `POST /api/v1/auth/login`, `/register` | `auth_login.json` |
| Profile setup | `GET/PUT /api/v1/students/me/profile` | `student_profile.json` |
| Family link | `GET /api/v1/families/me`, `POST /families/invites`, `/families/join` | `family_me.json`, `family_invite.json` |
| Assessment hub | `GET /api/v1/assessments/instruments` | `assessment_instruments.json` |
| Questions | `GET /assessments/{code}/questions`, `POST /assessments/{code}/submit` | `assessment_questions_riasec.json`, `assessment_submit.json` |
| My profile | `GET /api/v1/students/{id}/traits` | `student_traits.json` |
| Parent inputs | `GET/PUT /families/{id}/finance`, `/preferences` | `family_finance_parent_view.json`, `parent_preferences.json` |
| Results dashboard | `POST /api/v1/analysis/runs` | `analysis_run_parent_view.json` |
| Career detail | same run payload, `GET /careers/{id}/alternatives` | `career_alternatives.json` |
| Family conversation | `GET /analysis/runs/{id}/conflict` (role decides full or summary) | `conflict_parent_view.json`, `conflict_student_view.json` |
| What-if | `POST /analysis/runs/{id}/what-if` | `analysis_what_if.json` |
| Roadmap, SWOT | `GET /analysis/runs/{id}/roadmap`, `/swot` | `roadmap.json`, `swot.json` |
| Explore | `/careers`, `/market/trends`, `/local-opportunities` | `careers_list.json`, `market_trends.json`, `local_opportunities.json` |
| How we know | `/system/data-status`, `/system/methodology` | `system_data_status.json`, `system_methodology.json` |
| Admin | `/admin/analytics`, `/admin/data/refresh` | `admin_analytics.json` |
| Presenter mode | `/demo/walkthrough`, `/demo/personas` | `demo_walkthrough.json`, `demo_personas.json` |

In mock mode, send the header `X-Mock-Role: parent` (or `student`, `admin`) to see each role's view.
