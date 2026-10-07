/* ══════════════════════════════════════════════════════════════
   PRISM ENGINE — motion layer

   Progressive enhancement only. Nothing in this file is required for
   the site to work: every block feature-detects, fails soft, and the
   page falls back to the static build. All motion is disabled when the
   visitor asks for reduced motion.

   Layers
     1  scheduler      one rAF loop shared by every scroll/pointer job
     2  prismGL        WebGL dispersion background (real refracting fan)
     3  choreography   kinetic headline, staggered reveals, nav, marquee,
                       odometer counters
     4  pointer        spotlight, 3-D tilt, magnetic buttons
     5  radarMorph     tweens the canvas radar between engine states
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduce = false; }

  /* ── 0. shared helpers ───────────────────────────────────── */
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var lerp  = function (a, b, t) { return a + (b - a) * t; };
  var ease  = function (t) { return 1 - Math.pow(1 - t, 3); };

  /* ── 0b. opening sequence gate ───────────────────────────── */
  /* The overlay itself is pure CSS and always resolves on its own
     (final keyframe sets visibility:hidden), so JS can never trap
     the page. This controller only lifts it early on user intent
     and lets later choreography wait for the curtain. */
  var introEl = $('.intro');
  var introDone = false;
  var introQueue = [];

  function afterIntro(fn) {
    if (introDone) { try { fn(); } catch (e) { /* noop */ } return; }
    introQueue.push(fn);
  }
  function introRemoved() {
    return !introEl || !introEl.parentNode;
  }
  function liftIntro() {
    if (introDone) return;
    introDone = true;
    var q = introQueue.splice(0);
    for (var i = 0; i < q.length; i++) { try { q[i](); } catch (e) { /* noop */ } }
    document.documentElement.classList.remove('intro-run');
    document.body.classList.add('intro-done');
    window.PRISM_MOTION_INTRO_DONE = true;
    if (introEl && introEl.parentNode) {
      introEl.setAttribute('data-skip', '1');
      var el = introEl;
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        if (introEl === el) introEl = null;
      }, 900);
    }
  }
  (function openingSequence() {
    if (!introEl) { introDone = true; return; }      // nothing to wait for
    if (reduce) { liftIntro(); return; }
    document.documentElement.classList.add('intro-run');
    var hold = setTimeout(liftIntro, 2350);          // mirrors the CSS lift
    var pending = false;
    function skip() {
      if (pending) return;
      pending = true;
      clearTimeout(hold);
      liftIntro();
    }
    addEventListener('keydown', skip, { passive: true });
    addEventListener('pointerdown', skip, { passive: true });
    addEventListener('wheel', skip, { passive: true });
    addEventListener('touchstart', skip, { passive: true });
    /* safety net: if a stray stylesheet kills the CSS animation, never
       leave the overlay on screen */
    setTimeout(function () { if (introRemoved()) liftIntro(); }, 6000);
  })();

  /* ── 1. scheduler ────────────────────────────────────────── */
  /* Every scroll/pointer/resize job registers here. One rAF tick runs
     them all, so adding effects costs listeners nothing extra. */
  var jobs = [];
  var queued = false;
  function tick() {
    queued = false;
    for (var i = 0; i < jobs.length; i++) {
      try { jobs[i](); } catch (e) { /* one bad job must not stop the rest */ }
    }
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(tick); } }
  function job(fn) { jobs.push(fn); fn(); }

  var view = { y: window.scrollY || 0, h: window.innerHeight,
               w: window.innerWidth, vel: 0, _last: window.scrollY || 0 };
  window.addEventListener('scroll', function () {
    view.y = window.scrollY || 0;
    view.vel = view.y - view._last;
    view._last = view.y;
    schedule();
  }, { passive: true });
  window.addEventListener('resize', function () {
    view.h = window.innerHeight; view.w = window.innerWidth; schedule();
  }, { passive: true });

  var ptr = { x: 0.5, y: 0.4, tx: 0.5, ty: 0.4, on: false };
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    ptr.tx = e.clientX / Math.max(1, view.w);
    ptr.ty = e.clientY / Math.max(1, window.innerHeight);
    if (!ptr.on) { ptr.on = true; document.body.classList.add('pointer-on'); }
    schedule();
  }, { passive: true });

  /* ── 2. scroll progress rail ─────────────────────────────── */
  (function progressRail() {
    if (reduce) return;
    var bar = document.createElement('div');
    bar.id = 'sprog';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    job(function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? clamp(view.y / max, 0, 1) : 0) + ')';
    });
  })();

  /* ── 3. section-scoped reveal choreography ───────────────── */
  (function choreograph() {
    var inited = false;
    function assign() {
      if (inited) return; inited = true;
      // stagger siblings inside repeating groups
      ['.pain-grid', '.scope-grid', '.impact-grid', '.vectors', '.pipeline',
       '.intel-stats', '.intel-grid', '.timeline', '.hero-stats', '.sc-steps'
      ].forEach(function (sel) {
        var group = $(sel); if (!group) return;
        $$(':scope > *', group).forEach(function (el, i) {
          el.style.setProperty('--d', Math.min(i, 7));
          if (!el.dataset.anim) el.dataset.anim = 'scale';
          el.classList.add('reveal');
        });
      });
      // section headings wipe in from the left
      $$('.sec-head').forEach(function (h) {
        if (!h.dataset.anim) h.dataset.anim = 'clip';
      });
      // alternating lateral entrances for the pipeline steps
      $$('.pipeline .step').forEach(function (s, i) {
        s.dataset.anim = i % 2 ? 'left' : 'right';
      });
      // hero pieces
      var hc = $('.hero-copy');   if (hc) hc.dataset.anim = 'blur';
      var hv = $('.hero-visual'); if (hv) { hv.dataset.anim = 'scale'; hv.style.setProperty('--d', 2); }
      // the app's own observer adds .in; groups that lack one get theirs here
      if (!('IntersectionObserver' in window)) {
        $$('.reveal').forEach(function (el) { el.classList.add('in'); });
      } else {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
          });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        $$('.reveal').forEach(function (el) { io.observe(el); });
      }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', assign);
    else assign();
  })();

  /* ── 4. WebGL prism dispersion ───────────────────────────── */
  /* A real refracting wedge: white beam in, chromatic fan out. Mouse and
     scroll drive the geometry so the background responds to reading. */
  (function prismGL() {
    var cv = $('#prismgl');
    if (!cv || reduce) return;

    var gl = null;
    try {
      gl = cv.getContext('webgl', { antialias: false, alpha: true, depth: false, powerPreference: 'low-power' })
        || cv.getContext('experimental-webgl');
    } catch (e) { gl = null; }
    if (!gl) return;                                  // CSS aurora remains the background

    var VERT = `
      attribute vec2 aPos;
      void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

    var FRAG = `
      precision highp float;

      uniform vec2  uRes;
      uniform float uTime;
      uniform vec2  uMouse;     // 0..1, eased
      uniform float uScroll;    // 0..1 page progress

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }

      /* spectral ramp: violet → cyan → green → amber → pink */
      vec3 spectrum(float t){
        t = fract(t);
        vec3 c0 = vec3(0.486, 0.361, 1.000);
        vec3 c1 = vec3(0.133, 0.827, 0.933);
        vec3 c2 = vec3(0.180, 0.827, 0.580);
        vec3 c3 = vec3(0.984, 0.749, 0.141);
        vec3 c4 = vec3(0.957, 0.447, 0.714);
        if (t < 0.25) return mix(c0, c1, t / 0.25);
        if (t < 0.50) return mix(c1, c2, (t - 0.25) / 0.25);
        if (t < 0.75) return mix(c2, c3, (t - 0.50) / 0.25);
        return mix(c3, c4, (t - 0.75) / 0.25);
      }

      /* signed distance to a triangle */
      float sdTri(vec2 p, vec2 a, vec2 b, vec2 c){
        vec2 e0 = b - a, e1 = c - b, e2 = a - c;
        vec2 v0 = p - a, v1 = p - b, v2 = p - c;
        vec2 q0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
        vec2 q1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
        vec2 q2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
        float s = sign(e0.x * e2.y - e0.y * e2.x);
        vec2 d = min(min(vec2(dot(q0, q0), s * (v0.x * e0.y - v0.y * e0.x)),
                         vec2(dot(q1, q1), s * (v1.x * e1.y - v1.y * e1.x))),
                         vec2(dot(q2, q2), s * (v2.x * e2.y - v2.y * e2.x)));
        return -sqrt(d.x) * sign(d.y);
      }

      void main(){
        vec2 uv = gl_FragCoord.xy / uRes;
        vec2 p  = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;   // aspect-corrected

        float t = uTime * 0.05;

        /* ── prism: an equilateral wedge that drifts with pointer + scroll ── */
        vec2 apex = vec2(-0.02 + (uMouse.x - 0.5) * 0.16, 0.06 + (0.5 - uMouse.y) * 0.12 - uScroll * 0.22);
        float rot = -0.32 + (uMouse.x - 0.5) * 0.18;
        float ca = cos(rot), sa = sin(rot);
        vec2 rp = mat2(ca, -sa, sa, ca) * (p - apex);
        float wedge = sdTri(rp, vec2(0.0, 0.30), vec2(-0.26, -0.20), vec2(0.26, -0.20));

        /* ── volumetric aurora ground ── */
        float aur = fbm(p * 2.1 + vec2(t * 0.6, t * 0.25));
        aur = pow(clamp(aur, 0.0, 1.0), 1.7);
        vec3 col = vec3(0.018, 0.021, 0.05);
        col += spectrum(0.55 + p.x * 0.25 + aur * 0.2) * aur * 0.10;

        /* ── incoming white beam, left edge → wedge entry face ── */
        vec2 b0 = vec2(-1.1, 0.22 - uScroll * 0.10);
        vec2 b1 = apex + vec2(-0.02, 0.10);
        vec2 bd = normalize(b1 - b0);
        float bt = clamp(dot(p - b0, bd), 0.0, length(b1 - b0));
        float beam = exp(-pow(length(p - (b0 + bd * bt)) * 34.0, 2.0));
        beam *= 0.55 + 0.45 * sin(uTime * 1.6 + bt * 6.0);
        col += mix(vec3(1.0), vec3(0.75, 0.85, 1.0), 0.5) * beam * 0.42;

        /* ── refracting glow inside the wedge ── */
        float inside = smoothstep(0.004, -0.05, wedge);
        col += spectrum(0.5 + rp.y * 1.4) * inside * 0.16;
        col += vec3(1.0) * smoothstep(0.012, 0.0, abs(wedge)) * 0.30;

        /* ── the dispersion fan leaving the exit face ── */
        vec2 ex = apex + vec2(0.26, -0.20);              // exit face midpoint
        vec2 dir = p - ex;
        float dist = length(dir);
        float ang = atan(dir.y, max(dir.x, 0.0001));
        float spread = -0.55 * (0.5 - uMouse.y) * 0.35 - 0.2 * sin(uTime * 0.35);
        float rel = (ang - spread) * 1.55;
        float inFan = step(-0.05, p.x - ex.x) * step(abs(rel), 1.15);

        float rays = pow(abs(sin(rel * 7.5 + uTime * 0.25)), 26.0);
        float body = smoothstep(1.15, 0.0, abs(rel));
        float fall = 1.0 / (1.0 + dist * dist * 4.2);
        vec3 fan = spectrum(rel * 0.62 + 0.30 + uTime * 0.03);
        col += fan * inFan * body * fall * (0.55 + rays * 2.6);

        /* dusty volumetric haze through the fan */
        col += fan * fbm(p * 5.0 + vec2(0.0, t)) * inFan * fall * 0.55;

        /* ── vignette + film grain, keeps text legible ── */
        float vig = smoothstep(1.35, 0.25, length(p * vec2(0.82, 1.0)));
        col *= 0.35 + 0.65 * vig;
        col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.030;

        gl_FragColor = vec4(col, 0.92);
      }`;

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        if (window.console) console.warn('prismgl shader:', gl.getShaderInfoLog(s));
        gl.deleteShader(s); return null;
      }
      return s;
    }

    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var U = {
      res:    gl.getUniformLocation(prog, 'uRes'),
      time:   gl.getUniformLocation(prog, 'uTime'),
      mouse:  gl.getUniformLocation(prog, 'uMouse'),
      scroll: gl.getUniformLocation(prog, 'uScroll')
    };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    var dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    var scale = 0.72;                                  // fill-rate headroom
    var mx = 0.5, my = 0.5, running = true, t0 = performance.now();

    function resize() {
      var w = Math.max(320, Math.round(window.innerWidth  * dpr * scale));
      var h = Math.max(240, Math.round(window.innerHeight * dpr * scale));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, w, h);
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    /* The background is fixed, so it stays live for the whole page — but at
       half rate, and never while the tab is hidden. */
    var frame = 0;
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
    });

    /* Own rAF loop: an always-on background cannot wait for input events to
       repaint. rAF already stops on a hidden tab, and we halve the rate. */
    function render(){
      requestAnimationFrame(render);
      if (!running) return;
      frame++;
      if (frame % 2) return;                       // ~30fps: ample for a slow background
      mx = lerp(mx, ptr.tx, 0.045);
      my = lerp(my, ptr.ty, 0.045);
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      var prog = clamp(view.y / max, 0, 1);
      gl.uniform2f(U.res, cv.width, cv.height);
      gl.uniform1f(U.time, (performance.now() - t0) / 1000);
      gl.uniform2f(U.mouse, mx, my);
      gl.uniform1f(U.scroll, prog);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(render);

    document.body.classList.add('gl-on');
  })();

  /* ── 5. kinetic headline ─────────────────────────────────── */
  /* Word-level (never letter-level) so screen readers and text
     selection keep working on the real headline. */
  (function kineticHeadline() {
    if (reduce) return;
    var h1 = $('.hero h1');
    if (!h1 || h1.dataset.kinetic === 'on') return;
    h1.dataset.kinetic = 'on';

    var idx = 0;
    function wrapWord(word) {
      var w = document.createElement('span');
      w.className = 'k-w';
      var c = document.createElement('span');
      c.className = 'k-c';
      c.style.setProperty('--i', idx++);
      c.textContent = word;
      w.appendChild(c);
      return w;
    }

    try {
      Array.prototype.slice.call(h1.childNodes).forEach(function (node) {
        if (node.nodeType === 3) {                      // text → per word
          var parts = node.nodeValue.split(/(\s+)/);
          var frag = document.createDocumentFragment();
          parts.forEach(function (part) {
            if (!part) return;
            frag.appendChild(/\s/.test(part) ? document.createTextNode(part) : wrapWord(part));
          });
          h1.replaceChild(frag, node);
        } else if (node.nodeType === 1) {               // keep real elements intact
          node.classList.add('k-c');
          node.style.setProperty('--i', idx++);
        }
      });
      afterIntro(function () { document.documentElement.classList.add('k-launch'); });
    } catch (e) { /* headline simply stays as authored */ }
  })();

  /* ── 6. marquee reacts to scroll velocity ────────────────── */
  (function marquee() {
    var track = $('.marquee-track');
    if (!track || reduce) return;
    var base = 46, last = 0, eased = base;
    job(function () {
      var v = Math.abs(view.vel);
      last = lerp(last, v, 0.18);
      var target = clamp(base * (1 - Math.min(last, 90) / 130), 6, base);
      if (Math.abs(target - eased) > 0.15) {
        eased = lerp(eased, target, 0.3);
        track.style.setProperty('--mq-dur', eased.toFixed(2) + 's');
      }
      view.vel *= 0.82;                                 // decay so it settles
    });
  })();

  /* ── 7. odometer counters ────────────────────────────────── */
  /* Replaces the plain textContent tick with rolling digit columns.
     The app skips its own counter when this runs (PRISM_MOTION.handled). */
  (function odometers() {
    function build(el) {
      var target = String(el.dataset.count == null ? '' : el.dataset.count);
      var suffix = el.dataset.suffix || '';
      var digits = target.replace(/\D/g, '');
      if (!digits || digits.length > 4) return null;
      el.textContent = '';
      el.classList.add('odo');
      var cols = [];
      digits.split('').forEach(function (ch) {
        var col = document.createElement('span'); col.className = 'odo-col';
        for (var n = 0; n <= 9; n++) {
          var d = document.createElement('i'); d.textContent = String(n);
          col.appendChild(d);
        }
        el.appendChild(col); cols.push({ el: col, digit: +ch });
      });
      if (suffix) {
        var sfx = document.createElement('span');
        sfx.textContent = suffix; el.appendChild(sfx);
      }
      return { cols: cols, digits: digits };
    }

    function roll(odo) {
      odo.cols.forEach(function (c, i) {
        c.el.style.setProperty('--odo-dur', (0.9 + i * 0.18).toFixed(2) + 's');
        c.el.style.setProperty('--n', String(c.digit));
      });
    }

    function init() {
      if (reduce || !('IntersectionObserver' in window)) return false;
      var pairs = [];
      $$('[data-count]').forEach(function (el) {
        var odo = build(el); if (odo) pairs.push({ el: el, odo: odo });
      });
      if (!pairs.length) return false;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          for (var i = 0; i < pairs.length; i++) {
            if (pairs[i].el === en.target) { roll(pairs[i].odo); break; }
          }
          io.unobserve(en.target);
        });
      }, { threshold: 0.6 });
      pairs.forEach(function (p) { io.observe(p.el); });
      return true;
    }
    var ok = false;
    try { ok = init(); } catch (e) { ok = false; }
    if (ok) window.PRISM_MOTION_ODOMETER = true;        // read by app.js
  })();

  /* ── 8. current-section nav state ────────────────────────── */
  (function sectionNav() {
    var links = $$('.nav-links a');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var map = {};
    links.forEach(function (a) {
      var id = (a.getAttribute('href') || '').replace('#', '');
      var sec = id && document.getElementById(id);
      if (sec) map[id] = a;
    });
    var ids = Object.keys(map);
    if (!ids.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove('active'); });
        var a = map[en.target.id];
        if (a) a.classList.add('active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ids.forEach(function (id) { io.observe(document.getElementById(id)); });
  })();

  /* ── 9. pointer effects: spotlight, 3-D tilt, magnetism ──── */
  (function pointerFxC() {
    if (reduce) return;
    var fine = true;
    try { fine = matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) { fine = false; }

    /* a. hero spotlight follows the cursor */
    job(function () {
      document.documentElement.style.setProperty('--ptr-x', (ptr.tx * 100).toFixed(1) + '%');
      document.documentElement.style.setProperty('--ptr-y', (ptr.ty * 100).toFixed(1) + '%');
    });

    if (!fine) return;                                  // touch: stop here

    /* b. cursor spotlight + 3-D tilt on cards */
    var TILT = '.pain, .vec-card, .scope, .imp, .istat, .intel-card';
    $$(TILT).forEach(function (el) {
      var accent = el.getAttribute('data-c');
      if (accent) el.style.setProperty('--c', accent);
      var rect = null;

      el.addEventListener('pointerenter', function () {
        el.classList.add('tilt-on');
        rect = el.getBoundingClientRect();
      });
      el.addEventListener('pointermove', function (e) {
        if (!rect) rect = el.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width;
        var y = (e.clientY - rect.top) / rect.height;
        el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        el.style.setProperty('--rx', ((0.5 - y) * 9).toFixed(2) + 'deg');
        el.style.setProperty('--ry', ((x - 0.5) * 11).toFixed(2) + 'deg');
      }, { passive: true });
      el.addEventListener('pointerleave', function () {
        el.classList.remove('tilt-on');
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
        rect = null;
      });
    });

    /* c. magnetic buttons — a small pull toward the cursor */
    $$('.btn').forEach(function (btn) {
      var rect = null;
      btn.addEventListener('pointerenter', function () {
        rect = btn.getBoundingClientRect();
        btn.classList.add('magnet-on');
      });
      btn.addEventListener('pointermove', function (e) {
        if (!rect) return;
        var dx = (e.clientX - (rect.left + rect.width / 2)) / rect.width;
        var dy = (e.clientY - (rect.top + rect.height / 2)) / rect.height;
        btn.style.setProperty('--mg-x', (dx * 7).toFixed(2) + 'px');
        btn.style.setProperty('--mg-y', (dy * 5).toFixed(2) + 'px');
      }, { passive: true });
      btn.addEventListener('pointerleave', function () {
        btn.classList.remove('magnet-on');
        btn.style.setProperty('--mg-x', '0px');
        btn.style.setProperty('--mg-y', '0px');
        rect = null;
      });
    });
  })();

  /* ── 10. radar morphing ──────────────────────────────────── */
  /* The engine redraws the radar on every keystroke of the sliders.
     Tweening between states turns a hard jump into a readable morph. */
  var lastRadar = null;
  var morphId = 0;

  function morphRadar(data, draw) {
    if (!data || typeof draw !== 'function') return;
    if (reduce || !data.student || !data.student.length) { lastRadar = data; draw(data); return; }
    if (morphId) { cancelAnimationFrame(morphId); morphId = 0; }

    var dim = data.student.length;
    var hasPrev = lastRadar && lastRadar.student && lastRadar.student.length === dim;
    var fromS = hasPrev ? lastRadar.student.slice() : data.student.map(function () { return 0; });
    var fromM = hasPrev ? lastRadar.mkt.slice()     : data.mkt.map(function () { return 0; });
    var toS = data.student.slice(), toM = data.mkt.slice();
    lastRadar = data;

    var t0 = performance.now(), dur = 620;
    function step(now) {
      var p = Math.min(1, (now - t0) / dur), e = ease(p);
      var mix = function (a, b) { return a.map(function (v, i) { return lerp(v, b[i], e); }); };
      draw({ labels: data.labels, student: mix(fromS, toS), mkt: mix(fromM, toM) });
      morphId = p < 1 ? requestAnimationFrame(step) : 0;
    }
    morphId = requestAnimationFrame(step);
  }

  /* ── 10b. Neural brain — procedural 3-D point cloud ──────── */
  /* A stylised brain built from maths rather than a downloaded model:
     a folded ellipsoid with a longitudinal fissure and a cerebellar bulge,
     ~1100 points projected with perspective and additive blending, plus
     action potentials travelling between nearby points. It needs no GL
     context, no asset download and no library, so it can never fail to
     load — it simply does not start if the canvas or motion is missing. */
  (function introBrain() {
    if (reduce) return;
    var cv = $('#introbrain');
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d');
    if (!ctx) return;

    var N = 1100, pts = [];
    var i, th, ph, r, x, y, z, groove, fold;
    for (i = 0; i < N; i++) {
      th = Math.random() * Math.PI * 2;
      ph = Math.acos(2 * Math.random() - 1);
      x = Math.sin(ph) * Math.cos(th);
      y = Math.cos(ph);
      z = Math.sin(ph) * Math.sin(th);
      fold = 1 + .095 * Math.sin(6 * th + .6 * Math.sin(3 * ph)) * Math.sin(4 * ph);
      groove = 1 - .34 * Math.exp(-(x * x) / .0045) * Math.max(0, y);   // midline fissure
      x *= .74 * fold * groove; y *= .60 * fold; z *= .54 * fold;
      if (y < -.34 && z < .1) { y = -.34 + (y + .34) * .35; z += .16; } // cerebellum
      pts.push([x, y, z]);
    }

    /* action potentials: index pairs, each with a phase offset */
    var SYN = [], tries = 0;
    while (SYN.length < 16 && tries++ < 600) {
      var a = (Math.random() * N) | 0, b = (Math.random() * N) | 0;
      if (a === b) continue;
      var dx = pts[a][0]-pts[b][0], dy = pts[a][1]-pts[b][1], dz = pts[a][2]-pts[b][2];
      if (dx*dx + dy*dy + dz*dz < .34) SYN.push([a, b, Math.random()]);
    }

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() {
      var w = cv.clientWidth || 260;
      cv.width = w * dpr; cv.height = Math.round(w * .92) * dpr;
    }
    size();

    var t0 = performance.now();
    function frame(now) {
      if (!cv.isConnected) return;                     // the intro removed us
      var w = cv.width / dpr, h = cv.height / dpr;
      var cx = w / 2, cy = h / 2, R = Math.min(w, h) * .40;
      var t = (now - t0) / 1000;
      var ay = t * .55, ax = -.28 + Math.sin(t * .5) * .06;
      var cAy = Math.cos(ay), sAy = Math.sin(ay), cAx = Math.cos(ax), sAx = Math.sin(ax);
      var j, p, X, Y, Z, Y2, Z2, persp, px, py, d;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      for (j = 0; j < N; j++) {
        p = pts[j];
        X = p[0] * cAy + p[2] * sAy;
        Z = -p[0] * sAy + p[2] * cAy;
        Y = p[1];
        Y2 = Y * cAx - Z * sAx;
        Z2 = Y * sAx + Z * cAx;
        persp = 2.6 / (2.6 + Z2);
        px = cx + X * R * persp;
        py = cy + Y2 * R * persp;
        d = clamp(persp - .82, 0, 1.4);
        ctx.fillStyle = 'rgba(' + (124 + d * 60 | 0) + ',' + (92 + d * 110 | 0) + ',' + (255 | 0) + ',' +
                        (.14 + d * .5).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(px, py, .7 + d * 1.5, 0, 6.2832); ctx.fill();
      }

      /* action potentials */
      for (j = 0; j < SYN.length; j++) {
        var sy = SYN[j], A = pts[sy[0]], B = pts[sy[1]];
        var ph2 = (t * .8 + sy[2]) % 1;
        var gx = A[0] + (B[0]-A[0]) * ph2, gy = A[1] + (B[1]-A[1]) * ph2, gz = A[2] + (B[2]-A[2]) * ph2;
        X = gx * cAy + gz * sAy; Z = -gx * sAy + gz * cAy;
        Y2 = gy * cAx - Z * sAx;
        persp = 2.6 / (2.6 + (gy * sAx + Z * cAx));
        px = cx + X * R * persp; py = cy + Y2 * R * persp;
        ctx.fillStyle = 'rgba(52,211,153,.9)';
        ctx.beginPath(); ctx.arc(px, py, 1.7, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(52,211,153,.28)';
        ctx.beginPath(); ctx.arc(px, py, 4.5, 0, 6.2832); ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })();

  /* ── 11. public hook ─────────────────────────────────────── */
  window.PRISM_MOTION = {
    version: 1,
    reduce: reduce,
    morphRadar: morphRadar,
    afterIntro: afterIntro,
    introDone: function () { return introDone; }
  };
})();
