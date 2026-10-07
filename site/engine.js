/* ══════════════════════════════════════════════════════════════
   PRISM ENGINE — pure scoring core (shared, isomorphic)

   This module is the single source of truth for the algorithm:
     ingest → vectorise/normalise → solve constraints
            → synthesise market intelligence → generate roadmap

   It is imported by BOTH:
     · the browser  (app.js, as an ES module over HTTP)
     · the Worker   (api.js → deploy/worker.js, inlined at build time
                     so the server runs byte-identical logic)

   It has no DOM, network or environment dependencies — just data in,
   scored roadmap out. Keep it that way.
   ══════════════════════════════════════════════════════════════ */

/* ── 1. Reference data ─────────────────────────────────────── */
const REGIONS = [
  ['chennai',    'Chennai · Tamil Nadu corridor'],
  ['coimbatore', 'Coimbatore · Kongu industrial belt'],
  ['bengaluru',  'Bengaluru · deep-tech corridor'],
  ['hyderabad',  'Hyderabad · genome & semiconductor valley'],
  ['pune',       'Pune · manufacturing & auto cluster'],
  ['remote',     'Hyper-local / remote-global']
];

const INTERESTS = [
  ['computing',    'Computing, AI & data'],
  ['electronics',  'Electronics, VLSI & embedded'],
  ['mechatronics', 'Robotics & automation'],
  ['energy',       'Energy & sustainability'],
  ['biotech',      'Biotech, health & life sciences'],
  ['aerospace',    'Aerospace, drones & space'],
  ['agritech',     'Agri-tech & food systems'],
  ['fintech',      'Finance, quant & markets'],
  ['creative',     'Design, media & XR'],
  ['climate',      'Climate & environment'],
  ['research',     'Pure science research'],
  ['undecided',    'No fixed preference yet']
];

const TRAITS = [
  ['logic',    'Logical reasoning'],
  ['creative', 'Creativity'],
  ['comm',     'Communication'],
  ['hands',    'Hands-on build'],
  ['sci',      'Science depth']
];

const CAREERS = [
  { id:'ai', name:'Applied AI & Data Science', domain:'computing', c:'#7c5cff', hyperlocal:false,
    v:{logic:92,creative:55,comm:48,hands:45,sci:60}, cost:9.5, years:4, entry:8.5, mid:26, vol:55,
    d:{chennai:88,coimbatore:64,bengaluru:96,hyderabad:92,pune:82,remote:90},
    exams:['JEE Main','VITEEE','BITSAT','CUET (CS)'],
    funds:['INSPIRE Scholarship','Reliance Foundation UG','AICTE Pragati (girls)','Institute merit waiver'] },

  { id:'vlsi', name:'Semiconductor & VLSI Design', domain:'electronics', c:'#38bdf8', hyperlocal:false,
    v:{logic:90,creative:42,comm:40,hands:72,sci:78}, cost:10, years:4, entry:7.5, mid:24, vol:44,
    d:{chennai:76,coimbatore:70,bengaluru:94,hyderabad:97,pune:74,remote:52},
    exams:['JEE Advanced','JEE Main','VITEEE','GATE (later)'],
    funds:['India Semiconductor Mission fellowship','INSPIRE Scholarship','Institute teaching assistantship'] },

  { id:'robotics', name:'Robotics & Industrial Automation', domain:'mechatronics', c:'#34d399', hyperlocal:true,
    v:{logic:82,creative:66,comm:45,hands:95,sci:70}, cost:8.5, years:4, entry:6.5, mid:18, vol:58,
    d:{chennai:92,coimbatore:88,bengaluru:80,hyderabad:74,pune:86,remote:44},
    exams:['JEE Main','VITEEE','TNEA','State CETs'],
    funds:['AICTE Pragati / Saksham','State first-graduate scheme','Nano Mech Labs innovation grant'] },

  { id:'energy', name:'Renewable Energy & Grid Systems', domain:'energy', c:'#fbbf24', hyperlocal:true,
    v:{logic:76,creative:58,comm:52,hands:84,sci:82}, cost:8, years:4, entry:6, mid:17, vol:50,
    d:{chennai:84,coimbatore:80,bengaluru:72,hyderabad:70,pune:78,remote:38},
    exams:['JEE Main','TNEA','VITEEE'],
    funds:['MNRE scholarship','State solar-skills stipend','INSPIRE Scholarship'] },

  { id:'biotech', name:'Biotechnology & Genomics', domain:'biotech', c:'#22d3ee', hyperlocal:false,
    v:{logic:80,creative:60,comm:50,hands:74,sci:94}, cost:11, years:4, entry:5.5, mid:16, vol:62,
    d:{chennai:86,coimbatore:62,bengaluru:90,hyderabad:94,pune:76,remote:40},
    exams:['NEET','CUET','IISER Aptitude Test','VITEEE (Bio)'],
    funds:['DBT-JRF (later)','INSPIRE (BSc / Int. MSc)','Kotak Kanya Scholarship','Industry internship stipend'] },

  { id:'aero', name:'Aerospace & Drone Systems', domain:'aerospace', c:'#f472b6', hyperlocal:true,
    v:{logic:85,creative:64,comm:48,hands:90,sci:86}, cost:12, years:4, entry:6.8, mid:19, vol:66,
    d:{chennai:82,coimbatore:86,bengaluru:94,hyderabad:88,pune:80,remote:46},
    exams:['JEE Advanced','JEE Main','VITEEE','NDA (defence track)'],
    funds:['DRDO / ISRO project assistantship','INSPIRE Scholarship','Institute merit waiver'] },

  { id:'swe', name:'Product Software Engineering', domain:'computing', c:'#8b5cf6', hyperlocal:false,
    v:{logic:88,creative:70,comm:62,hands:66,sci:48}, cost:8.5, years:4, entry:9, mid:30, vol:60,
    d:{chennai:84,coimbatore:68,bengaluru:98,hyderabad:94,pune:90,remote:96},
    exams:['JEE Main','VITEEE','BITSAT','CUET (CS)'],
    funds:['Institute merit scholarship','Reliance Foundation UG','Employer-sponsored upskilling'] },

  { id:'agri', name:'Agri-Tech & Precision Farming', domain:'agritech', c:'#4ade80', hyperlocal:true,
    v:{logic:70,creative:62,comm:66,hands:88,sci:72}, cost:7, years:4, entry:5, mid:14, vol:64,
    d:{chennai:70,coimbatore:94,hyderabad:82,pune:76,bengaluru:60,remote:36},
    exams:['ICAR AIEEA','TNEA','State Agri CET','CUET'],
    funds:['ICAR merit scholarship','NABARD agri-fellowship','State farmer-family scheme'] },

  { id:'health', name:'Medicine & Health Sciences', domain:'biotech', c:'#2dd4bf', hyperlocal:false,
    v:{logic:82,creative:44,comm:72,hands:80,sci:95}, cost:22, years:5.5, entry:6, mid:22, vol:46,
    d:{chennai:88,coimbatore:82,bengaluru:86,hyderabad:84,pune:80,remote:24},
    exams:['NEET UG','State / AIIMS counselling'],
    funds:['State fee-waiver counsellings','Central Sector Scheme','Post-matric scholarship','Counselling bond terms'] },

  { id:'quant', name:'Quantitative Finance & FinTech', domain:'fintech', c:'#facc15', hyperlocal:false,
    v:{logic:96,creative:50,comm:64,hands:40,sci:66}, cost:9, years:4, entry:10, mid:32, vol:72,
    d:{chennai:78,coimbatore:54,bengaluru:92,hyderabad:80,pune:88,remote:84},
    exams:['JEE Main','CUET','BITSAT','ISI / CMI entrance (later)'],
    funds:['Institute merit scholarship','Industry quant fellowship','AICTE schemes'] },

  { id:'xr', name:'Immersive Media, XR & Game Tech', domain:'creative', c:'#e879f9', hyperlocal:true,
    v:{logic:66,creative:97,comm:68,hands:72,sci:40}, cost:7.5, years:4, entry:5, mid:15, vol:78,
    d:{chennai:74,coimbatore:60,bengaluru:88,hyderabad:82,pune:70,remote:90},
    exams:['UCEED','NID DAT','Portfolio route'],
    funds:['Institute design scholarship','Nano Mech Labs studio grant','Kotak Kanya Scholarship'] },

  { id:'climate', name:'Climate & Environmental Engineering', domain:'climate', c:'#5eead4', hyperlocal:true,
    v:{logic:74,creative:60,comm:70,hands:76,sci:84}, cost:9, years:4, entry:5.5, mid:15, vol:56,
    d:{chennai:80,coimbatore:78,bengaluru:76,hyderabad:72,pune:74,remote:42},
    exams:['JEE Main','CUET','TNEA'],
    funds:['INSPIRE Scholarship','Climate-action fellowship','State merit scholarship'] },

  { id:'arch', name:'Sustainable Architecture & Urban Design', domain:'creative', c:'#c084fc', hyperlocal:true,
    v:{logic:70,creative:92,comm:74,hands:70,sci:52}, cost:12, years:5, entry:5, mid:16, vol:60,
    d:{chennai:82,coimbatore:76,bengaluru:80,hyderabad:86,pune:78,remote:34},
    exams:['NATA','JEE Main Paper 2','State B.Arch CET'],
    funds:['Institute merit waiver','State fee reimbursement','CEED (later, PG)'] },

  { id:'research', name:'Pure Science Research (IISER / IISc route)', domain:'research', c:'#a5b4fc', hyperlocal:false,
    v:{logic:94,creative:72,comm:52,hands:56,sci:98}, cost:4.5, years:5, entry:4.5, mid:18, vol:74,
    d:{chennai:70,coimbatore:56,bengaluru:84,hyderabad:86,pune:88,remote:60},
    exams:['IISER Aptitude Test','JEE Advanced','INSPIRE / KVPY-successor'],
    funds:['INSPIRE Scholarship (Rs 80k/yr)','IISER need-based aid','DST research fellowship'] },

  { id:'embedded', name:'Embedded Systems & IoT Hardware', domain:'electronics', c:'#60a5fa', hyperlocal:true,
    v:{logic:84,creative:58,comm:44,hands:92,sci:74}, cost:7.5, years:4, entry:6, mid:17, vol:50,
    d:{chennai:86,coimbatore:82,bengaluru:88,hyderabad:86,pune:84,remote:48},
    exams:['JEE Main','VITEEE','TNEA'],
    funds:['AICTE Pragati / Saksham','State first-graduate scheme','Institute merit waiver'] }
];

const PRIORITY = {
  stability:{ label:'Stability & job security', volW:-1.6, rois:0,    prestige:.0,  mkt:.34, fin:.30, roi:.16, fit:.20 },
  roi:      { label:'Return on investment',     volW:0,    rois:1,    prestige:.0,  mkt:.28, fin:.26, roi:.30, fit:.16 },
  prestige: { label:'Prestige & standing',      volW:.5,   rois:.4,   prestige:.12, mkt:.26, fin:.20, roi:.18, fit:.24 },
  passion:  { label:'Passion & fulfilment',     volW:.8,   rois:-.2,  prestige:.06, mkt:.18, fin:.16, roi:.06, fit:.54 }
};
const CONVENTIONAL = ['health','vlsi','swe','ai','quant'];

/* ── Socio-economic mobility parameters ─────────────────────
   How far a family will let a student travel for work, and what kind of
   settlement they are starting from. Both reshape the market signal and
   the real purchasing power behind the household budget.               */
const MOBILITY = [
  ['hyperlocal','Hyper-local only',       1.00],
  ['intrastate','Intra-state relocation', 0.70],
  ['panindia',  'Pan-India relocation',   0.45],
  ['global',    'Global / remote-first',  0.35]
];
const TIERS = [
  ['tier1','Tier-1 Metro',         1.12],
  ['tier2','Tier-2 Regional Hub',  1.00],
  ['tier3','Tier-3 / Rural',       0.82]
];
const MOBILITY_BLEND = Object.fromEntries(MOBILITY.map(m => [m[0], m[2]]));
const TIER_CAP       = Object.fromEntries(TIERS.map(t => [t[0], t[2]]));
const TIER_LOCAL     = { tier1:0, tier2:0, tier3:6 };   // rural clusters reward local innovation roles
const MOBILITY_KEYS  = new Set(MOBILITY.map(m => m[0]));
const TIER_KEYS      = new Set(TIERS.map(t => t[0]));

/* ── 2. Helpers ────────────────────────────────────────────── */
const clamp = (x,a,b) => Math.max(a, Math.min(b, x));
const r1 = x => Math.round(x*10)/10;

// cosine similarity between the student vector and a career ideal vector
function cosine(a, b){
  let dot=0, na=0, nb=0;
  for (let i=0;i<a.length;i++){ dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na)*Math.sqrt(nb) || 1);
}

function orderRanks(scores){
  const idx = scores.map((s,i)=>({s,i})).sort((x,y)=>y.s-x.s);
  const ranks = new Array(scores.length);
  idx.forEach((o,r)=> ranks[o.i] = r);
  return ranks;
}

// Spearman rank correlation — measures divergence between two rankings
function spearman(a0, b0){
  const n = a0.length;
  if (n < 2) return 1;
  const a = orderRanks(a0), b = orderRanks(b0);
  let d2 = 0;
  for (let i=0;i<n;i++) d2 += (a[i]-b[i]) ** 2;
  return 1 - (6*d2) / (n*(n*n - 1));
}

/* ── 3. The engine ─────────────────────────────────────────── */
function runEngine(input){
  const traitKeys = TRAITS.map(t => t[0]);
  const sv = traitKeys.map(k => input.student[k] / 100);   // student vector on [0,1]
  const reg = input.region;

  // Socio-economic mobility — unknown values fall back to the legacy defaults
  const mobility = MOBILITY_KEYS.has(input.parent.mobility) ? input.parent.mobility : 'hyperlocal';
  const tier     = TIER_KEYS.has(input.parent.tier)         ? input.parent.tier         : 'tier2';
  const firstGen = input.parent.firstGen === true;
  const blend    = MOBILITY_BLEND[mobility];

  // Financial Constraint Solver: household capacity across the degree horizon (Rs lakh),
  // scaled by settlement tier — the same rupee goes further in a metro than a rural cluster.
  const capacity = (1.5 + input.parent.budget * 0.30) * TIER_CAP[tier];   // 1.5L … 35.3L

  // A first-generation learner carries no family experience of higher education, so the
  // solver leans harder on affordability and on funded pathways than on prestige signals.
  const W = { fit:.36 - (firstGen?.05:0), fin:.24 + (firstGen?.07:0),
              risk:.14, mkt:.26 - (firstGen?.02:0) };

  const scored = CAREERS.map(c => {
    const cv = traitKeys.map(k => c.v[k] / 100);
    const interestMatch = input.student.interest === c.domain ||
                          input.student.interest === 'undecided';
    let fit = cosine(sv, cv) * 100;
    fit = clamp(interestMatch ? fit + 8 : fit - 4, 0, 100);

    // financial viability
    let fin, finGap = 0;
    if (c.cost <= capacity){
      fin = 84 + 16 * Math.min(1, (capacity - c.cost) / Math.max(capacity,1) * 2.2);
    } else {
      finGap = c.cost - capacity;
      fin = Math.max(4, 84 - finGap * 7.2);
    }
    const yieldGap = Math.max(0, input.parent.minpay - c.entry);
    fin = clamp(fin - yieldGap * 3.6, 0, 100);
    if (firstGen && input.scholarship) fin = clamp(fin + 4, 0, 100);   // aid discovery matters most here

    // risk alignment
    const riskAl = clamp(100 - Math.abs(c.vol - input.parent.risk) * 1.05, 4, 100);

    // market intelligence — the demand pool widens with the family's mobility ceiling
    const avgDemand = REGIONS.reduce((n, [k]) => n + c.d[k], 0) / REGIONS.length;
    let mkt = blend * c.d[reg] + (1 - blend) * avgDemand;
    if (mobility === 'global') mkt = Math.max(mkt, (c.d.remote || 0) * .9);
    if (input.hyperlocal && c.hyperlocal) mkt += 7 * blend + (TIER_LOCAL[tier] * blend);
    mkt += (c.entry / 30) * 6;                              // hiring-velocity bonus
    mkt = clamp(mkt, 0, 100);

    // parent preference ranking input
    const pr = PRIORITY[input.parent.priority] || PRIORITY.roi;   // fall back if the lens is unknown
    const roiScore = clamp((c.mid / c.cost) * 4.2, 0, 100);  // payback multiple
    let parentScore = pr.mkt*mkt + pr.fin*fin + pr.roi*roiScore + pr.fit*fit
                    + pr.prestige*100*(CONVENTIONAL.includes(c.domain) ? 1 : .35);
    parentScore = clamp(parentScore + pr.volW * (c.vol - 50) * .6, 0, 100);

    const composite = clamp(W.fit*fit + W.fin*fin + W.risk*riskAl + W.mkt*mkt - yieldGap*2.2, 0, 100);

    return { c, fit, fin, riskAl, mkt, parentScore, composite, finGap, yieldGap, interestMatch, roiScore };
  });

  // Parent–Student Conflict Index from Spearman rank divergence
  const rho = spearman(scored.map(s => s.fit), scored.map(s => s.parentScore));
  const pci = clamp(Math.round((1 - rho) / 2 * 100), 0, 100);

  /* Parent Expectation Vector — the trait profile the family is effectively asking for,
     taken from the career THEY would rank first and pulled part-way toward the student
     in proportion to how much the two rankings already agree. Plotting it under the
     student's own vector makes the Parent–Student Conflict Index visible as the gap
     between two polygons rather than a bare number. */
  const parentTop = [...scored].sort((a,b) => b.parentScore - a.parentScore)[0].c;
  const parentVec = traitKeys.map((k, i) =>
    Math.round(clamp(parentTop.v[k] + (input.student[k] - parentTop.v[k]) * (.18 + rho * .22), 0, 100)));

  const ranked = [...scored].sort((a,b) => b.composite - a.composite);
  const top = ranked.slice(0,3);
  const best = ranked[0];

  return { scored, ranked, top, best, pci, rho, capacity, parentVec, mobility, tier, firstGen,
           gaps: buildGaps(best, pci, rho, capacity, input) };
}

function buildGaps(best, pci, rho, capacity, input){
  const gaps = [];
  const t = input.student, req = k => best.c.v[k];

  if (t.comm < req('comm') - 18)
    gaps.push({ warn:true, html:`<b>Communication gap.</b> ${best.c.name} carries a communication load of <b>${req('comm')}</b> against your <b>${t.comm}</b>. Close it in years 1–2 with presentations, technical writing, debate or a student-chapter role.` });
  if (t.sci < req('sci') - 18)
    gaps.push({ warn:true, html:`<b>Science-depth gap.</b> The domain expects conceptual science depth of <b>${req('sci')}</b> versus your <b>${t.sci}</b>. Add a foundational-then-advanced course ladder before the entrance window.` });
  if (t.logic < req('logic') - 18)
    gaps.push({ warn:true, html:`<b>Analytical gap.</b> Required logical intensity is <b>${req('logic')}</b> against your <b>${t.logic}</b>. Prescribe structured problem-solving and olympiad-style exposure.` });
  if (best.finGap > 0)
    gaps.push({ warn:true, html:`<b>Financial gap of Rs ${r1(best.finGap)} lakh.</b> Projected household capacity Rs ${r1(capacity)}L against a programme cost of Rs ${r1(best.c.cost)}L. Viable levers: ${best.c.funds.slice(0,3).join(', ')}, education-loan structuring, or the state-aided equivalent pathway.` });
  if (best.yieldGap > 0)
    gaps.push({ warn:true, html:`<b>Yield mismatch of Rs ${r1(best.yieldGap)} LPA.</b> Starting yield Rs ${r1(best.c.entry)} LPA sits below the family's Rs ${r1(input.parent.minpay)} LPA threshold; the mid-career band of Rs ${r1(best.c.mid)} LPA crosses it roughly <b>${best.c.years + Math.max(2, Math.round((input.parent.minpay - best.c.entry)/1.6))} years</b> in.` });
  if (input.parent.risk < 35 && best.c.vol > 62)
    gaps.push({ warn:true, html:`<b>Risk-appetite flag.</b> ${best.c.name} carries a volatility index of <b>${best.c.vol}</b> against household appetite <b>${input.parent.risk}</b>. Stage it — secure a stable adjacent qualification first, then pivot.` });
  if (pci >= 60)
    gaps.push({ warn:true, html:`<b>High Parent–Student Conflict (${pci}).</b> The family preference ranking diverges sharply from the aptitude ranking (Spearman rho = ${r1(rho)}). Run a structured joint review of the bridge options below before locking any single choice.` });
  if (best.finGap <= 0 && best.yieldGap <= 0 && t.comm >= 68 && t.logic >= 78)
    gaps.push({ warn:false, html:`<b>Strength to leverage.</b> High reasoning with above-average communication is the rarest pairing in STEAM hiring — aim for hybrid technical-leadership tracks early.` });
  if (best.interestMatch && best.finGap <= 0)
    gaps.push({ warn:false, html:`<b>Interest and affordability both clear.</b> Stated interest aligns with the top-ranked domain and the household can fund it without leverage.` });
  if (!gaps.length)
    gaps.push({ warn:false, html:`<b>No blocking gaps detected.</b> Aptitude, affordability and market demand are mutually consistent for this profile at rho = ${r1(rho)}. Focus on entrance-exam timing and portfolio depth.` });
  return gaps;
}



/* ── 6. Wire contract ──────────────────────────────────────── */
/* Compact, serialisable projection of an engine result. Shared by the
   browser and the Worker so both speak exactly the same shape. */
function publicResult(r){
  const slim = s => ({
    composite: s.composite, fit: s.fit, fin: s.fin, riskAl: s.riskAl, mkt: s.mkt,
    finGap: s.finGap, yieldGap: s.yieldGap, roiScore: s.roiScore,
    interestMatch: s.interestMatch, c: s.c
  });
  return {
    best: slim(r.best), top: r.top.map(slim),
    pci: r.pci, rho: r.rho, capacity: r.capacity, parentVec: r.parentVec,
    mobility: r.mobility, tier: r.tier, firstGen: r.firstGen, gaps: r.gaps
  };
}

export {
  REGIONS, INTERESTS, TRAITS, CAREERS, PRIORITY, CONVENTIONAL, MOBILITY, TIERS,
  clamp, r1, cosine, orderRanks, spearman,
  runEngine, buildGaps, publicResult
};
