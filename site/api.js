/* ══════════════════════════════════════════════════════════════
   PRISM ENGINE — backend API (Cloudflare Worker)

   The same engine that runs in the browser also runs here, so every
   saved roadmap is server-authoritative and reproducible from its id.

     GET  /api/health            liveness + capability probe
     GET  /api/market?region=..  hyper-local demand slice (public cache)
     POST /api/assess            score a profile, persist, return id
     GET  /api/assess/:id        rehydrate a shared roadmap
     POST /api/battery           record one aptitude-battery sitting (validated)
     GET  /api/insights          aggregate market intelligence from D1

   Privacy: the store holds numeric vectors and derived scores only.
   No names, no contact details, no free text.
   ══════════════════════════════════════════════════════════════ */

import { REGIONS, INTERESTS, CAREERS, PRIORITY, TRAITS, publicResult, runEngine } from './engine.js';

const TRAIT_KEYS  = TRAITS.map(t => t[0]);          // logic, creative, comm, hands, sci
const REGION_KEYS = new Set(REGIONS.map(r => r[0]));
const INTEREST_KEYS = new Set(INTERESTS.map(i => i[0]));
const PRIORITY_KEYS = new Set(Object.keys(PRIORITY));
const MAX_BODY = 4096;

/* ── responses ─────────────────────────────────────────────── */
function json(body, status = 200, extra = {}){
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra
    }
  });
}
const fail = (status, reason, detail) =>
  json({ ok:false, error: reason, ...(detail ? { detail } : {}) }, status);

/* ── input validation ──────────────────────────────────────── */
class BadInput extends Error {}
const num = (v, name, lo, hi) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new BadInput(`${name} must be a number`);
  return Math.round(Math.min(hi, Math.max(lo, n)));
};
const pick = (v, name, set) => {
  if (typeof v !== 'string' || !set.has(v)) throw new BadInput(`${name} must be one of: ${[...set].join(', ')}`);
  return v;
};

/* Whitelists and clamps every field. The client cannot inject extra keys,
   out-of-range numbers, or unknown domains into the dataset. */
export function validateInput(raw){
  if (!raw || typeof raw !== 'object') throw new BadInput('body must be a JSON object');
  const s = raw.student, p = raw.parent;
  if (!s || typeof s !== 'object') throw new BadInput('student vector missing');
  if (!p || typeof p !== 'object') throw new BadInput('parent vector missing');

  const student = { interest: pick(s.interest, 'student.interest', INTEREST_KEYS) };
  for (const k of TRAIT_KEYS) student[k] = num(s[k], `student.${k}`, 0, 100);

  const parent = { priority: pick(p.priority, 'parent.priority', PRIORITY_KEYS) };
  parent.budget = num(p.budget, 'parent.budget', 0, 100);
  parent.risk   = num(p.risk,   'parent.risk',   0, 100);
  parent.minpay   = num(p.minpay,   'parent.minpay',   3, 24);
  // Socio-economic mobility. Legacy payloads omit these, so they fall back to the
  // values that reproduce the pre-mobility scoring exactly.
  parent.firstGen = p.firstGen === true;
  parent.mobility = typeof p.mobility === 'string' && MOBILITY_KEYS.has(p.mobility) ? p.mobility : 'hyperlocal';
  parent.tier     = typeof p.tier     === 'string' && TIER_KEYS.has(p.tier)         ? p.tier     : 'tier2';

  return {
    student, parent,
    region: pick(raw.region, 'region', REGION_KEYS),
    scholarship: raw.scholarship === true,
    hyperlocal:  raw.hyperlocal  === true
  };
}

/* ── request guards ────────────────────────────────────────── */
// Browsers send Origin on cross-origin POSTs; anything else is rejected.
function sameOrigin(request){
  const origin = request.headers.get('Origin');
  if (!origin) return true;                     // curl / test clients
  try { return new URL(origin).host === new URL(request.url).host; }
  catch { return false; }
}

// Best-effort per-isolate write throttle. Not a global limiter — the edge
// runs many isolates — but it stops runaway loops from a single client.
const HITS = new Map();
const WINDOW_MS = 60_000, MAX_WRITES = 30;
function throttle(request){
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const now = Date.now();
  const rec = HITS.get(ip);
  if (!rec || now > rec.reset){ HITS.set(ip, { n:1, reset: now + WINDOW_MS }); return true; }
  rec.n++;
  if (HITS.size > 5000) HITS.clear();
  return rec.n <= MAX_WRITES;
}

/* ── persistence (D1) ──────────────────────────────────────── */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS assessments (
     id            TEXT PRIMARY KEY,
     created_at    INTEGER NOT NULL,
     region        TEXT    NOT NULL,
     interest      TEXT    NOT NULL,
     priority      TEXT    NOT NULL,
     composite     REAL    NOT NULL,
     pci           INTEGER NOT NULL,
     conflict_band TEXT    NOT NULL,
     capacity      REAL    NOT NULL,
     fin_gap       REAL    NOT NULL,
     top1          TEXT    NOT NULL,
     top2          TEXT,
     top3          TEXT,
     input_json    TEXT    NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_assess_created ON assessments (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_assess_region  ON assessments (region)`,
  `CREATE INDEX IF NOT EXISTS idx_assess_top1    ON assessments (top1)`,
  `CREATE TABLE IF NOT EXISTS battery_attempts (
     id            TEXT PRIMARY KEY,
     created_at    INTEGER NOT NULL,
     region        TEXT    NOT NULL,
     interest      TEXT    NOT NULL,
     priority      TEXT    NOT NULL,
     logic         REAL    NOT NULL,
     creative      REAL    NOT NULL,
     comm          REAL    NOT NULL,
     hands         REAL    NOT NULL,
     sci           REAL    NOT NULL,
     mean_aptitude REAL    NOT NULL,
     answered      INTEGER NOT NULL,
     total         INTEGER NOT NULL,
     profile_json  TEXT    NOT NULL,
     aptitude_json TEXT    NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_battery_created ON battery_attempts (created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS schema_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`
];

// Idempotent, run once per isolate, off the request path where possible.
let schemaReady = null;
function ensureSchema(db){
  if (!schemaReady){
    schemaReady = (async () => {
      for (const sql of SCHEMA) await db.prepare(sql).run();
    })().catch(err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

const band = pci => pci < 30 ? 'low' : pci < 60 ? 'moderate' : 'high';

async function saveAssessment(db, input, result){
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const t = result.top;
  await db.prepare(
    `INSERT INTO assessments
       (id, created_at, region, interest, priority, composite, pci, conflict_band,
        capacity, fin_gap, top1, top2, top3, input_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, createdAt, input.region, input.student.interest, input.parent.priority,
    Number(result.best.composite.toFixed(3)), result.pci, band(result.pci),
    Number(result.capacity.toFixed(2)), Number(result.best.finGap.toFixed(2)),
    t[0].c.id, t[1] ? t[1].c.id : null, t[2] ? t[2].c.id : null,
    JSON.stringify(input)
  ).run();
  return { id, createdAt };
}

/* A battery sitting is untrusted input too: the profile is clamped by the
   same validator as a manual run, and every score is recomputed/derived
   server-side rather than trusted from the body. */

function validateBattery(body){
  if (!body || typeof body !== 'object') throw new BadInput('body must be an object');
  const apt = body.aptitude;
  if (!apt || typeof apt !== 'object') throw new BadInput('aptitude is required');
  const scores = {};
  for (const k of TRAIT_KEYS){
    const raw = apt[k];
    const v = raw && typeof raw === 'object' ? raw.score : raw;
    if (typeof v !== 'number' || !isFinite(v)) throw new BadInput('aptitude.' + k + ' must be a number');
    scores[k] = Math.max(0, Math.min(100, Math.round(v)));
  }
  const answered = Number(body.answered);
  const total = Number(body.total);
  return {
    profile: validateInput(body.profile),
    scores,
    mean: Math.round(TRAIT_KEYS.reduce((n, k) => n + scores[k], 0) / TRAIT_KEYS.length),
    answered: isFinite(answered) ? Math.max(0, Math.min(200, Math.round(answered))) : 0,
    total: isFinite(total) ? Math.max(0, Math.min(200, Math.round(total))) : 0
  };
}

async function saveBattery(db, a){
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const p = a.profile, s = a.scores;
  await db.prepare(
    `INSERT INTO battery_attempts
       (id, created_at, region, interest, priority, logic, creative, comm, hands, sci,
        mean_aptitude, answered, total, profile_json, aptitude_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, createdAt, p.region, p.student.interest, p.parent.priority,
    s.logic, s.creative, s.comm, s.hands, s.sci,
    a.mean, a.answered, a.total,
    JSON.stringify(p), JSON.stringify(s)
  ).run();
  return { id, createdAt };
}

async function loadAssessment(db, id){
  const row = await db.prepare(
    `SELECT id, created_at, input_json FROM assessments WHERE id = ? LIMIT 1`
  ).bind(id).first();
  if (!row) return null;
  let input;
  try { input = JSON.parse(row.input_json); } catch { return null; }
  return { id: row.id, createdAt: row.created_at, input };
}

const pct = (part, whole) => whole ? Math.round((part / whole) * 1000) / 10 : 0;

async function buildInsights(db){
  const [totals, regions, careers, bands, strain, recent, battery, partial] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n, AVG(composite) AS avg_composite, AVG(pci) AS avg_pci
                FROM assessments`),
    db.prepare(`SELECT region, COUNT(*) AS n FROM assessments
                GROUP BY region ORDER BY n DESC LIMIT 8`),
    db.prepare(`SELECT top1 AS career, COUNT(*) AS n FROM assessments
                GROUP BY top1 ORDER BY n DESC LIMIT 6`),
    db.prepare(`SELECT conflict_band AS band, COUNT(*) AS n FROM assessments
                GROUP BY conflict_band`),
    db.prepare(`SELECT COUNT(*) AS n FROM assessments WHERE fin_gap > 0`),
    db.prepare(`SELECT id, created_at, region, top1, composite, pci
                FROM assessments ORDER BY created_at DESC LIMIT 8`),
    db.prepare(`SELECT COUNT(*) AS n, AVG(mean_aptitude) AS avg_mean, AVG(logic) AS logic,
                        AVG(creative) AS creative, AVG(comm) AS comm, AVG(hands) AS hands,
                        AVG(sci) AS sci
                 FROM battery_attempts`),
    db.prepare(`SELECT COUNT(*) AS n FROM battery_attempts WHERE answered < total`)
  ]);

  const n = (totals.results && totals.results[0] && totals.results[0].n) || 0;
  const avgComposite = totals.results[0].avg_composite || 0;
  const avgPci = totals.results[0].avg_pci || 0;
  const strained = (strain.results[0] && strain.results[0].n) || 0;
  const bandMap = Object.fromEntries((bands.results || []).map(r => [r.band, r.n]));
  const nameOf = id => (CAREERS.find(c => c.id === id) || { name: id }).name;

  return {
    ok: true,
    total: n,
    avgComposite: Math.round(avgComposite * 10) / 10,
    avgPci: Math.round(avgPci),
    affordabilityStrainRate: pct(strained, n),
    byRegion: (regions.results || []).map(r => ({
      region: r.region,
      label: (REGIONS.find(x => x[0] === r.region) || [r.region, r.region])[1],
      count: r.n, share: pct(r.n, n)
    })),
    topCareers: (careers.results || []).map(r => ({
      id: r.career, name: nameOf(r.career), count: r.n, share: pct(r.n, n)
    })),
    conflictBands: {
      low: bandMap.low || 0, moderate: bandMap.moderate || 0, high: bandMap.high || 0
    },
    recent: (recent.results || []).map(r => ({
      id: r.id, createdAt: r.created_at, region: r.region,
      career: nameOf(r.top1), composite: Math.round(r.composite), pci: r.pci
    })),
    battery: (() => {
      const b = (battery.results && battery.results[0]) || {};
      const round = v => (typeof v === 'number' && isFinite(v)) ? Math.round(v) : 0;
      return {
        attempts: b.n || 0,
        avgMean: round(b.avg_mean),
        partial: (partial.results && partial.results[0] && partial.results[0].n) || 0,
        byDomain: TRAIT_KEYS.reduce((o, k) => { o[k] = round(b[k]); return o; }, {})
      };
    })()
  };
}

/* ── route handlers ────────────────────────────────────────── */
function market(env, url){
  const key = url.searchParams.get('region') || 'chennai';
  if (!REGION_KEYS.has(key)) return fail(400, 'unknown region', [...REGION_KEYS].join(', '));
  const meta = REGIONS.find(r => r[0] === key);
  const careers = CAREERS
    .map(c => ({
      id: c.id, name: c.name, domain: c.domain, colour: c.c,
      demand: c.d[key], cost: c.cost, years: c.years,
      entry: c.entry, mid: c.mid, vol: c.vol, hyperlocal: c.hyperlocal,
      exams: c.exams, funds: c.funds
    }))
    .sort((a, b) => b.demand - a.demand);
  return json(
    { ok:true, region:{ key, label: meta[1] }, generatedAt: new Date().toISOString(), careers },
    200,
    { 'cache-control': 'public, max-age=60, s-maxage=300' }
  );
}

async function assess(request, env){
  if (!sameOrigin(request)) return fail(403, 'cross-origin write rejected');
  if (!throttle(request))    return fail(429, 'rate limit exceeded, retry shortly');

  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail(413, 'payload too large');

  let body;
  try { body = JSON.parse(raw); }
  catch { return fail(400, 'body must be valid JSON'); }

  let input;
  try { input = validateInput(body); }
  catch (err){
    if (err instanceof BadInput) return fail(400, 'validation failed', err.message);
    throw err;
  }

  const t0 = Date.now();
  const result = publicResult(runEngine(input));
  const computeMs = Date.now() - t0;

  let saved = { id:null, createdAt:null };
  let persisted = false;
  if (env.DB){
    await ensureSchema(env.DB);
    saved = await saveAssessment(env.DB, input, result);
    persisted = true;
  }

  return json({
    ok:true, persisted, id: saved.id, createdAt: saved.createdAt,
    engine:{ version:1, computeMs }, input, result
  }, 201);
}

async function getAssess(env, id){
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return fail(400, 'malformed id');
  if (!env.DB) return fail(503, 'storage unavailable');
  await ensureSchema(env.DB);
  const row = await loadAssessment(env.DB, id);
  if (!row) return fail(404, 'no saved roadmap with that id');
  return json({
    ok:true, persisted:true, id: row.id, createdAt: row.createdAt,
    input: row.input, result: publicResult(runEngine(row.input))
  });
}

async function batteryAttempt(request, env){
  if (!sameOrigin(request)) return fail(403, 'cross-origin write rejected');
  if (!throttle(request))    return fail(429, 'rate limit exceeded, retry shortly');

  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail(413, 'payload too large');

  let body;
  try { body = JSON.parse(raw); }
  catch { return fail(400, 'body must be valid JSON'); }

  let attempt;
  try { attempt = validateBattery(body); }
  catch (err){
    if (err instanceof BadInput) return fail(400, 'validation failed', err.message);
    throw err;
  }

  let saved = { id:null, createdAt:null };
  let persisted = false;
  if (env.DB){
    await ensureSchema(env.DB);
    saved = await saveBattery(env.DB, attempt);
    persisted = true;
  }

  return json({
    ok:true, persisted, id: saved.id, createdAt: saved.createdAt,
    battery:{ version:1, model:'battery-1', byDomain: attempt.scores,
              meanAptitude: attempt.mean, answered: attempt.answered, total: attempt.total }
  }, 201);
}

async function insights(env){
  if (!env.DB) return json({ ok:false, available:false, reason:'storage unavailable' }, 200);
  await ensureSchema(env.DB);
  return json(await buildInsights(env.DB));
}

/* Returns a Response for /api/* paths, or null so the asset layer can run. */
export async function handleApi(request, env){
  const url = new URL(request.url);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  if (path !== '/api' && !path.startsWith('/api/')) return null;

  try {
    if (path === '/api/health')
      return json({ ok:true, now: new Date().toISOString(), storage: !!env.DB, engine:'prism-1' });

    if (path === '/api/market')    return request.method === 'GET'  ? market(env, url)   : fail(405, 'GET only');
    if (path === '/api/assess')    return request.method === 'POST' ? await assess(request, env) : fail(405, 'POST only');
    if (path === '/api/insights')  return request.method === 'GET'  ? await insights(env) : fail(405, 'GET only');
    if (path === '/api/battery')   return request.method === 'POST' ? await batteryAttempt(request, env) : fail(405, 'POST only');

    const m = path.match(/^\/api\/assess\/([^/]+)$/);
    if (m) return request.method === 'GET' ? await getAssess(env, m[1]) : fail(405, 'GET only');

    return fail(404, 'unknown endpoint');
  } catch (err){
    console.error('api error', path, err && err.stack ? err.stack : String(err));
    return fail(500, 'internal error');
  }
}
