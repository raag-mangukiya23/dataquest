/* ══════════════════════════════════════════════════════════════
   PRISM ENGINE — browser layer
   Pure algorithm lives in ./engine.js (shared with the Worker).
   This file owns the DOM: rendering, wiring, radar, backend sync.
   ══════════════════════════════════════════════════════════════ */

import { REGIONS, INTERESTS, TRAITS, PRIORITY, clamp, r1, runEngine } from './engine.js';
import { MOBILITY, TIERS } from './engine.js';
import { DOMAINS, APTITUDE, INVENTORY, STEPS, ITEM_TOTAL, scoreBattery } from './battery.js';

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ── 4. Rendering ──────────────────────────────────────────── */
const CIRC = 2 * Math.PI * 52;

function paintRing(pct){
  $('#fitarc').style.strokeDashoffset = String(CIRC * (1 - clamp(pct,0,100)/100));
}
function paintBar(id, pct){ $(id).style.width = clamp(pct,0,100) + '%'; }

function verdictText(r, input){
  const label = r.pci < 30 ? 'Low' : r.pci < 60 ? 'Moderate' : 'High';
  const pri = (PRIORITY[input.parent.priority] || PRIORITY.roi).label;
  const b = r.best;
  let s = `<b>Alignment verdict.</b> Under a <b>${pri.toLowerCase()}</b> lens with a household capacity of <b>Rs ${r1(r.capacity)} lakh</b>, the engine converges on <b>${b.c.name}</b> at a composite score of ${Math.round(b.composite)}/100. Parent–Student Conflict Index is <b>${label} (${r.pci})</b> at Spearman rho = ${r1(r.rho)}. `;
  if (r.pci >= 60) s += `The engine's recommendation is not the family's top preference — the roadmap below deliberately includes bridge options so the decision is negotiated with data instead of position.`;
  else if (r.pci >= 30) s += `The two rankings overlap substantially; expect negotiation mainly on risk appetite and payback horizon.`;
  else s += `Aptitude and family priorities already agree, so the roadmap can be optimised purely for depth and entrance timing.`;
  return s;
}

function whyLine(s, input){
  const parts = [`Trait alignment ${Math.round(s.fit)}/100`];
  parts.push(s.finGap > 0
    ? `Rs ${r1(s.finGap)}L beyond household capacity`
    : `fully fundable inside a Rs ${r1(input.parent.budget*0.30 + 1.5)}L capacity`);
  if (s.c.hyperlocal && input.hyperlocal) parts.push('strong hyper-local demand in your region');
  if (s.c.vol > 65) parts.push(`non-linear trajectory (volatility ${s.c.vol})`);
  return parts.join(' · ') + '.';
}

function render(r, input){
  paintRing(r.best.composite);
  $('#fitval').textContent   = Math.round(r.best.composite);
  $('#val-fin').textContent  = Math.round(r.best.fin);
  $('#val-risk').textContent = Math.round(r.best.riskAl);
  $('#val-mkt').textContent  = Math.round(r.best.mkt);
  $('#val-pci').textContent  = r.pci;
  paintBar('#bar-fin', r.best.fin);
  paintBar('#bar-risk', r.best.riskAl);
  paintBar('#bar-mkt', r.best.mkt);
  paintBar('#bar-pci', r.pci);
  $('#verdict').innerHTML = verdictText(r, input);

  $('#recs').innerHTML = r.top.map((s,i) => `
    <article class="rec" style="--c:${s.c.c};animation-delay:${i*90}ms">
      <div class="rec-top">
        <span class="rec-rank">#${i+1}</span>
        <span class="rec-name">${s.c.name}</span>
        <span class="rec-score">${Math.round(s.composite)}</span>
      </div>
      <div class="rec-meta">
        <span>fit ${Math.round(s.fit)}</span>
        <span>financial viability ${Math.round(s.fin)}</span>
        <span>risk alignment ${Math.round(s.riskAl)}</span>
        <span>market velocity ${Math.round(s.mkt)}</span>
        <span>Rs ${r1(s.c.cost)}L · ${s.c.years} yrs</span>
        <span>Rs ${r1(s.c.entry)} to ${r1(s.c.mid)} LPA</span>
        <span>payback multiple ${r1(s.roiScore/10)}x</span>
        ${s.interestMatch ? '<span>interest-aligned</span>' : ''}
      </div>
      <p class="rec-why">${whyLine(s, input)}</p>
      <div class="rec-track"><i style="width:${Math.round(s.composite)}%"></i></div>
    </article>`).join('');

  $('#gaps').innerHTML = r.gaps.map((g,i) =>
    `<li class="${g.warn ? '' : 'ok'}" style="animation-delay:${i*70}ms">${g.html}</li>`).join('');

  renderTimeline(r, input);
  renderActions(r, input);
  renderSWOT(r, input);
  renderCopilot(r, input);

  $('#why').innerHTML = r.audit ? `
    <h5>Pipeline audit trail</h5>
    <ol>${r.audit.map(x => `<li>${x}</li>`).join('')}</ol>` : `
    <h5>Pipeline audit trail</h5>
    <ol>
      <li>Ingested 5 psychometric dimensions and 3 family parameters; declared interest = <b>${input.student.interest}</b>.</li>
      <li>Normalised trait vectors and applied cosine similarity against 15 career ideal vectors for the fit layer.</li>
      <li>Financial Constraint Solver projected Rs ${r1(r.capacity)}L household capacity against programme cost over the full degree horizon.</li>
      <li>Risk alignment compared each career volatility index with household risk appetite (${input.parent.risk}).</li>
      <li>Market layer blended geographic demand for <b>${REGIONS.find(x => x[0] === input.region)[1]}</b>${input.hyperlocal ? ' with a hyper-local innovation bias' : ''}.</li>
      <li>Parent–Student Conflict Index = (1 − rho)/2 from Spearman rank correlation of aptitude vs family preference (rho = ${r1(r.rho)}).</li>
      <li>Composite = <b>0.36·fit + 0.24·financial + 0.14·risk + 0.26·market</b>, penalised by the yield floor.</li>
    </ol>`;

  radar = radarDatasets(r, input);
  if (window.PRISM_MOTION && window.PRISM_MOTION.morphRadar)
    window.PRISM_MOTION.morphRadar(radar, drawRadar);   // tweened by motion.js
  else
    drawRadar(radar);
}

/* ── 5. Radar visualisation ────────────────────────────────── */
let radar = null;

function radarDatasets(r, input){
  const keys = TRAITS.map(t => t[0]);
  const student = keys.map(k => input.student[k]);
  student.push(clamp(input.parent.budget * 1.05, 0, 100));
  const top = r.top, wsum = top.reduce((a,s) => a + s.mkt, 0) || 1;
  const mkt = keys.map(k => top.reduce((a,s) => a + s.c.v[k] * s.mkt, 0) / wsum);
  mkt.push(r.best.fin);
  // Parent expectation overlay — same six axes so the two polygons are comparable.
  const parent = (r.parentVec || keys.map(k => input.student[k])).slice();
  parent.push(clamp(input.parent.budget * 1.05 + (input.parent.minpay - 6) * 3, 0, 100));
  return { labels:['Logic','Creativity','Communication','Build','Science','Financial headroom'],
           student, mkt, parent };
}

function drawRadar(data){
  const cv = $('#radar');
  if (!cv || !data) return;
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;   // environment without canvas support
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth || 640, H = Math.round(W * 0.58);
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const n = data.labels.length;
  const cx = W/2, cy = H/2 + 4, R = Math.min(W * .30, H * .40);

  ctx.strokeStyle = 'rgba(255,255,255,.09)';
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring++){
    ctx.beginPath();
    for (let i = 0; i <= n; i++){
      const a = -Math.PI/2 + i*2*Math.PI/n, rad = R * ring/4;
      const x = cx + Math.cos(a)*rad, y = cy + Math.sin(a)*rad;
      i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
    }
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i <= n; i++){
    const a = -Math.PI/2 + i*2*Math.PI/n;
    ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a)*R, cy + Math.sin(a)*R);
  }
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.stroke();

  function poly(vals, stroke, fill){
    ctx.beginPath();
    vals.forEach((v,i) => {
      const a = -Math.PI/2 + i*2*Math.PI/n;
      const rad = R * clamp(v,0,100)/100;
      const x = cx + Math.cos(a)*rad, y = cy + Math.sin(a)*rad;
      i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
    });
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
  }
  // The disagreement the Conflict Index measures, drawn as a visible band:
  // wherever the parent polygon sits outside the student's, it shades amber.
  if (data.parent && data.parent.length === n){
    for (let i = 0; i < n; i++){
      const j = (i + 1) % n;
      const a1 = -Math.PI/2 + i*2*Math.PI/n, a2 = -Math.PI/2 + j*2*Math.PI/n;
      const rp = R * clamp(data.parent[i],0,100)/100, rp2 = R * clamp(data.parent[j],0,100)/100;
      const rs = R * clamp(data.student[i],0,100)/100, rs2 = R * clamp(data.student[j],0,100)/100;
      const hi = Math.max(rp, rp2, rs, rs2), lo = Math.min(rp, rp2, rs, rs2);
      if (hi - lo < 2) continue;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a1)*rp,  cy + Math.sin(a1)*rp);
      ctx.lineTo(cx + Math.cos(a2)*rp2, cy + Math.sin(a2)*rp2);
      ctx.lineTo(cx + Math.cos(a2)*rs2, cy + Math.sin(a2)*rs2);
      ctx.lineTo(cx + Math.cos(a1)*rs,  cy + Math.sin(a1)*rs);
      ctx.closePath();
      ctx.fillStyle = 'rgba(251,191,36,.17)'; ctx.fill();
    }
    poly(data.parent, '#f472b6', 'rgba(244,114,182,.13)');
  }
  poly(data.mkt, '#22d3ee', 'rgba(34,211,238,.16)');
  poly(data.student, '#7c5cff', 'rgba(124,92,255,.30)');

  data.student.forEach((v,i) => {
    const a = -Math.PI/2 + i*2*Math.PI/n, rad = R * clamp(v,0,100)/100;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a)*rad, cy + Math.sin(a)*rad, 3.6, 0, Math.PI*2);
    ctx.fillStyle = '#c4b5fd'; ctx.fill();
  });

  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  data.labels.forEach((l,i) => {
    const a = -Math.PI/2 + i*2*Math.PI/n;
    ctx.fillStyle = 'rgba(154,160,189,.95)';
    ctx.fillText(l.toUpperCase(), cx + Math.cos(a)*(R+26), cy + Math.sin(a)*(R+22));
  });
}

/* ── 6. Wiring ─────────────────────────────────────────────── */
function fillSelects(){
  const iSel = $('#in-interest');
  iSel.innerHTML = INTERESTS.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
  iSel.value = 'computing';
  const rSel = $('#in-region');
  rSel.innerHTML = REGIONS.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
  rSel.value = 'chennai';
  $('#in-tier').innerHTML = TIERS.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
  $('#in-tier').value = 'tier2';
  $('#in-mobility').innerHTML = MOBILITY.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
  $('#in-mobility').value = 'hyperlocal';
}

function readInput(){
  const student = { interest: $('#in-interest').value };
  $$('[data-sliders="student"] input[type=range]')
    .forEach(i => student[i.dataset.key] = +i.value);
  const parent = {
    priority: $('#in-priority').value,
    firstGen: $('#in-firstgen').checked,
    mobility: $('#in-mobility').value,
    tier:     $('#in-tier').value
  };
  $$('[data-sliders="parent"] input[type=range]')
    .forEach(i => parent[i.dataset.key] = +i.value);
  return {
    student, parent,
    region: $('#in-region').value,
    scholarship: $('#in-scholarship').checked,
    hyperlocal: $('#in-hyperlocal').checked
  };
}

function wireSliders(){
  $$('input[type=range]').forEach(inp => {
    const out = document.querySelector(`[data-out="${inp.dataset.key}"]`);
    const sync = () => {
      const pct = (inp.value - inp.min) / (inp.max - inp.min) * 100;
      inp.style.setProperty('--p', pct + '%');
      if (out) out.textContent = inp.value;
    };
    inp.addEventListener('input', () => { sync(); run(); });
    sync();
  });
}

let lastResult = null;
function run(opts){
  const input = readInput();
  const result = runEngine(input);
  lastResult = { r: result, input };
  render(result, input);                              // instant local preview (also the offline fallback)
  if (opts && opts.persist) void persistRun(input);   // explicit save only
  else scheduleRemoteScore(input);                    // PRISM backend engine replaces the preview
}

/* The PRISM backend engine (51 careers, financial solver, scholarships, conflict index) scores every
   view. Slider drags are debounced and never saved; a stale reply is ignored. */
let remoteTimer = null, remoteSeq = 0;
function showRemote(result, input){
  lastResult = { r: result, input };
  render(result, input);
}
function scheduleRemoteScore(input){
  clearTimeout(remoteTimer);
  const seq = ++remoteSeq;
  remoteTimer = setTimeout(async () => {
    try {
      const data = await apiPost('/score', input);
      if (seq !== remoteSeq || !data || !data.result) return;
      showRemote(data.result, input);
      setStatus('Scored by the PRISM engine · ' + (data.result.datasetVersion || 'live data') + '.', 'ok');
    } catch (err){
      if (seq === remoteSeq) setStatus('Scored locally · PRISM engine unreachable (' + err.message + ').', 'warn');
    }
  }, 350);
}

let booted = false;
function boot(){
  if (booted) return;          // idempotent: a second DOMContentLoaded must not double-init
  booted = true;
  fillSelects();
  wireSliders();
  wireShare();
  ['#in-interest','#in-priority','#in-region','#in-scholarship','#in-hyperlocal']
    .forEach(s => $(s).addEventListener('change', run));
  $('#run').addEventListener('click', () => {
    run({persist:true});
    const out = $('#sim-out');
    if (out.animate)
      out.animate([{opacity:.35, transform:'translateY(10px)'}, {opacity:1, transform:'none'}],
                  {duration:420, easing:'cubic-bezier(.22,1,.36,1)'});
  });
  // scroll reveals
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, {threshold:.12, rootMargin:'0px 0px -40px 0px'});
  $$('.reveal').forEach(el => io.observe(el));

  // nav behaviour
  const nav = $('#nav');
  addEventListener('scroll', () => nav.classList.toggle('stuck', window.scrollY > 12), {passive:true});
  $('#burger').addEventListener('click', () => nav.classList.toggle('open'));
  $$('.nav-links a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));

  // animated counters — motion.js replaces these with rolling digits when present
  if (!window.PRISM_MOTION_ODOMETER){
  const cio = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target, target = +el.dataset.count, suf = el.dataset.suffix || '';
      const t0 = performance.now(), dur = 1300;
      const tick = now => {
        const p = Math.min(1, (now - t0)/dur);
        el.textContent = Math.round(target * (1 - Math.pow(1-p, 3))) + suf;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      cio.unobserve(el);
    });
  }, {threshold:.6});
  $$('[data-count]').forEach(el => cio.observe(el));
  }

  // A ?r=<id> link rehydrates a roadmap saved by the engine; otherwise fresh.
  const shared = new URLSearchParams(location.search).get('r');
  if (shared) void hydrateShared(shared); else run();

  initBattery();
  renderAB();
  $('#ab-reset').addEventListener('click', () => { for (const k of Object.keys(abState)) delete abState[k]; renderAB(); });
  startAtlas();
  wireExports();
  wireI18n();
  wireAdmin();

  void loadInsights();

  let rt;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => drawRadar(radar), 160);
  });
}

/* ── 7. Backend sync ───────────────────────────────────────── */
/* Scoring stays instant and local; persistence is a separate, explicit act.
   Slider drags never hit the network — only "Synthesise Roadmap" saves a run,
   so the market-intelligence index records deliberate decisions, not noise. */

async function apiFetch(path, init){
  const res = await fetch('/api' + path, init);
  if (!res.ok){
    let reason = 'HTTP ' + res.status;
    try { const j = await res.json(); if (j && j.error) reason = j.error; } catch { /* keep status */ }
    const err = new Error(reason); err.status = res.status; throw err;
  }
  return res.json();
}
const apiGet  = path => apiFetch(path, { headers: { accept: 'application/json' } });
const apiPost = (path, body) => apiFetch(path, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
});

const esc = s => String(s).replace(/[&<>"']/g, ch => (
  { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));

function setStatus(text, state){
  const el = $('#api-status');
  if (!el) return;
  el.textContent = text;
  el.dataset.state = state || '';
}

function shareUrl(id){
  const u = new URL(location.href);
  u.search = '?r=' + id;
  u.hash = '#simulator';
  return u.toString();
}

function offerShareLink(id){
  const btn = $('#share-link');
  if (!btn) return;
  btn.hidden = false;
  btn.dataset.url = shareUrl(id);
  try { history.replaceState(null, '', shareUrl(id)); } catch { /* file:// or blocked */ }
}

async function persistRun(input){
  setStatus('Syncing this run to the engine index…', 'busy');
  try {
    const saved = await apiPost('/assess', input);
    remoteSeq++;                                       // a saved run supersedes any pending preview
    if (saved.result) showRemote(saved.result, input);
    if (!saved.persisted){
      setStatus('Scored locally · engine index not attached to this environment.', 'warn');
      return;
    }
    setStatus('Saved to the engine index · shareable roadmap link ready.', 'ok');
    offerShareLink(saved.id);
  } catch (err){
    setStatus('Scored locally · engine index unreachable (' + err.message + ').', 'warn');
  }
}

/* Rehydrate a stored input into the actual form controls. */
function applyInput(input){
  if (!input || !input.student || !input.parent) return;
  const set = (sel, v) => { const el = $(sel); if (el) el.value = v; };
  set('#in-interest', input.student.interest);
  for (const k of TRAITS.map(t => t[0])) set('#in-' + k, input.student[k]);
  set('#in-priority',  input.parent.priority);
  set('#in-budget',    input.parent.budget);
  set('#in-risk',      input.parent.risk);
  set('#in-minpay',    input.parent.minpay);
  set('#in-mobility',  input.parent.mobility || 'hyperlocal');
  set('#in-tier',      input.parent.tier     || 'tier2');
  const fg = $('#in-firstgen'); if (fg) fg.checked = input.parent.firstGen === true;
  set('#in-region',    input.region);
  const sc = $('#in-scholarship'); if (sc) sc.checked = !!input.scholarship;
  const hl = $('#in-hyperlocal');  if (hl) hl.checked = !!input.hyperlocal;

  $$('input[type=range]').forEach(inp => {
    const pct = (inp.value - inp.min) / (inp.max - inp.min) * 100;
    inp.style.setProperty('--p', pct + '%');
    const out = document.querySelector('[data-out="' + inp.dataset.key + '"]');
    if (out) out.textContent = inp.value;
  });
}

async function hydrateShared(id){
  setStatus('Rehydrating a shared roadmap…', 'busy');
  try {
    const data = await apiGet('/assess/' + encodeURIComponent(id));
    applyInput(data.input);
    render(data.result, data.input);
    setStatus('Shared roadmap rehydrated from the engine index.', 'ok');
    $('#sim-out') && $('#sim-out').classList.add('from-share');
    const note = $('#shared-note');
    if (note){
      note.hidden = false;
      note.innerHTML = 'Viewing a roadmap saved on ' +
        esc(new Date(data.createdAt).toLocaleString()) +
        '. <button type="button" class="linkish" id="shared-reset">Start a fresh profile</button>';
      const reset = $('#shared-reset');
      if (reset) reset.addEventListener('click', () => {
        note.hidden = true;
        try { history.replaceState(null, '', location.pathname + '#simulator'); } catch { /* noop */ }
        run();
      });
    }
  } catch (err){
    setStatus('That shared roadmap was not found — showing a fresh profile.', 'warn');
    run();
  }
}

/* ── market intelligence from the aggregate index ──────────── */
function bars(items, labelKey, valueKey, unit){
  const top = items.slice(0, 6);
  const max = top.reduce((m, x) => Math.max(m, x[valueKey] || 0), 0) || 1;
  return top.map((x, i) => `
    <div class="intel-row" style="--w:${Math.round((x[valueKey] || 0) / max * 100)}%;--i:${i}">
      <span>${esc(x[labelKey])}</span>
      <div class="intel-track"><i></i></div>
      <b>${x[valueKey]}${unit || ''}</b>
    </div>`).join('');
}

function renderInsights(d){
  const root = $('#intel');
  if (!root) return;
  const empty = $('#intel-empty');
  const body  = $('#intel-body');
  const bat   = (d && d.battery) || null;
  const live  = !d || !d.ok || (!d.total && !(bat && bat.attempts));
  if (empty) empty.hidden = !live;
  if (body)  body.hidden  = live;
  if (live)  return;

  root.querySelector('#intel-total').textContent     = d.total;
  root.querySelector('#intel-composite').textContent = d.avgComposite;
  root.querySelector('#intel-pci').textContent       = d.avgPci;
  root.querySelector('#intel-strain').textContent    = d.affordabilityStrainRate + '%';

  const batTotal = root.querySelector('#intel-battery');
  if (batTotal) batTotal.textContent = bat ? bat.attempts : 0;
  const batDomains = root.querySelector('#intel-battery-domains');
  if (batDomains){
    if (!bat || !bat.attempts){
      batDomains.innerHTML = '<p class="intel-none">No aptitude sittings yet. Complete the battery to contribute the first measured profile.</p>';
    } else {
      batDomains.innerHTML = bars(
        DOMAINS.map(x => ({ name: x.label, count: (bat.byDomain && bat.byDomain[x.key]) || 0 })),
        'name', 'count'
      );
    }
  }

  const r = root.querySelector('#intel-regions');
  const c = root.querySelector('#intel-careers');
  if (r) r.innerHTML = bars(d.byRegion, 'label', 'count');
  if (c) c.innerHTML = bars(d.topCareers, 'name', 'count');

  const recent = root.querySelector('#intel-recent');
  if (recent) recent.innerHTML = d.recent.slice(0, 6).map(x => `
    <li><a href="?r=${esc(x.id)}#simulator">
      <span>${esc(x.region)}</span><b>${esc(x.career)}</b>
      <em>${x.composite}</em></a></li>`).join('');
}

async function loadInsights(){
  const root = $('#intel');
  if (!root) return;
  try { renderInsights(await apiGet('/insights')); }
  catch { renderInsights(null); }
}

function wireShare(){
  const btn = $('#share-link');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const url = btn.dataset.url || location.href;
    const label = btn.textContent;
    try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; }
    catch { btn.textContent = 'Copy failed — link is in the address bar'; }
    setTimeout(() => { btn.textContent = label; }, 2200);
    try { history.replaceState(null, '', url); } catch { /* noop */ }
  });
}

/* ── 7b. Derived components: timeline, actions, SWOT, co-pilot ── */

function renderTimeline(r, input){
  const el = $('#timeline'); if (!el) return;
  const b = r.best.c;
  const recover = b.years + Math.max(1, Math.round(Math.max(0, input.parent.minpay - b.entry) / 1.6));
  const phases = [
    { n:1, t:'Foundation & entrance prep', w:'Grades 11–12',
      p:`Target the entrance set for <b>${b.name}</b> while building the reasoning depth the fit layer scored you on.`,
      chips:b.exams.slice(0,3) },
    { n:2, t:'Funding & scholarship window', w:'Apply in class 12',
      p: input.scholarship
        ? `Lock the money before the seat. Capacity is <b>Rs ${r1(r.capacity)}L</b> against a programme cost of <b>Rs ${r1(b.cost)}L</b>${b.cost > r.capacity ? ' — funding is not optional here' : ', so this is about protecting the cushion'}.`
        : `Scholarship discovery is switched off for this run. Turn it on to see what <b>Rs ${r1(Math.max(0, b.cost - r.capacity))}L</b> of gap could be closed.`,
      chips: input.scholarship ? b.funds.slice(0,3) : ['Turn on scholarship discovery'] },
    { n:3, t:'Undergraduate & experiential STEAM', w:`${b.years} years`,
      p:`${b.name} track. Experiential projects in the <b>${REGIONS.find(x => x[0] === input.region)[1]}</b> corridor matter more than grades alone from year 2.`,
      chips:[`${b.domain} portfolio`, 'Internship by year 2'] },
    { n:4, t:'Career entry & payback', w:`Year ${b.years + 1} onward`,
      p:`Expected starting yield <b>Rs ${r1(b.entry)} LPA</b>, mid-career <b>Rs ${r1(b.mid)} LPA</b>. At the family's floor of Rs ${r1(input.parent.minpay)} LPA the debt recovery window closes in about <b>${recover} years</b>.`,
      chips:[`Rs ${r1(b.entry)} LPA entry`, `~${recover} yr payback`] }
  ];
  el.innerHTML = phases.map(x => `<li data-n="${x.n}">
      <h5>${x.t}<span class="tl-when">${x.w}</span></h5>
      <p>${x.p}</p>
      <div class="tl-chips">${x.chips.map(c => `<span class="tl-chip">${esc(c)}</span>`).join('')}</div>
    </li>`).join('');
}

function renderActions(r, input){
  const el = $('#action-list'); if (!el) return;
  const d = r.best.c.domain, region = REGIONS.find(x => x[0] === input.region)[1].split('·')[0].trim();
  const acts = [
    `Start a <b>GitHub repository</b> for a ${d} project and push one commit this week — portfolio depth beats marks from year 2.`,
    input.scholarship
      ? `Register for the <b>next ${region} buildathon or hackathon</b> in the ${d} track; regional winners feed directly into state merit-aid shortlists.`
      : `Turn on <b>scholarship discovery</b> in the Family Parameters panel and re-run — the solver is currently ignoring aid.`,
    r.best.finGap > 0
      ? `The plan is <b>Rs ${r1(r.best.finGap)}L short</b>. Draft the education-loan structure or shortlist the funded pathway variants listed above before entrance season.`
      : `Book a <b>30-minute conversation with your parents</b> using the WhatsApp report below — the Conflict Index is ${r.pci}, so the data does the negotiating.`
  ];
  el.innerHTML = acts.map(x => `<li>${x}</li>`).join('');
}

function renderSWOT(r, input){
  const t = input.student, b = r.best.c, p = input.parent;
  const S = [], W = [], O = [], T = [];
  const top2 = [...TRAITS].sort((x,y) => t[y[0]] - t[x[0]]).slice(0,2);
  const low2 = [...TRAITS].sort((x,y) => t[x[0]] - t[y[0]]).slice(0,2);
  top2.forEach(([k,l]) => S.push(`<li><b>${l} ${t[k]}</b> — the strongest axis of your vector${t[k] >= b.v[k] ? `, already above what ${b.name} asks for` : `, and ${b.name} wants ${b.v[k]}`}</li>`));
  low2.forEach(([k,l]) => W.push(`<li><b>${l} ${t[k]}</b>${t[k] < b.v[k] - 12 ? ` — below the ${b.v[k]} this domain expects` : ' — workable, but the thinnest part of the vector'}.</li>`));
  O.push(`<li><b>${REGIONS.find(x => x[0] === input.region)[1]}</b> — market velocity ${Math.round(r.best.mkt)}/100 for this domain.</li>`);
  if (p.mobility && p.mobility !== 'hyperlocal') O.push(`<li>Willing to relocate <b>${({intrastate:'intra-state',panindia:'pan-India',global:'globally'})[p.mobility]}</b> — widens the demand pool the solver is allowed to draw from.</li>`);
  if (input.hyperlocal) O.push(`<li>Hyper-local innovation bias is on, so cluster expansion in your own corridor is scored first.</li>`);
  T.push(b.finGap > 0
    ? `<li><b>Affordability strain of Rs ${r1(b.finGap)}L</b> — programme cost exceeds household capacity.</li>`
    : `<li>Cost is covered today at <b>Rs ${r1(r.capacity)}L</b> capacity, but a fee revision would eat the cushion.</li>`);
  T.push(`<li>Yield floor of <b>Rs ${r1(p.minpay)} LPA</b> shortens the payback window the roadmap must fit inside.</li>`);
  if (p.tier === 'tier3') T.push(`<li>Tier-3 base — <b>lower liquidity and thinner local placement pipelines</b>, priced into the solver.</li>`);
  if (r.pci >= 45) T.push(`<li>Parent–Student Conflict Index <b>${r.pci}</b> — the family ranking is diverging from yours.</li>`);
  const put = (id, arr) => { const el = $(id); if (el) el.querySelector('ul').innerHTML = arr.slice(0,3).join('') || '<li>Nothing material detected.</li>'; };
  put('#swot-s', S); put('#swot-w', W); put('#swot-o', O); put('#swot-t', T);
}

function renderCopilot(r, input){
  const el = $('#copilot'), body = $('#copilot-body');
  if (!el || !body) return;
  const b = r.best.c, t = input.student, p = input.parent;
  const reg = REGIONS.find(x => x[0] === input.region)[1].split('·')[0].trim();
  const strong = [...TRAITS].sort((x,y) => t[y[0]] - t[x[0]])[0][1].toLowerCase();
  const bits = [];
  bits.push(`Your <b>${strong} disposition</b> is what carries you toward <b>${b.name}</b>.`);
  bits.push(input.hyperlocal && b.hyperlocal
    ? `That lines up with the <b>${reg}</b> corridor, which is exactly where this cluster is expanding.`
    : `Demand for it in <b>${reg}</b> scores ${Math.round(r.best.mkt)}/100${p.mobility === 'hyperlocal' ? ', and staying hyper-local caps the upside' : ''}.`);
  if (b.finGap > 0) bits.push(`But it costs <b>Rs ${r1(b.finGap)}L more</b> than your household capacity, so the roadmap below stages a funded bridge first.`);
  else if (p.minpay > b.entry) bits.push(`Because your family needs <b>Rs ${r1(p.minpay)} LPA</b> and this starts at <b>Rs ${r1(b.entry)} LPA</b>, expect roughly <b>${b.years + Math.max(1, Math.round((p.minpay - b.entry)/1.6))} years</b> to break even — the diploma-first variant exists for exactly that.`);
  else bits.push(`At <b>Rs ${r1(b.entry)} LPA</b> starting yield it clears your family's floor immediately, so the constraint here is aptitude depth, not money.`);
  if (r.pci >= 60) bits.push(`The Conflict Index is <b>high (${r.pci})</b> — the parent overlay on the radar is pulled well away from yours, so take the bridge options into the conversation.`);
  else if (r.pci <= 25) bits.push(`Conflict Index is <b>low (${r.pci})</b>: the parent overlay sits close to your vector, so this is a negotiation you have already won.`);
  body.innerHTML = bits.join(' ');
  el.dataset.state = 'ok';
}

/* ── 7c. Hyper-local demand atlas (no API key, no network) ──── */
const INDIA = [[68.2,23.7],[70,20.7],[72.6,21],[72.9,19.1],[73.5,15.9],[74.8,12.9],[76,9.5],
  [77.5,8.1],[79.8,10.3],[80.3,13.1],[82.3,16.8],[85,19.1],[87,21.5],[88.2,21.7],[89.4,21.8],
  [89.7,25.3],[92,27.5],[95,27.5],[95.5,26],[93.5,24],[92.5,22],[92.2,23.7],[90,25],[88,24.3],
  [88.1,26.3],[85,27],[81,30.2],[79,31.5],[78,32.5],[76,34.5],[74.5,34.8],[74,33],[73.9,31],
  [71,27.8],[68.8,24.3]];
const CLUSTERS = [
  [77.59,12.97,0,88,'Bengaluru · deep-tech'],[80.27,13.08,0,84,'Chennai · semiconductor & EV'],
  [78.48,17.38,3,82,'Hyderabad · genome valley'],[73.86,18.52,1,80,'Pune · auto & manufacturing'],
  [72.88,19.08,0,76,'Mumbai · fintech'],[76.96,11.02,1,72,'Coimbatore · Kongu belt'],
  [77.10,28.60,0,79,'Delhi NCR · software'],[72.57,23.02,1,66,'Ahmedabad · manufacturing'],
  [88.36,22.57,1,68,'Kolkata · industry'],[79.09,21.15,1,64,'Nagpur · MIHAN corridor'],
  [78.12,9.93,2,60,'Madurai · agri-tech'],[85.82,20.30,1,58,'Bhubaneswar · manufacturing'],
  [75.86,30.90,1,54,'Ludhiana · engineering'],[91.74,26.14,2,50,'Guwahati · food systems'],
  [76.27,9.93,2,56,'Kochi · agri & health']
];
const CAT_C = ['#7c5cff','#34d399','#fbbf24','#22d3ee'];
let atlasT0 = 0, atlasRAF = 0;

function drawAtlas(now){
  const cv = $('#atlas'); if (!cv) return;
  const ctx = cv.getContext && cv.getContext('2d'); if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth || 620, H = Math.round(W * 440/620);
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,W,H);
  const mx = lon => 18 + (lon - 67.8) / (96.5 - 67.8) * (W - 36);
  const my = lat => 16 + (37.6 - lat) / (37.6 - 7.6) * (H - 32);
  const t = ((now || 0) - atlasT0) / 1000;

  ctx.beginPath();
  INDIA.forEach(([lo,la],i) => { const x = mx(lo), y = my(la); i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); });
  ctx.closePath();
  ctx.fillStyle = 'rgba(124,92,255,.07)'; ctx.fill();
  ctx.strokeStyle = 'rgba(167,139,250,.55)'; ctx.lineWidth = 1.4; ctx.stroke();

  CLUSTERS.forEach(([lo,la,cat,dem,label]) => {
    const x = mx(lo), y = my(la), c = CAT_C[cat];
    const pulse = 1 + Math.sin(t*2.1 + lo) * .16;
    const rad = (6 + dem/7) * pulse;
    if (typeof ctx.createRadialGradient === 'function'){
      const g = ctx.createRadialGradient(x,y,0,x,y,rad);
      g.addColorStop(0, c + 'cc'); g.addColorStop(.45, c + '44'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
    } else ctx.fillStyle = c + '55';
    ctx.beginPath(); ctx.arc(x,y,rad,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x,y,2.6,0,Math.PI*2); ctx.fill();
    if (dem >= 72){
      ctx.font = '500 10px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(234,234,245,.82)'; ctx.fillText(label.split('·')[1] || label, x + 8, y + 3);
    }
  });
  ctx.font = '500 10px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(111,118,153,.9)';
  ctx.fillText('Bubble size = demand index for that cluster', 14, H - 12);
}

function startAtlas(){
  const cv = $('#atlas'); if (!cv) return;
  atlasT0 = performance.now();
  let last = 0, visible = true;
  if ('IntersectionObserver' in window)
    new IntersectionObserver(e => { visible = e[0].isIntersecting; }).observe(cv);
  const loop = now => {
    atlasRAF = requestAnimationFrame(loop);
    if (!visible || document.hidden || now - last < 50) return;
    last = now; drawAtlas(now);
  };
  atlasRAF = requestAnimationFrame(loop);
  addEventListener('resize', () => drawAtlas(performance.now()), { passive:true });
}

/* ── 7d. Export, i18n and the B2B view ─────────────────────── */
function reportText(r, input){
  const b = r.best.c;
  return [
    'PRISM ENGINE — Career Roadmap',
    'Student: ' + INTERESTS.find(x => x[0] === input.student.interest)[1],
    'Region: ' + REGIONS.find(x => x[0] === input.region)[1],
    '',
    'Top recommendation: ' + b.name,
    'Composite fit: ' + Math.round(r.best.composite) + '/100',
    'Programme cost: Rs ' + r1(b.cost) + 'L over ' + b.years + ' years',
    'Household capacity: Rs ' + r1(r.capacity) + 'L' + (r.best.finGap > 0 ? ' (gap Rs ' + r1(r.best.finGap) + 'L)' : ' (affordable)'),
    'Expected starting yield: Rs ' + r1(b.entry) + ' LPA (family floor Rs ' + r1(input.parent.minpay) + ' LPA)',
    'Parent-Student Conflict Index: ' + r.pci + '/100',
    'Entrance exams: ' + b.exams.slice(0,3).join(', '),
    input.scholarship ? 'Funding routes: ' + b.funds.slice(0,3).join(', ') : 'Funding routes: scholarship discovery is OFF',
    '',
    'Alternative pathways: ' + r.top.slice(1).map(x => x.c.name).join(', '),
    '',
    'Scores are indicative of the algorithm, not final guidance.'
  ].join('\n');
}

async function wireExports(){
  const wa = $('#wa-export');
  if (wa) wa.addEventListener('click', () => {
    if (!lastResult) return;
    const txt = reportText(lastResult.r, lastResult.input);
    open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
  });
  const cp = $('#copy-report');
  if (cp) cp.addEventListener('click', async () => {
    if (!lastResult) return;
    const txt = reportText(lastResult.r, lastResult.input);
    try { await navigator.clipboard.writeText(txt); cp.textContent = 'Report copied'; }
    catch { cp.textContent = 'Clipboard blocked'; }
    setTimeout(() => { cp.textContent = 'Copy plain-text report'; }, 2000);
  });
}

const I18N = {
  ta:{ 'Run the engine on a <span class="grad">live student profile</span>':
         '<span class="grad">நேரடி மாணவர் சுயவிவரத்தில்</span> இயந்திரத்தை இயக்கவும்',
       'Every parameter the engine judges, <span class="grad">actually measured</span>':
         'இயந்திரம் மதிப்பிடும் ஒவ்வொரு அளவுருவும் <span class="grad">உண்மையில் அளவிடப்படுகிறது</span>',
       'Educational &amp; financial roadmap timeline':'கல்வி மற்றும் நிதி வழிச்சாலை காலவரிசை',
       'Take action today':'இன்றே நடவடிக்கை எடுங்கள்' },
  hi:{ 'Run the engine on a <span class="grad">live student profile</span>':
         '<span class="grad">लाइव छात्र प्रोफ़ाइल</span> पर इंजन चलाएँ',
       'Every parameter the engine judges, <span class="grad">actually measured</span>':
         'इंजन जिन मापदंडों पर निर्णय लेता है, वे सभी <span class="grad">वास्तव में मापे जाते हैं</span>',
       'Educational &amp; financial roadmap timeline':'शैक्षिक एवं वित्तीय रोडमैप टाइमलाइन',
       'Take action today':'आज ही कदम उठाएँ' }
};
function wireI18n(){
  const sel = $('#lang'); if (!sel) return;
  sel.addEventListener('change', () => {
    const dict = I18N[sel.value] || {};
    $$('[data-i18n]').forEach(el => {
      if (!el.dataset.orig) el.dataset.orig = el.innerHTML;
      el.innerHTML = dict[el.dataset.orig] || el.dataset.orig;
    });
  });
}

const COHORT = [
  ['Robotics & Industrial Automation','Tier-3 barriers · 12 students',38],
  ['Applied AI & Data Science','High aptitude · funding gap',31],
  ['Agri-Tech & Precision Farming','Local cluster demand · 9 students',24],
  ['VLSI & Semiconductor Design','Metro relocation required',17]
];
function wireAdmin(){
  const tg = $('#admin-toggle'); if (!tg) return;
  const rows = $('#admin-rows');
  if (rows) rows.innerHTML = COHORT.map(([n, note, share]) =>
    `<div class="admin-row"><b>${esc(n)}</b><span>${esc(note)}</span><em>${share}% of cohort</em></div>`).join('');
  const setView = admin => {
    $('#simulator').hidden = admin;
    $('#battery').hidden = admin;
    $('#admin').hidden = !admin;
    $('#intel').hidden = admin;
  };
  tg.addEventListener('change', () => setView(tg.checked));
  const back = $('#back-to-student');
  if (back) back.addEventListener('click', () => { tg.checked = false; setView(false); location.hash = '#top'; });
}

/* ── 7e. A/B quick-read intake ─────────────────────────────── */
const AB_QS = [
  ['Would you rather…','Build a software project and push it to GitHub','Analyse a financial spreadsheet until it balances','hands','logic',60,64],
  ['Which feels more like you?','Sketching how a machine should move','Arguing a case until the room agrees','hands','comm',58,62],
  ['Pick a weekend','Take apart something that already works','Run an experiment to test an idea','hands','sci',55,60],
  ['Which problem pulls you?','Making something clunky feel effortless','Proving why an explanation is wrong','creative','logic',57,63],
  ['In a team you are the one who…','Explains the idea so everyone gets it','Works out whether it can actually be built','comm','sci',56,61]
];
const abState = {};
function renderAB(){
  const stage = $('#ab-stage'); if (!stage) return;
  const remaining = AB_QS.filter((q,i) => abState[i] === undefined);
  const list = remaining.length ? remaining : AB_QS.slice(-1);
  stage.innerHTML = list.map(q => {
    const i = AB_QS.indexOf(q);
    return `<div class="ab-q">
      <button type="button" class="ab-opt" data-i="${i}" data-side="0" aria-checked="${abState[i]===0}">
        <span class="ab-tag">A</span>${esc(q[1])}</button>
      <span class="ab-or">or</span>
      <button type="button" class="ab-opt" data-i="${i}" data-side="1" aria-checked="${abState[i]===1}">
        <span class="ab-tag">B</span>${esc(q[2])}</button>
    </div>`;
  }).join('');
  stage.querySelectorAll('.ab-opt').forEach(btn => btn.addEventListener('click', () => {
    const i = +btn.dataset.i, side = +btn.dataset.side, q = AB_QS[i];
    abState[i] = side;
    const trait = side === 0 ? q[3] : q[4], delta = side === 0 ? q[5] : q[6];
    const sl = $('#in-' + trait);
    if (sl){ sl.value = clamp(Math.round((+sl.value + delta) / 2), 0, 100); sl.dispatchEvent(new Event('input', { bubbles:true })); }
    const done = Object.keys(abState).length;
    const fill = $('#ab-fill'); if (fill) fill.style.width = Math.round(done / AB_QS.length * 100) + '%';
    renderAB();
  }));
  const fill = $('#ab-fill');
  if (fill) fill.style.width = Math.round(Object.keys(abState).length / AB_QS.length * 100) + '%';
}

/* ── 8. Aptitude battery ───────────────────────────────────── */
/* Measures every parameter the engine consumes with graded items,
   then writes the result back into the simulator controls, so the
   roadmap is driven by evidence instead of self-rating. */

const batAnswers = {};
let batStep = 0;

/* scrollIntoView is universally available in browsers but not in every
   DOM shim, and a missing API must never break the sitting. */
const scrollTo = (el, block) => {
  if (el && typeof el.scrollIntoView === 'function')
    try { el.scrollIntoView({ behavior:'smooth', block: block || 'start' }); } catch { /* noop */ }
};

const labelOf = (list, key) => {
  const hit = list.find(row => row[0] === key);
  return hit ? hit[1] : key;
};
const priorityLabel = key => (PRIORITY[key] ? PRIORITY[key].label : key);

function countAnswered(){
  let n = 0;
  for (const it of APTITUDE) if (typeof batAnswers[it.id] === 'number') n++;
  for (const g of INVENTORY) for (const it of g.items) if (typeof batAnswers[it.id] === 'number') n++;
  return n;
}
const stepAnswered = st => st.items.every(it => typeof batAnswers[it.id] === 'number');

function renderBatRail(){
  const ol = $('#bat-steps');
  if (!ol) return;
  ol.innerHTML = STEPS.map((st, i) => {
    const state = i === batStep ? 'now' : (stepAnswered(st) ? 'done' : 'todo');
    return '<li data-i="' + i + '" data-state="' + state + '"><b>' +
           (state === 'done' ? '\u2713' : (i + 1)) + '</b><span>' + esc(st.title) + '</span></li>';
  }).join('');
  const n = countAnswered();
  const fill = $('#bat-fill');
  if (fill) fill.style.width = Math.round(n / ITEM_TOTAL * 100) + '%';
  const meta = $('#bat-meta');
  if (meta) meta.textContent = n + ' of ' + ITEM_TOTAL + ' items answered';
}

function renderBatStage(){
  const mount = $('#bat-mount');
  if (!mount) return;
  const st = STEPS[batStep];
  const kicker = st.kind === 'apt'
    ? 'Graded section ' + (batStep + 1) + ' of 5 · every item scored'
    : 'Inventory · preference, no right answer';
  mount.innerHTML =
    '<p class="bat-kicker">' + esc(kicker) + '</p>' +
    '<h3 class="bat-h">' + esc(st.title) + '</h3>' +
    '<p class="bat-sub">' + esc(st.sub) + '</p>' +
    st.items.map((it, qi) =>
      '<div class="bat-q">' +
      '<p><span class="n">' + String(qi + 1).padStart(2, '0') + '</span>' + esc(it.p) + '</p>' +
      '<div class="bat-opts" role="radiogroup" aria-label="Question ' + (qi + 1) + '">' +
      it.o.map((o, oi) =>
        '<button type="button" class="bat-opt" role="radio" aria-checked="' +
        (batAnswers[it.id] === oi) + '" data-item="' + it.id + '" data-opt="' + oi + '">' +
        '<i aria-hidden="true"></i><span>' + esc(o.t) + '</span></button>').join('') +
      '</div></div>').join('');
  mount.querySelectorAll('.bat-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.item;
      batAnswers[id] = +btn.dataset.opt;
      mount.querySelectorAll('[data-item="' + id + '"]')
        .forEach(b => b.setAttribute('aria-checked', String(b === btn)));
      renderBatRail();
    });
  });
  updateBatNav();
  renderBatRail();
}

function updateBatNav(){
  const prev = $('#bat-prev'), next = $('#bat-next');
  if (!prev || !next) return;
  prev.disabled = batStep === 0;
  next.innerHTML = batStep === STEPS.length - 1
    ? 'Score my profile <span class="arr">→</span>'
    : 'Next <span class="arr">→</span>';
}

function keepStageInView(){
  const el = $('#bat-mount');
  if (!el || !el.getBoundingClientRect) return;
  if (el.getBoundingClientRect().top < 70) scrollTo(el);
}

function batteryNext(){
  if (batStep < STEPS.length - 1){ batStep++; renderBatStage(); keepStageInView(); }
  else finishBattery();
}

async function finishBattery(){
  const scored = scoreBattery(batAnswers);
  renderBatResult(scored);
  applyInput(scored.profile);            // write evidence back into the controls
  run({ persist: true });                // and persist the resulting roadmap
  const res = $('#bat-result');
  if (res){
    res.hidden = false;
    scrollTo(res);
  }
  void persistBattery(scored);
}

function renderBatResult(s){
  const res = $('#bat-result');
  if (!res) return;
  res.innerHTML =
    '<div class="sec-head" style="margin-bottom:26px">' +
      '<span class="kicker">Battery complete · ' + s.answered + ' of ' + s.total + ' items</span>' +
      '<h2>Your measured <span class="grad">profile vector</span></h2>' +
      '<p>Every score below comes from graded items rather than self-rating. The vector has already been written into the simulator, which re-ran the engine and saved the resulting roadmap.</p>' +
    '</div>' +
    '<div class="bat-sum">' + DOMAINS.map(d => {
      const v = s.aptitude[d.key];
      return '<div class="bat-dom" style="--c:' + d.hue + '">' +
        '<header><h4>' + esc(d.label) + '</h4><b>' + v.score + '</b></header>' +
        '<span>' + esc(v.band) + ' · ' + v.correct + ' of ' + v.items + ' best</span>' +
        '<div class="track"><i data-w="' + v.score + '"></i></div>' +
        '<p>' + esc(d.blurb) + '</p></div>';
    }).join('') + '</div>' +
    '<div class="bat-chips">' + [
      ['Interest', labelOf(INTERESTS, s.profile.student.interest)],
      ['Family lens', priorityLabel(s.profile.parent.priority)],
      ['Affordability', s.profile.parent.budget + '/100'],
      ['Risk appetite', s.profile.parent.risk + '/100'],
      ['Min. starting yield', '₹' + s.profile.parent.minpay + ' LPA'],
      ['Region', labelOf(REGIONS, s.profile.region)],
      ['Scholarships', s.profile.scholarship ? 'included' : 'off'],
      ['Hyper-local bias', s.profile.hyperlocal ? 'on' : 'off']
    ].map(([k, v]) => '<span class="bat-chip">' + esc(k) + ' <b>' + esc(v) + '</b></span>').join('') +
    '</div>' +
    '<div class="bat-actions">' +
      '<button type="button" class="btn btn-primary" id="bat-apply">Send to the simulator <span class="arr">→</span></button>' +
      '<button type="button" class="btn btn-ghost" id="bat-retake">Retake the battery</button>' +
    '</div>' +
    '<p class="bat-note" id="bat-note"></p>';

  requestAnimationFrame(() => {
    res.querySelectorAll('.bat-dom .track > i')
      .forEach(i => { i.style.width = (i.dataset.w || 0) + '%'; });
  });
  $('#bat-apply').addEventListener('click', () => {
    applyInput(s.profile);
    run({ persist: true });
    scrollTo($('#simulator'));
  });
  $('#bat-retake').addEventListener('click', resetBattery);
}

async function persistBattery(s){
  const note = $('#bat-note');
  const say = (text, state) => { if (note){ note.textContent = text; note.dataset.state = state || ''; } };
  say('Recording this sitting in the engine index…', '');
  try {
    const saved = await apiPost('/battery', {
      version: s.version, aptitude: s.aptitude, profile: s.profile,
      answered: s.answered, total: s.total, meanAptitude: s.meanAptitude
    });
    say(saved.persisted
      ? 'Recorded in the engine index — the market-intelligence section counts this sitting.'
      : 'Scored locally; the engine index is not attached in this environment.',
      saved.persisted ? 'ok' : '');
  } catch (err){
    say('Scored locally · engine index unreachable (' + err.message + ').', 'warn');
  }
}

function resetBattery(){
  for (const k of Object.keys(batAnswers)) delete batAnswers[k];
  batStep = 0;
  const res = $('#bat-result');
  if (res){ res.hidden = true; res.innerHTML = ''; }
  renderBatStage();
  const sec = $('#battery');
  if (sec) scrollTo(sec);
}

function initBattery(){
  if (!$('#bat-mount')) return;
  const prev = $('#bat-prev'), next = $('#bat-next'), rail = $('#bat-steps');
  if (prev) prev.addEventListener('click', () => { if (batStep > 0){ batStep--; renderBatStage(); keepStageInView(); } });
  if (next) next.addEventListener('click', batteryNext);
  if (rail) rail.addEventListener('click', e => {
    const li = e.target.closest ? e.target.closest('li[data-i]') : null;
    if (!li) return;
    batStep = +li.dataset.i;
    renderBatStage();
  });
  renderBatStage();
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', boot);
else boot();
