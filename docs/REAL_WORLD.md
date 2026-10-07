# PRISM Engine — Real-world follow-through

Ten features that take PRISM from "a ranking on a screen" to something a family and a school can act on.
The backend for all ten is built and tested. The **Still to do** column lists what needs people, accounts
or partners rather than code.

| # | Feature | API / tool | Still to do |
|---|---|---|---|
| 1 | Deadline reminders (SMS, WhatsApp, calendar) | `GET /students/{id}/deadlines`, `GET /students/{id}/deadlines.ics`, `POST /students/{id}/reminders`, `scripts/send_reminders.py` | Twilio account; DLT registration (SMS) and approved WhatsApp templates before real sending |
| 2 | Family report in Tamil and Hindi | `GET /analysis/runs/{id}/report?lang=ta\|hi`, `GET /analysis/runs/{id}/narrative?lang=` | A native speaker checks the template wording (`translation_reviewed` stays `false` until then) |
| 3 | School counsellor dashboard | `GET /educator/dashboard` | A frontend page; schools assign counsellors to students |
| 4 | Outcome follow-up after 6–12 months | `POST/GET /students/{id}/outcomes`, `GET /admin/outcomes/summary`; dashboard flag `follow_up_due` | Actually ask families (the reminder outbox can carry the nudge) |
| 5 | Fairness test | `GET /system/fairness`, `tests/test_engine.py`, `tests/test_followthrough.py` | Show it in the demo |
| 6 | Education-loan explainer | `GET /loans/explain` | — |
| 7 | Free courses (SWAYAM, NPTEL, DIKSHA) | Already in every roadmap (`SkillAction.resource_url`) | — |
| 8 | Local mentors | `GET /mentors`, `POST /mentors` (counsellor/admin) | Recruit mentors with written consent; none are seeded, so nobody is listed without agreeing |
| 9 | Low-bandwidth / offline use | gzip on all JSON over 1 KB; idempotent offline answer upload (`client_submission_id`) | PWA work in the frontend (below) |
| 10 | Atal Tinkering Lab partnerships | `scripts/local_problems.py` + `data/partners/local_problems_template.csv` | Contact ATL schools; collect real problems (process below) |

## 1. Deadline reminders

- The deadlines come from the student's latest results: registrations and exam dates for the entrance exams
  of every suggested course, plus scholarship deadlines in the funding plans. Each item says whether the date
  is announced, tentative or estimated, and where it came from.
- `deadlines.ics` imports into Google Calendar or any phone calendar with a 3-day alarm. This works today,
  needs no accounts and costs nothing: **use it in the demo**.
- `POST /reminders` puts reminders in an outbox (default 14 and 3 days before each date). Calling it again
  only adds new ones. `DELETE /me/reminders` stops them all.
- `python scripts/send_reminders.py` sends what is due; run it daily (cron or a scheduled job on the host).
  `REMINDER_PROVIDER=console` logs messages; `twilio` sends SMS or WhatsApp.
- Before real SMS in India, the sender ID and message template must be registered on a DLT platform
  (TRAI rules). Business-initiated WhatsApp messages need a pre-approved template. Plan a week for both.

## 2. Family report

- One printable page per run (browser *Print → Save as PDF*), in English, Tamil or Hindi: summary, top five
  careers with course, cost and affordability, stretch goals, coming dates, and for parents only, the
  "talk about together" prompts.
- The wording comes from fixed templates. With `GROK_API_KEY` set, a language model may rephrase it (see
  README); it only sees the anonymised `facts` and any invented number makes PRISM fall back to the template.
- Course and career names stay in English (they are how colleges and exams name them).

## 3. Counsellor dashboard

Every assigned student, most urgent first, with flags: `consent_pending`, `no_assessment`, `no_run`,
`high_conflict`, `top_matches_out_of_reach`, `low_data_quality`, `deadline_soon` (14 days), `follow_up_due`
(6 months, nothing recorded), `run_outdated`. Counsellors see first name and initial, top career, conflict band
and affordability classes, **never the family's money**.

## 4. Outcomes

Families or counsellors record what happened: enrolled / waiting / dropped / working, the career and course
chosen, admission, scholarship received, satisfaction 1–5. PRISM stores which rank the chosen career had in
the run. The admin summary (share who followed a top-3 / top-10 suggestion, satisfaction) stays hidden until
5 families have answered. This is the only honest evidence that the recommendations help.

## 5. Fairness

`GET /system/fairness` runs five checks on the live engine and catalogue:
1. No input for gender, caste, religion, community, disability or name.
2. The same student at family income Rs 2.4 lakh vs Rs 25 lakh: every career with fit ≥ 75 % stays visible
   to the low-income family (ranked list or stretch goals).
3. "Best for the student" is identical whatever the family earns.
4. Home region changes costs and local jobs, never fit.
5. Category- or gender-based scholarships are listed for students to check, never added to funding plans.

Check 2 found a real gap on the 51-career catalogue: well-fitting careers that cost pushed out of the
top 10 vanished. They now appear in stretch goals with the reason.

## 6. Loan explainer

EMI for 5, 7, 10 and 15 years; interest that builds up while studying (simple interest, course + 1 year);
CSIS (no interest while studying on up to Rs 7.5 lakh, income ≤ Rs 4.5 lakh) and PM-Vidyalaxmi (3 % off on
up to Rs 10 lakh, income ≤ Rs 8 lakh, top-ranked institutions), each with its source and a "check with the
bank" caution. The 10 % rate is an estimate.

## 8. Mentors

Only people who agreed in writing are listed: `consent_on` and `verified_by` are required. The API shows
first name and initial, career, district, organisation, languages and a short bio. Contact always goes
through the school counsellor. No phone numbers or emails are ever returned.

## 9. Offline and low bandwidth (frontend checklist)

- Make the frontend a PWA: a service worker caches the app shell, the instruments and questions
  (`/assessments/*`) and the latest run.
- Save answers in IndexedDB as the student goes; upload when online with a `client_submission_id`
  (a UUID made on the phone). Retries never create duplicates.
- Send `Accept-Encoding: gzip` (browsers do): a full run shrinks from about 39 KB to 7 KB.
- Offer the `.ics` file and the printable report: both work offline once downloaded.

## 10. Atal Tinkering Lab partnerships

1. Pick 3–5 ATL schools near the demo districts (the ATL directory on the AIM / NITI Aayog site lists them).
2. Ask each lab in-charge for 2–3 real problems in their area: what goes wrong, who it affects, and what a
   student team could build in 4–8 weeks.
3. Fill `data/partners/local_problems_template.csv` (one row per problem; lists separated by `;`) and run
   `python scripts/local_problems.py <file>`. Bad rows are reported and skipped.
4. Imported problems are `unverified` until a counsellor reviews them; the API shows that status.
5. Students who pick a problem get a starter project and linked careers on their roadmap, and the school
   gets a list of interested students through the counsellor dashboard.
