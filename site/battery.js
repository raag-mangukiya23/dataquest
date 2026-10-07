/* ══════════════════════════════════════════════════════════════
   PRISM ENGINE — Aptitude Battery
   A scored item bank that MEASURES every parameter the engine
   judges, instead of asking the user to self-rate on sliders.

   Two halves:
     · APTITUDE  right/wrong items with weighted options, graded
                 into the five psychometric traits (0-100).
     · INVENTORY preference items (no right answer) that resolve
                 interest, family priority, region and the
                 financial/attitude parameters.

   Dependency-free: shared by the browser layer and the test harness.
   ══════════════════════════════════════════════════════════════ */

const clamp01 = x => Math.max(0, Math.min(1, x));

/* ── Domains: one per engine trait, in presentation order ────── */
const DOMAINS = [
  { key:'logic',    trait:'logic',    label:'Logical & analytical reasoning', hue:'#7c5cff',
    blurb:'Pattern completion, deduction and quantitative reasoning under time pressure.' },
  { key:'creative', trait:'creative', label:'Creative & design thinking',     hue:'#f472b6',
    blurb:'Divergent idea generation scored for novelty AND usefulness, not just novelty.' },
  { key:'comm',     trait:'comm',     label:'Communication & persuasion',     hue:'#22d3ee',
    blurb:'Clarity of expression, argument quality and detection of reasoning fallacies.' },
  { key:'hands',    trait:'hands',    label:'Hands-on & spatial reasoning',   hue:'#34d399',
    blurb:'Mental rotation, mechanical cause-and-effect and tool selection.' },
  { key:'sci',      trait:'sci',      label:'Scientific & quantitative reasoning', hue:'#a78bfa',
    blurb:'Physical intuition, experimental design and reading evidence correctly.' }
];

/* ── Aptitude items ──────────────────────────────────────────────
   option.s is a graded score in [0,1]; item.w is the item weight.  */

const APTITUDE = [
  /* ── logical & analytical ── */
  { id:'lg1', d:'logic', w:1, p:'What number continues the series?  2, 6, 12, 20, 30, ?',
    o:[{t:'36',s:0},{t:'40',s:.15},{t:'42',s:1},{t:'44',s:0}],
    why:'The gaps grow by two each step (4, 6, 8, 10, 12), so 30 + 12 = 42.' },
  { id:'lg2', d:'logic', w:1.2, p:'What comes next?  3, 7, 16, 35, ?',
    o:[{t:'70',s:0},{t:'72',s:.15},{t:'74',s:1},{t:'68',s:0}],
    why:'Each term is doubled and then incremented by a rising counter: x2+1, x2+2, x2+3, so 35 x 2 + 4 = 74.' },
  { id:'lg3', d:'logic', w:1.3, p:'All Blips are Blops. Some Blops are Bleeps. Which of these must be true?',
    o:[{t:'Some Blips are Bleeps',s:0},{t:'All Bleeps are Blips',s:0},
       {t:'Nothing certain follows about Blips and Bleeps',s:1},{t:'No Blips are Bleeps',s:0}],
    why:'The Bleeps that are Blops may sit entirely outside the Blips, so neither inclusion nor exclusion is forced.' },
  { id:'lg4', d:'logic', w:1.4, p:'Five machines take five minutes to make five widgets. How long do 100 machines take to make 100 widgets?',
    o:[{t:'100 minutes',s:0},{t:'20 minutes',s:.1},{t:'5 minutes',s:1},{t:'50 minutes',s:0}],
    why:'One machine makes one widget in five minutes, so 100 machines in parallel make 100 widgets in the same five minutes.' },
  { id:'lg5', d:'logic', w:1, p:'A is taller than B. C is shorter than B. D is taller than A. Who is shortest?',
    o:[{t:'A',s:0},{t:'B',s:0},{t:'C',s:1},{t:'D',s:0}],
    why:'Ordering from tallest: D > A > B > C, so C is shortest.' },

  /* ── creative & design thinking ── */
  { id:'cv1', d:'creative', w:1, p:'You are handed a single brick. Which use shows the most original thinking?',
    o:[{t:'Build it into a wall',s:.15},{t:'Prop a door open with it',s:.35},
       {t:'Grind it to pigment and paint a mural',s:.95},{t:'Sell it online as an art object',s:.55}],
    why:'Originality is scored together with usefulness — turning the brick into pigment is both unexpected and productive.' },
  { id:'cv2', d:'creative', w:1.2, p:'Your campus wants to cut plastic waste. Which proposal is both most creative and workable?',
    o:[{t:'Ban all plastic by notice',s:.25},{t:'Install a deposit-return machine that refunds canteen credit',s:1},
       {t:'Put up awareness posters',s:.2},{t:'Ask students to try harder',s:.05}],
    why:'It turns the incentive the right way round instead of relying on rules or goodwill.' },
  { id:'cv3', d:'creative', w:1, p:'Design a chair for a house that has no floor. Which approach is most original?',
    o:[{t:'Bolt a normal chair to the wall',s:.6},{t:'Hang a suspended seat from the ceiling like a swing',s:1},
       {t:'Sit on the ground',s:.2},{t:'Buy a normal chair anyway',s:.05}],
    why:'It accepts the constraint as a design brief rather than working around it.' },
  { id:'cv4', d:'creative', w:1.3, p:'Which comparison finds a genuinely surprising but meaningful link?',
    o:[{t:'A neural network is like a brain',s:.4},
       {t:"A neural network is like a city's traffic lights: local rules, global flow",s:1},
       {t:'A neural network is like a computer',s:.15},{t:'A neural network is like mathematics',s:.1}],
    why:'The traffic-light analogy is more distant than the obvious brain comparison and still explains emergent behaviour.' },
  { id:'cv5', d:'creative', w:1.2, p:'You have a lever-arch file, a rubber band and a handful of coins. Which is the most inventive working device?',
    o:[{t:'A catapult',s:.6},{t:'A percussion shaker',s:.75},
       {t:'A ramp that sorts coins by size',s:1},{t:'A paperweight',s:.1}],
    why:'It has a real function and uses the material difference between the parts, not just their mass.' }
];

APTITUDE.push(
  /* ── communication & persuasion ── */
  { id:'cm1', d:'comm', w:1, p:'Which sentence states the same finding most clearly?',
    o:[{t:'Due to the fact that testing took three weeks, results were thereby obtained indicating that the compound worked.',s:.1},
       {t:'Three weeks of testing showed the compound worked.',s:1},
       {t:'It was found by the team that results, subsequently, were forthcoming.',s:.15},
       {t:'Results being obtained, the testing having taken place over three weeks time.',s:.05}],
    why:'Shortest sentence carrying the same information and no hedging.' },
  { id:'cm2', d:'comm', w:1.1, p:'Name the flaw: "Everyone in the office uses this tool, so it must be the best."',
    o:[{t:'False cause',s:0},{t:'Appeal to popularity',s:1},{t:'Straw man',s:0},{t:'Circular reasoning',s:.1}],
    why:'Popularity is offered as evidence of quality.' },
  { id:'cm3', d:'comm', w:1.2, p:'You must persuade a risk-averse parent. Which opening is strongest?',
    o:[{t:'You have to let me do this.',s:.05},
       {t:"I know cost is the worry, so here is the fee structure, the scholarship I have already applied for, and the salary data for graduates.",s:1},
       {t:"Trust me, it will work out.",s:.1},{t:"Everyone else's parents said yes.",s:.05}],
    why:'It names the objection first and answers it with evidence — the classic reduce-risk-then-ask structure.' },
  { id:'cm4', d:'comm', w:1, p:'Which subject line gets a support email opened and answered fastest?',
    o:[{t:'URGENT!!! PROBLEM',s:.05},{t:'Question about order #4471 — expected delivery date',s:1},
       {t:'Hey',s:.15},{t:'You people are useless',s:.02}],
    why:'It identifies the specific case and asks one answerable question.' },
  { id:'cm5', d:'comm', w:1.1, p:'Rewrite for concision: "In order to make a determination regarding whether the device functions".',
    o:[{t:'To decide whether the device works',s:1},
       {t:'In order to decide whether the device works',s:.4},
       {t:'So as to make a determination on whether or not the device functions',s:.05},
       {t:'For the purpose of determining whether or not the device functions',s:.1}],
    why:'Fourteen words become seven with no loss of meaning.' },

  /* ── hands-on & spatial ── */
  { id:'hn1', d:'hands', w:1, p:'Gear A meshes with gear B, and gear B meshes with gear C. If A turns clockwise, which way does C turn?',
    o:[{t:'Clockwise',s:1},{t:'Anticlockwise',s:0},{t:'It stalls',s:0},{t:'It alternates',s:0}],
    why:'Each mesh reverses direction; two meshes restore the original direction.' },
  { id:'hn2', d:'hands', w:1.3, p:'A cube is painted on all faces, then cut into 27 equal smaller cubes. How many have exactly two painted faces?',
    o:[{t:'6',s:0},{t:'8',s:0},{t:'12',s:1},{t:'20',s:.1}],
    why:'Two-faced cubes sit on the twelve edges of the original cube, one per edge segment.' },
  { id:'hn3', d:'hands', w:1, p:'A bolt is very tight and you must not round its head. What do you reach for?',
    o:[{t:'Mole grips',s:.2},{t:'A spanner of exactly the right size, pulled steadily',s:1},
       {t:'A hammer',s:.02},{t:'Pliers, twisted hard',s:.15}],
    why:'Correct fit spreads the load across all flats of the head instead of crushing two corners.' },
  { id:'hn4', d:'hands', w:1.2, p:'Fold a square sheet in half, then in half again. Punch one hole through all layers, then unfold. How many holes?',
    o:[{t:'1',s:0},{t:'2',s:.1},{t:'4',s:1},{t:'8',s:0}],
    why:'Two folds quadruple the layers, so one punch passes through four layers and leaves four holes.' },
  { id:'hn5', d:'hands', w:1.2, p:'Two beams weigh the same. One is a solid rectangle; the other is an I-beam. Which resists bending more?',
    o:[{t:'The solid rectangle',s:.1},{t:'The I-beam',s:1},{t:'They are equal',s:.05},{t:'Bending depends only on length',s:.15}],
    why:'Stiffness scales with how far the material sits from the neutral axis, which the I-section maximises for a given mass.' },

  /* ── scientific & quantitative ── */
  { id:'sc1', d:'sci', w:1, p:'In a vacuum, a hammer and a feather are released together from the same height. What happens?',
    o:[{t:'The hammer lands first',s:0},{t:'The feather lands first',s:0},
       {t:'They land together',s:1},{t:'The feather never lands',s:0}],
    why:'With no air resistance both accelerate at the same rate.' },
  { id:'sc2', d:'sci', w:1.1, p:'If a car doubles its speed, its kinetic energy becomes:',
    o:[{t:'Twice as large',s:0},{t:'Four times as large',s:1},{t:'Three times as large',s:0},{t:'Unchanged',s:0}],
    why:'Kinetic energy goes as the square of speed, so doubling speed multiplies energy by four.' },
  { id:'sc3', d:'sci', w:1.1, p:'A sealed bottle filled with water is put in a freezer. The bottle bulges. Why?',
    o:[{t:'Water contracts as it freezes',s:0},{t:'Water expands as it freezes',s:1},
       {t:'Trapped air expands',s:.2},{t:'The plastic shrinks in the cold',s:.05}],
    why:'Water is anomalous: its solid form is less dense than its liquid form, so it expands on freezing.' },
  { id:'sc4', d:'sci', w:1.2, p:'Tensile strength (MPa): steel 400, aluminium 110, carbon fibre 600, bamboo 40. Which claim do these data support?',
    o:[{t:'Bamboo is stronger than steel',s:0},{t:'Aluminium is stronger than carbon fibre',s:0},
       {t:'Carbon fibre is the strongest of those tested',s:1},{t:'All four are equally strong',s:0}],
    why:'600 MPa is the highest value in the table.' },
  { id:'sc5', d:'sci', w:1.3, p:'You want to know whether a fertiliser increases plant growth. Which design answers the question?',
    o:[{t:'Grow ten plants with fertiliser and check they look healthy',s:.15},
       {t:'Grow two identical groups, one with fertiliser and one without, same light and water',s:1},
       {t:'Add fertiliser to every plant and record growth',s:.1},
       {t:'Ask other students what they think',s:0}],
    why:'Only a control group held otherwise identical isolates the fertiliser as the cause.' }
);

/* ── Inventory: preference items, no right answer ───────────────
   Each option carries a `v`: an engine key (interest/priority/
   region), a 0-100 number (risk/budget), or a raw value (minpay,
   booleans). Answers are tallied, never graded.                  */

const INVENTORY = [
  { id:'iv-interest', title:'Interest vector', sub:'Six forced choices that place you on the interest map.',
    items:[
    { id:'in1', f:'interest', p:'Which weekend project would you start first?',
      o:[{t:'Train a small model to recognise my handwriting',v:'computing'},
         {t:'Build a line-following robot from scrapped parts',v:'mechatronics'},
         {t:'Wire up a sensor board and log data from my room',v:'electronics'},
         {t:'Design a poster series for a climate campaign',v:'creative'}] },
    { id:'in2', f:'interest', p:'Which problem would you stay up late for?',
      o:[{t:'Making a solar charger work in low light',v:'energy'},
         {t:'Finding a gene marker for a crop disease',v:'biotech'},
         {t:'Predicting which stocks move together',v:'fintech'},
         {t:'Getting a drone to land smoothly in gusty wind',v:'aerospace'}] },
    { id:'in3', f:'interest', p:'Your favourite kind of puzzle?',
      o:[{t:'Why a bridge cracked, and where its material limits lie',v:'research'},
         {t:'How to keep a lake clean without shutting the town down',v:'climate'},
         {t:'How to grow more rice per acre with less water',v:'agritech'},
         {t:'How to make an interface feel satisfying to use',v:'creative'}] },
    { id:'in4', f:'interest', p:'Which compliment would mean the most to you?',
      o:[{t:'"Your circuit is elegant."',v:'electronics'},
         {t:'"Your algorithm is clever."',v:'computing'},
         {t:'"Your design is beautiful."',v:'creative'},
         {t:'"Your experiment was rigorous."',v:'research'}] },
    { id:'in5', f:'interest', p:'Five labs. Which do you walk into first?',
      o:[{t:'The robotics bay, full of arms and actuators',v:'mechatronics'},
         {t:'The cleanroom, with silicon wafers under amber light',v:'electronics'},
         {t:'The wet lab, with cell cultures and sequencers',v:'biotech'},
         {t:'The aerodynamics hall, with scale models in a wind tunnel',v:'aerospace'}] },
    { id:'in6', f:'interest', p:'What does success look like to you?',
      o:[{t:'A product people use every day',v:'computing'},
         {t:'Cheaper clean power for my own town',v:'energy'},
         {t:'A fund I built that quietly beats the market',v:'fintech'},
         {t:'Honestly, still not sure — keep my options open',v:'undecided'}] }
    ]},

  { id:'iv-family', title:'Family lens & risk', sub:'How your household weighs cost, prestige, security and risk.',
    items:[
    { id:'pr1', f:'priority', p:'Your family must pick one of these for you. Which?',
      o:[{t:'A secure job with a modest but safe salary',v:'stability'},
         {t:'A costlier degree with the shortest payback period',v:'roi'},
         {t:'The most prestigious institute, whatever it costs',v:'prestige'},
         {t:'The field you would do unpaid because you love it',v:'passion'}] },
    { id:'pr2', f:'priority', p:'The dream course turns out to be expensive. What matters most now?',
      o:[{t:'A guaranteed placement track',v:'stability'},
         {t:'Breaking even within three years',v:'roi'},
         {t:'The name of the institution on my degree',v:'prestige'},
         {t:'Studying something I actually enjoy',v:'passion'}] },
    { id:'pr3', f:'priority', p:'Which risk feels most acceptable to your family?',
      o:[{t:'Lower pay, but almost no chance of losing the job',v:'stability'},
         {t:'High pay, fast payback, some job churn',v:'roi'},
         {t:'The conventional path that relatives respect',v:'prestige'},
         {t:'An uncertain path that is genuinely interesting',v:'passion'}] },
    { id:'rk1', f:'risk', p:'A project has a 50% chance of a big prize and a 50% chance of nothing. A small prize is also guaranteed. You pick:',
      o:[{t:'The guaranteed small prize',v:10},
         {t:'The risky project, hedged with a backup plan',v:55},
         {t:'The risky project, all in',v:95},
         {t:'Ask to decide later',v:25}] },
    { id:'rk2', f:'risk', p:'Your idea needs six months and might fail. You:',
      o:[{t:'Skip it and finish the degree on schedule',v:15},
         {t:'Build it on weekends alongside study',v:45},
         {t:'Take a semester off to build it',v:80},
         {t:'Go full time and commit',v:100}] },
    { id:'rk3', f:'risk', p:'A new specialisation is offered with no placement history yet. You:',
      o:[{t:'Stay in the proven branch',v:10},
         {t:'Take it, but keep a fallback minor',v:55},
         {t:'Take it and commit fully',v:90},
         {t:'Wait a year and watch how it goes for others',v:30}] }
    ]},

  { id:'iv-money', title:'Financial envelope & location', sub:'The hard constraint that decides which roadmaps are actually fundable.',
    items:[
    { id:'bd1', f:'budget', p:'Over a four-year degree, roughly what total tuition could your household handle without borrowing?',
      o:[{t:'Under Rs 2 lakh',v:12},{t:'Rs 2-5 lakh',v:32},{t:'Rs 5-10 lakh',v:55},
         {t:'Rs 10-20 lakh',v:78},{t:'More than Rs 20 lakh',v:95}] },
    { id:'bd2', f:'budget', p:'If the right course cost more than that, your family would:',
      o:[{t:'Not consider it at all',v:15},{t:'Consider it only with a full scholarship',v:35},
         {t:'Take a partial education loan',v:62},{t:'Take a large loan if the payback is clear',v:88}] },
    { id:'mp1', f:'minpay', p:'What is the lowest starting salary (Rs lakh per year) you would accept for the right career?',
      o:[{t:'Rs 3-4 LPA',v:4},{t:'Rs 4-6 LPA',v:5},{t:'Rs 6-9 LPA',v:7},
         {t:'Rs 9-14 LPA',v:11},{t:'Rs 14+ LPA',v:16}] },
    { id:'rg1', f:'region', p:'Where do you see yourself building your career?',
      o:[{t:'Chennai corridor',v:'chennai'},{t:'Coimbatore industrial belt',v:'coimbatore'},
         {t:'Bengaluru deep-tech corridor',v:'bengaluru'},{t:'Hyderabad semiconductor & genome valley',v:'hyderabad'},
         {t:'Pune manufacturing cluster',v:'pune'},{t:'Remote, working for global teams',v:'remote'}] },
    { id:'fg1', f:'firstGen', p:'Would you be the first person in your family to go to college?',
      o:[{t:'Yes, the first',v:true},{t:'No, a parent or older sibling went',v:false}] },
    { id:'mb1', f:'mobility', p:'How far would your family let you move for the right role?',
      o:[{t:'Stay hyper-local, near home',v:'hyperlocal'},{t:'Anywhere within my state',v:'intrastate'},
         {t:'Anywhere in India',v:'panindia'},{t:'Abroad or remote for a global team',v:'global'}] },
    { id:'tr1', f:'tier', p:'What kind of place does your family live in?',
      o:[{t:'A metro city',v:'tier1'},{t:'A regional hub or tier-2 town',v:'tier2'},
         {t:'A small town or rural area',v:'tier3'}] },
    { id:'pf1', f:'scholarship', p:'Should the engine hunt for scholarships and fee waivers on your behalf?',
      o:[{t:'Yes, always look for funding',v:true},{t:'No, fee waivers are not relevant to us',v:false}] },
    { id:'pf2', f:'hyperlocal', p:'Should it favour hyper-local innovation roles over national-average demand?',
      o:[{t:'Yes, bias toward what my region is building',v:true},
         {t:'No, judge me against the national market',v:false}] }
    ]}
];

/* ── Presentation steps: 5 aptitude domains, then 3 inventories ─ */
const STEPS = [].concat(
  DOMAINS.map(d => ({
    id:'apt-' + d.key, kind:'apt', domain:d.key, hue:d.hue,
    title:d.label, sub:d.blurb, items:APTITUDE.filter(i => i.d === d.key)
  })),
  INVENTORY.map(g => ({ id:g.id, kind:'inv', title:g.title, sub:g.sub, items:g.items }))
);

const APT_TOTAL = APTITUDE.reduce((n,i) => n + i.w, 0);
const ITEM_TOTAL = APTITUDE.length + INVENTORY.reduce((n,g) => n + g.items.length, 0);

/* Form defaults — mirror the authored values in index.html so an
   unanswered inventory never silently changes a roadmap. */
const DEFAULTS = {
  interest:'computing', priority:'roi', risk:40, budget:58,
  minpay:6, region:'chennai', scholarship:true, hyperlocal:true,
  firstGen:false, mobility:'hyperlocal', tier:'tier2'
};

function bandFor(score){
  if (score >= 80) return 'High';
  if (score >= 60) return 'Above average';
  if (score >= 40) return 'Moderate';
  return 'Developing';
}

/* Grade the aptitude half. `answers` maps item id -> option index. */
function gradeAptitude(answers){
  const a = answers || {};
  const byTrait = {}, graded = [];
  for (const d of DOMAINS){
    let got = 0, max = 0, right = 0, seen = 0;
    for (const it of APTITUDE){
      if (it.d !== d.key) continue;
      max += it.w;
      const pick = a[it.id];
      let best = 0, chosen = -1;
      it.o.forEach((o,i) => { if (o.s > it.o[best].s) best = i; });
      if (typeof pick === 'number' && it.o[pick]){
        chosen = pick; seen++;
        got += it.w * it.o[pick].s;
        if (pick === best) right++;
      }
      graded.push({ id:it.id, domain:d.key, picked:chosen, best, why:it.why,
                    correct: chosen === best, score: chosen < 0 ? 0 : it.o[chosen].s });
    }
    const raw = max ? got / max : 0;
    const score = Math.round(clamp01(raw) * 100);
    byTrait[d.key] = { trait:d.trait, raw:Math.round(raw*1000)/1000, score,
                       band:bandFor(score), correct:right, attempted:seen,
                       items:APTITUDE.filter(i => i.d === d.key).length };
  }
  return { byTrait, graded };
}

/* Tally a forced-choice field; ties break by first appearance, so the
   outcome is deterministic for a given answer sheet. */
function tallyChoices(answers, ids){
  const counts = {}, order = [];
  for (const id of ids){
    const pick = answers[id];
    const item = INVENTORY.flatMap(g => g.items).find(i => i.id === id);
    if (!item || typeof pick !== 'number' || !item.o[pick]) continue;
    const v = item.o[pick].v;
    if (!(v in counts)){ counts[v] = 0; order.push(v); }
    counts[v]++;
  }
  let win = null;
  for (const v of order) if (win === null || counts[v] > counts[win]) win = v;
  return win;
}
function meanOf(answers, ids, fallback){
  let sum = 0, n = 0;
  const all = INVENTORY.flatMap(g => g.items);
  for (const id of ids){
    const pick = answers[id];
    const item = all.find(i => i.id === id);
    if (!item || typeof pick !== 'number' || !item.o[pick]) continue;
    sum += item.o[pick].v; n++;
  }
  return n ? Math.round(sum / n) : fallback;
}
function directOf(answers, id, fallback){
  const item = INVENTORY.flatMap(g => g.items).find(i => i.id === id);
  const pick = answers ? answers[id] : undefined;
  if (!item || typeof pick !== 'number' || !item.o[pick]) return fallback;
  return item.o[pick].v;
}

/* Turn a full answer sheet into a ready-to-run engine input. */
function buildProfile(answers){
  const a = answers || {};
  const apt = gradeAptitude(a).byTrait;
  const student = { interest: tallyChoices(a, ['in1','in2','in3','in4','in5','in6']) || DEFAULTS.interest };
  for (const d of DOMAINS) student[d.trait] = apt[d.key].score;
  const parent = {
    priority: tallyChoices(a, ['pr1','pr2','pr3']) || DEFAULTS.priority,
    budget:   meanOf(a, ['bd1','bd2'], DEFAULTS.budget),
    risk:     meanOf(a, ['rk1','rk2','rk3'], DEFAULTS.risk),
    minpay:   directOf(a, 'mp1', DEFAULTS.minpay)
  };
  return {
    student, parent,
    region:      directOf(a, 'rg1', DEFAULTS.region),
    scholarship: directOf(a, 'pf1', DEFAULTS.scholarship) !== false,
    hyperlocal:  directOf(a, 'pf2', DEFAULTS.hyperlocal) !== false,
    firstGen:    directOf(a, 'fg1', DEFAULTS.firstGen) === true,
    mobility:    directOf(a, 'mb1', DEFAULTS.mobility),
    tier:        directOf(a, 'tr1', DEFAULTS.tier)
  };
}

/* Everything the UI and the API need from one answer sheet. */
function scoreBattery(answers){
  const a = answers || {};
  const apt = gradeAptitude(a);
  const answered = ITEM_TOTAL - countBlank(a);
  return {
    version: 'battery-1',
    aptitude: apt.byTrait,
    graded: apt.graded,
    profile: buildProfile(a),
    answered, total: ITEM_TOTAL,
    complete: answered === ITEM_TOTAL,
    completion: Math.round(answered / ITEM_TOTAL * 100),
    meanAptitude: Math.round(DOMAINS.reduce((n,d) => n + apt.byTrait[d.key].score, 0) / DOMAINS.length)
  };
}
function countBlank(a){
  let n = 0;
  for (const it of APTITUDE) if (typeof a[it.id] !== 'number') n++;
  for (const g of INVENTORY) for (const it of g.items) if (typeof a[it.id] !== 'number') n++;
  return n;
}

export { DOMAINS, APTITUDE, INVENTORY, STEPS, APT_TOTAL, ITEM_TOTAL, DEFAULTS,
         bandFor, gradeAptitude, buildProfile, scoreBattery };
