# PRISM frontend — showpiece prompt (Claude Code)

Open Claude Code in the repository root (the folder that contains `backend/` and `docs/`) and type:

> Read docs/FRONTEND_SHOWPIECE_PROMPT.md and follow the prompt inside it.

````
You are the design engineer building the PRISM Engine frontend for DataQuest 3.0 (VIT Chennai). Judging is tomorrow at 10:00. The goal: the most memorable career-guidance product the judges have seen — cinematic motion where it means something, and an interface a nervous 15-year-old and their parent can use without help. Wow first impression, zero confusion afterwards.

## 0. Ground rules (read before writing code)
1. The backend in this repo is finished and must not change. Its contract is binding:
   - Read docs/FRONTEND_CLAUDE_CODE_PROMPT.md completely. Its sections "API rules", "Developer tools", "Screens, by priority" and "Definition of done" all still apply word for word. This file replaces only its "Stack", "Design system" and "Motion" guidance, and adds the features in section 5.
   - Also read docs/API_CONTRACT.md, backend/contracts/openapi.json and backend/contracts/fixtures/*.json. Generate types with openapi-typescript; never hand-write response types; never invent a number.
2. Build in a new `frontend/` folder. Never edit anything under `backend/`.
3. Function before flourish. For every screen: build it plain and working → screenshot it → commit → add motion → screenshot again at 1440px and 390px, in light and dark → compare. If the motion version is harder to read or use, simplify it before committing. Use Playwright with Chromium for the screenshots and look at them yourself before moving on.
4. Commit after every working step with a clear message, so any step can be rolled back. Never leave the build broken.
5. Never replace a whole stylesheet or theme in one go. Change tokens and components incrementally, and re-screenshot affected screens after each change.

## 1. Stack
- Vite + React 18 + TypeScript, Tailwind CSS (tokens as CSS variables), React Router, TanStack Query.
- Motion: `motion` (Framer Motion) for UI, layout and shared-element transitions; GSAP + ScrollTrigger only for the landing-page scroll story; Lenis smooth scrolling only on the landing page.
- 3D: @react-three/fiber + @react-three/drei, lazy-loaded, used only for the landing hero prism.
- Charts: hand-built SVG + motion for the signature visuals (ScoreBar, gauge, roadmap); Recharts for ordinary charts.
- Small extras: cmdk (command palette), canvas-confetti (one celebration only), html-to-image (share card), vite-plugin-pwa (offline), lucide-react icons, Radix primitives for dialog, tabs, slider, tooltip.
- Fonts (Google Fonts): Bricolage Grotesque for display, Inter for UI text, JetBrains Mono with tabular figures for every number.

## 2. Visual identity: "light through a prism"
A beam of white light (the student) enters a prism (PRISM's analysis) and splits into a spectrum (their possible futures). Every signature animation is a variation on this, so the motion tells the product's story instead of decorating it.
- Six spectrum colours, used ONLY for the six score parts, so colour always means something: fit #7C6CFF, market #3B8BFF, affordability #14B8A6, roi #65C23A, family_alignment #F2B01E, disruption #F0544F (hatched, because it subtracts).
- Dark-first "observatory" theme: background #07080D with a faint film-grain and a soft radial glow behind the active content; surfaces #10121A; hairlines rgba(255,255,255,.08); text #ECEEF5; muted #8A90A6; primary action #8B7CFF. Light theme: background #F6F7FB, surfaces #FFFFFF, ink #12141C, primary #4B3FE0. Both themes at WCAG AA.
- Funding classes: comfortable #22C55E, stretch #F59E0B, loan_dependent #FB923C, infeasible #EF4444, always with a text label, never colour alone.
- Glass only where light passes through: the hero prism and the top navigation (blur 12px). Everything else is a crisp surface with a 1px hairline and a 16px radius.
- Indian money format everywhere: ₹6.6 L and ₹1.2 Cr in summaries, ₹6,56,991 in ledgers (one formatINR helper).

## 3. Signature motion moments (the "crazy" part, each tied to meaning)
0. Loading screen ("the mind becomes a spectrum"), shown while the app loads, like Gmail's:
   - Full-screen, background #05060B. Three stacked elements, centred, with generous spacing:
     a) A human brain in blue–cyan neon (#00E5FF to #2F6BFF, soft glow via SVG feGaussianBlur). Draw it yourself as
        an original inline SVG: two hemispheres, a clear side-profile silhouette with a cerebellum and brainstem, and
        8–12 curved gyri lines inside. The outline draws itself first (stroke-dashoffset, about 700 ms).
     b) Neural signals: 12–20 small bright pulses (cyan core, white tip, short fading trail) travelling along the
        gyri paths at different speeds (SVG animateMotion or CSS offset-path), with tiny "synapse" flashes where
        paths meet. They loop continuously and gently while loading.
     c) Below the brain, the prism builds up: its three edges draw in (cyan neon), the faces fill with a faint
        glass gradient, then a thin white beam from the brain enters the prism and leaves as the six spectrum
        colours of the score parts.
     d) Below the prism, "PRISM" is written in: each letter's outline draws (stroke), then fills white with a
        cyan glow, letters staggered by 90 ms, with letter-spacing tightening from 0.6em to 0.18em. A tiny caption
        fades in under it: "See every path. Choose yours together."
   - It must appear instantly, before any JavaScript loads: put the SVG and its CSS animations inline in
     frontend/index.html (no fonts, images or scripts needed; draw "PRISM" as SVG paths or use a system-font
     fallback while the display font loads). React removes it once the app is ready.
   - Timing: play at least the full build-up sequence (about 1.6 s) on first visit, then fade out (300 ms, the
     brain's glow brightening into the page) as soon as the app is ready. Never longer than 3.5 s; if the app is
     still loading, keep the signals looping with a calm "Loading…" line. On later visits in the same session,
     show only a 600 ms short version. Any click or key press skips it.
   - Reduced motion: show the finished still image (brain, prism, PRISM) for at most 600 ms, no movement.
   - Keep it light: inline SVG under 25 KB, animate only transform, opacity and stroke-dashoffset, 60 fps on a
     mid-range phone, accessible label "PRISM is loading", aria-busy on the app root.
1. Landing hero, scroll story (GSAP ScrollTrigger + R3F):
   - A thin white beam travels across a dark scene into a slowly rotating glass prism (drei MeshTransmissionMaterial, chromatic aberration).
   - As the user scrolls, the beam splits into six coloured rays, each labelled with a score part (Fit, Market, Affordability, ROI, Family, Disruption).
   - Scrolling further, the rays bend into branching paths that end at glowing career nodes; the headline "See every path. Choose yours together." resolves letter by letter.
   - The final scroll section lands on the CTA. Fallback for low-end devices, reduced motion or no WebGL: a static SVG of the same composition (detect navigator.hardwareConcurrency <= 4, saveData, or a failed WebGL context).
2. Results reveal, "spectrum decomposition": when a run loads, one white bar sweeps across the top card and splits into the six coloured segments, which fly (shared layoutId) into every recommendation's ScoreBar in sequence (60 ms stagger). The final score rolls up like an odometer.
3. What-if as a live instrument: dragging a slider re-ranks the list with FLIP layout animation (motion `layout`), rank arrows slide in, funding pills cross-fade colour, and scores roll. Debounce the API call (350 ms), but animate the controls instantly.
4. Family conversation as gravity: two orbs, "You" and "Parents", sit on a horizontal field; their distance is the conflict index, and they settle with spring physics. Bridge careers appear as glowing stars between them; hovering one draws two light threads to both orbs. The gauge needle uses a spring too.
5. Career galaxy (Explore): all careers as stars on a canvas (d3-force), clustered by sector nebula, star size = demand, a twinkle for rising demand. Pan and zoom; clicking a star flies the camera to it and opens the career card. The user's top matches pulse softly in their spectrum colour.
6. Roadmap as a metro map: the 5-year line draws itself (SVG pathLength) as it scrolls into view; stations (exams, scholarship deadlines, projects) pop in with a small spring; tentative/estimated dates use a dashed station ring.
7. Questionnaire as a calm game: one card at a time, swipeable on mobile (drag gestures, keyboard 1–5 on desktop); a constellation in the corner gains a star per answer; finishing a section lights the constellation and fires ONE short prism-confetti burst. No timers flashing red; the timed section shows a quiet countdown pill.
8. Micro-interactions everywhere, all under 250 ms: magnetic primary buttons (desktop only), a cursor spotlight on cards (desktop only), split-text reveals on section headings, page transitions with a thin spectrum wipe (motion AnimatePresence), skeleton loaders with a refraction shimmer.

## 4. Usability rules that beat every animation
- Content is readable and clickable immediately; no animation delays input or hides information. UI transitions ≤ 400 ms; only the landing hero may run longer.
- One "hero moment" per screen. Everything else moves subtly or not at all.
- No scroll-jacking outside the landing page.
- prefers-reduced-motion and a visible "Reduce motion" toggle in settings turn off all of section 3 (instant states, no 3D, no confetti).
- 60 fps target: lazy-load 3D and the galaxy, pause off-screen animations, transform/opacity only. Lighthouse performance ≥ 85 on mobile for the app screens.
- Mobile first at 360–390px: bottom navigation with 5 items, 44px tap targets, no horizontal scroll; the galaxy becomes a filterable list on small screens.
- Plain language: every metric has an ⓘ explainer (one sentence from /system/methodology wording). Empty, loading and error states are designed, friendly and actionable.
- Keyboard and screen-reader complete: focus rings, labels, live regions for score updates.

## 5. Features to add (all frontend; they use existing endpoints only)
Build these after the P0 screens from docs/FRONTEND_CLAUDE_CODE_PROMPT.md work.
1. Family meeting mode: a full-screen, large-type mode for parent and student on one device. It walks through the conflict report's conversation prompts one at a time, then the bridge careers, with "Agree / Discuss later" buttons stored in localStorage and a summary at the end. Data: GET /analysis/runs/{id}/conflict and the run.
2. Read aloud: a speaker button on the plain-language summary and the report. It uses the browser's speechSynthesis with the narrative text in the selected language (en-IN, ta-IN, hi-IN). Hide the button if no voice for that language exists. It helps parents who prefer listening.
3. Compare careers: pick 2–3 recommendations and see them side by side: the six-part score split, cost ledger, funding class, entrance exams, admission chance, data trust. Data: the run payload.
4. Spectrum share card: a downloadable PNG (html-to-image) of the student's Holland code and top three career names, in prism style, for sharing with friends. Never include money, family data or scores below the top three.
5. Command palette (Ctrl/⌘ + K): jump to any page, any career (GET /careers), "Run a what-if", "Download report", "Add deadlines to calendar".
6. Deadline radar: a top-bar bell showing the next deadlines with day counts (GET /students/{id}/deadlines), plus "Add to calendar" (.ics) and "Remind me on WhatsApp" (POST /students/{id}/reminders).
7. Saved scenarios: the what-if screen lists previous what-if runs (GET /analysis/runs, kind = what_if) as chips; click one to compare it with the baseline (GET /analysis/compare).
8. First-visit guided tour: 4 steps with a spotlight cut-out, skippable, never shown again once dismissed.
9. Offline-ready PWA: cache the app shell, the questionnaire and the latest run; answers queue in IndexedDB and upload with client_submission_id when back online; an install prompt on mobile.
10. Comfort settings: theme (dark/light/system), text size (100/115/130 %), reduce motion, language.

## 6. Build order (time boxes; never start a later step with an earlier one broken)
1. 0:00–0:45 Scaffold, tokens, fonts, API layer from the original prompt (envelope, auth modes, fixture mode), generated types, formatINR, base components. Commit.
2. 0:45–2:30 P0 screens plain and working (landing without 3D, sign in, results, career detail, family, what-if, how we know) in live and fixtures modes. Screenshot each. Commit each.
3. 2:30–3:00 Checkpoint: full core path at 1440px and 390px, light and dark; fix everything; deploy a fixtures-mode build to Vercel or Netlify as a safety copy.
4. 3:00–5:00 Loading screen (motion 0, about 40 minutes, screenshot it mid-animation and finished), then signature motion 2, 3 and 4 (results reveal, what-if instrument, family gravity), then 1 (landing prism). Screenshot before/after each; keep only what improves the screen. Commit each.
5. 5:00–6:30 Features 1, 2, 3, 6 from section 5. Then P1 screens from the original prompt (plan/roadmap with motion 6, questionnaire with motion 7, parent inputs, loan explainer, counsellor dashboard).
6. 6:30+ Galaxy (motion 5), features 4, 5, 7, 8, 9, 10, then P2 screens.
7. Final hour: performance pass, accessibility pass, reduced-motion pass, redeploy, write frontend/README.md.

## 7. Definition of done (in addition to the original prompt's)
- Every screen was screenshotted after its last change and looks intentional at 1440px and 390px, in both themes.
- With reduced motion on, every screen still works and looks complete.
- No console errors; no layout shift when animations run; the landing hero falls back cleanly without WebGL.
- The loading screen appears before the JavaScript bundle loads (check with network throttling set to Slow 4G), never lasts more than 3.5 s, and can be skipped.
- A build without VITE_DEV_TOOLS contains no demo, mock or developer UI.
- Finish with a short report: what works, what is stubbed, the deployed URLs, and the screenshots folder path.
````

## Why Claude Code for this

- It can read the backend contract, the OpenAPI file and the sample responses in this repo, so the frontend is wired to the real API rather than guessed.
- It can run the app, take screenshots and look at them, and commit after every step, which is what prevents another "redesign made it worse" situation: every step can be checked and rolled back.
- v0 (Vercel) is excellent for quick visual drafts of a single screen, but it cannot see this backend. If you want to explore a hero look, draft it there, then paste the result into Claude Code as a reference.
