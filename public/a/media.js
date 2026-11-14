/* Media behaviour for the home previews, /renders and /gallery. Tiles are plain links to the full image, so the pages
   work without this file; it adds:
   - fade-in of each tile's image over its blurred placeholder (the tile already has its final shape)
   - the masonry wall (shortest-column placement, re-laid out only when the column count changes)
   - the game filter: text tabs with a sliding underline; tiles glide to their new places
   - loops: a few at a time (the ones nearest the middle of the screen), sized to the tile, paused off screen
   - the viewer: opens from the tile, already sharp (the tile's own image first, the large one cross-fades in once
     decoded), swipe or arrow keys to move, swipe down / Esc / back button to close */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const fine = matchMedia('(hover: hover)').matches;
  const AV1 = 'video/webm; codecs="av01.0.08M.10"', HEVC = 'video/mp4; codecs="hvc1.2.4.L123.B0"';
  const EASE = 'cubic-bezier(.2,.7,.2,1)';
  const svg = (d, w = 1.5) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const ICON = { x: 'M6 6l12 12M18 6L6 18', l: 'M14.5 5.5L8 12l6.5 6.5', r: 'M9.5 5.5L16 12l-6.5 6.5' };
  const tiles = [...document.querySelectorAll('a.m')];
  const q = (t) => t.dataset.q ? '?v=' + t.dataset.q : '';

  // ── images fade in once decoded ──
  for (const t of tiles) {
    const im = t.querySelector('img'); if (!im) continue;
    const done = () => im.classList.add('ld');
    if (im.complete && im.naturalWidth) done(); else { im.addEventListener('load', done, {once: true}); im.addEventListener('error', done, {once: true}); }
  }

  // ── loops: only a few play at once ──
  const loops = tiles.filter(t => t.dataset.v);
  const ratio = new Map();
  const MAX = coarse ? 2 : 4;
  // the format this device decodes in hardware (AV1 or HEVC): software decoding of several loops is what makes a phone lag
  let PREF = '', picked = false;
  const SRC = (b, t) => { const a = `<source src="${b}.webm${q(t)}" type='${AV1}'>`, h = `<source src="${b}.mp4${q(t)}" type='${HEVC}'>`; return PREF === 'hevc' ? h + a : a + h; };
  (() => {
    const mc = navigator.mediaCapabilities, cfg = ct => ({type: 'file', video: {contentType: ct, width: 1920, height: 1080, bitrate: 6e6, framerate: 30}});
    const probe = mc && mc.decodingInfo ? Promise.all([mc.decodingInfo(cfg(AV1)).catch(() => ({})), mc.decodingInfo(cfg(HEVC)).catch(() => ({}))])
      .then(([a, h]) => { PREF = a.supported && a.powerEfficient ? 'av1' : h.supported && h.powerEfficient ? 'hevc' : 'av1'; }) : Promise.resolve();
    Promise.race([probe, new Promise(r => setTimeout(r, 400))]).then(() => { picked = true; schedule(); });
  })();
  let viewing = false;                                // the viewer covers the page (not while it closes)
  function attach(t) {
    const v = t.querySelector('video'); if (!v || v.dataset.ok) return v;
    v.dataset.ok = 1;
    const r = t.getBoundingClientRect(), need = Math.min(r.width, r.height) * Math.min(devicePixelRatio || 1, 2);
    const tiers = t.dataset.t.split(',').map(Number), tier = tiers.find(x => x >= need * .9) || tiers[tiers.length - 1];
    const b = t.dataset.v + '-g' + tier;
    v.innerHTML = SRC(b, t);
    v.addEventListener('playing', () => v.classList.add('on'), {once: true});
    v.load(); return v;
  }
  function schedule() {
    if (!loops.length || !picked) return;
    const mid = innerHeight / 2;
    const want = loops.filter(t => !t.hidden && (ratio.get(t) || 0) >= .25 && !reduce && !document.hidden && !viewing)
      .map(t => { const r = t.getBoundingClientRect(); return [Math.abs(r.top + r.height / 2 - mid), t]; })
      .sort((a, b) => a[0] - b[0]).slice(0, MAX).map(x => x[1]);
    for (const t of loops) {
      const v = t.querySelector('video'); if (!v) continue;
      if (want.includes(t)) { attach(t); if (v.paused) v.play().catch(() => {}); }
      else if (!v.paused && !v.dataset.keep) v.pause();
    }
  }
  if (loops.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { es.forEach(e => ratio.set(e.target, e.intersectionRatio)); schedule(); }, {threshold: [0, .25, .5, .75]});
    loops.forEach(t => io.observe(t));
    let raf = 0; addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; schedule(); }); }, {passive: true});
    document.addEventListener('visibilitychange', schedule);
  }

  // ── wall: the organic bento from the home page, repeating down the page. Each visible tile gets its place in the
  // 15-tile pattern (data-p; data-q for the 5-tile phone pattern), so filtering re-flows it without holes ──
  const walls = [...document.querySelectorAll('.wall')];
  for (const wall of walls) {
    const items = [...wall.querySelectorAll(':scope > a.m')];
    wall.__items = items;
    wall.__layout = () => {
      let k = 0;
      for (const t of items) {
        if (t.hidden) { delete t.dataset.p; delete t.dataset.q; continue; }
        t.dataset.p = k % 15 + 1; t.dataset.q = k % 5 + 1; k++;
      }
      wall.classList.add('ready'); schedule();
    };
    wall.__layout();
  }

  // ── game filter: one tab at a time ("All" by default); the red line slides to the chosen tab ──
  const tabs = document.querySelector('.tabs');
  if (tabs && walls[0]) {
    const wall = walls[0], items = wall.__items, btns = [...tabs.querySelectorAll('button')], line = tabs.querySelector('.tabs-line');
    const mark = b => { line.style.width = b.offsetWidth + 'px'; line.style.transform = `translateX(${b.offsetLeft}px)`; };
    const apply = (f, animate) => {
      const b = btns.find(x => x.dataset.f === f) || btns[0];
      btns.forEach(x => x.setAttribute('aria-selected', x === b)); mark(b);
      b.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: animate ? 'smooth' : 'auto'});
      const first = new Map();
      if (animate) for (const t of items) { if (t.hidden) continue; const r = t.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) first.set(t, r); }
      for (const t of items) t.hidden = f !== 'all' && t.dataset.set !== f;
      wall.__layout(true);
      if (!animate) return;
      for (const t of items) {
        if (t.hidden) continue;
        const r = t.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue;
        const a = first.get(t);
        if (a) t.animate([{transform: `translate(${a.left - r.left}px, ${a.top - r.top}px) scale(${a.width / r.width})`, transformOrigin: '0 0'}, {transform: 'none', transformOrigin: '0 0'}], {duration: 560, easing: EASE});
        else t.animate([{opacity: 0, transform: 'scale(.97)'}, {opacity: 1, transform: 'none'}], {duration: 460, easing: 'ease-out'});
      }
    };
    tabs.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.getAttribute('aria-selected') === 'true') return;
      apply(b.dataset.f, !reduce);
      try { history.replaceState(history.state, '', b.dataset.f === 'all' ? location.pathname : '#' + b.dataset.f); } catch (err) {}
    });
    tabs.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const k = btns.indexOf(document.activeElement); if (k < 0) return;
      const n = btns[(k + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length]; n.focus(); n.click(); e.preventDefault();
    });
    const h = location.hash.slice(1);
    apply(btns.some(b => b.dataset.f === h) ? h : 'all', false);
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => mark(btns.find(b => b.getAttribute('aria-selected') === 'true')));
    new ResizeObserver(() => mark(btns.find(b => b.getAttribute('aria-selected') === 'true'))).observe(tabs);
  }

  // ── in-page links: the browser's own smooth scroll (runs on the compositor, so it stays fluid on phones) ──
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    const id = a.getAttribute('href').slice(1), el = id ? document.getElementById(id) : null; if (!el) return;
    e.preventDefault();
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    scrollTo({top: Math.max(0, scrollY + el.getBoundingClientRect().top - margin), behavior: reduce ? 'auto' : 'smooth'});
    try { history.pushState(null, '', '#' + id); } catch (err) {}
  });

  // ── viewer ──
  // Everything that moves is a transform or opacity, run as Web Animations, so it plays on the compositor and stays
  // smooth while the page is busy. Opening morphs the tile into the full image: an outer frame (the visible window) and
  // the image inside it are scaled against each other, sampled into keyframes so the tile's crop opens out exactly.
  // A loop's own playing <video> travels with it, into the viewer and back into its tile, and never stops.
  const root = document.documentElement;
  function lbOpen() { return root.classList.contains('lb-on'); }
  const lb = document.createElement('div');
  lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Viewer');
  lb.innerHTML = `<div class="lb-bg"></div><div class="lb-stage"></div>
    <div class="lb-st" aria-hidden="true"><svg class="lb-ring" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5"/><circle class="arc" cx="8" cy="8" r="6.5" pathLength="100"/></svg></div>
    <div class="lb-ui"><p class="lb-cap"><span class="what"></span><span class="when"></span></p>
    <span class="lb-g l" aria-hidden="true">${svg(ICON.l, 1.25)}</span><span class="lb-g r" aria-hidden="true">${svg(ICON.r, 1.25)}</span>
    <button class="lb-x" type="button" aria-label="Close">${svg(ICON.x, 1.25)}</button>
    <button class="lb-sr pv" type="button" aria-label="Previous">${svg(ICON.l)}</button><button class="lb-sr nx" type="button" aria-label="Next">${svg(ICON.r)}</button></div>`;
  document.body.appendChild(lb);
  const stage = lb.querySelector('.lb-stage'), bg = lb.querySelector('.lb-bg'), ui = lb.querySelector('.lb-ui');
  const what = lb.querySelector('.what'), when = lb.querySelector('.when'), cap = lb.querySelector('.lb-cap');
  const gl = lb.querySelector('.lb-g.l'), gr = lb.querySelector('.lb-g.r');
  const st = lb.querySelector('.lb-st'), ring = lb.querySelector('.lb-ring');
  // loading: a small ring at the end of the caption line, only when the full quality takes a moment; it closes into a
  // full circle once it is in
  let ldT = 0, ldEl = null;
  function state() {                                 // the current slide's loading state, shown on the viewer
    clearTimeout(ldT);
    const el = cur; if (!el) { lb.dataset.ld = ''; ldEl = null; return; }
    if (el.__hq) lb.dataset.ld = lb.dataset.ld === 'wait' && ldEl === el ? 'fin' : 'ok';
    else { lb.dataset.ld = 'pend'; ldT = setTimeout(() => { if (cur === el && !el.__hq) lb.dataset.ld = 'wait'; }, 300); }
    ldEl = el;
  }
  function hq(el) { if (!el || el.__hq) return; el.__hq = true; if (el === cur) state(); }   // full quality is on screen
  function unhq(el) { if (!el || !el.__hq) return; el.__hq = false; if (el === cur) state(); }     // ...and dropped out again
  let list = [], i = 0, cur = null, busy = false, opener = null;
  const EASE_OPEN = x => 1 - Math.pow(1 - x, 4);                    // fast out, long soft landing
  let token = 0;                                                   // a newer open makes an older close's clean-up a no-op
  const SLIDE = {duration: 460, easing: 'cubic-bezier(.25,.8,.25,1)'};
  // no scrolling behind the viewer, without touching overflow (that re-lays out the page and flickers)
  for (const ev of ['wheel', 'touchmove']) lb.addEventListener(ev, e => { if (lbOpen()) e.preventDefault(); }, {passive: false});

  function fit(t) {                                  // the image's box: as large as the screen allows, thin borders
    const W = innerWidth, H = innerHeight, ar = (+t.dataset.w || 16) / (+t.dataset.h || 9);
    // centred both ways, with the same space above and below (room for the caption line underneath)
    const wide = W > 640, side = wide ? 16 : 0, v = wide ? 46 : 0;
    let w = Math.min(W - side * 2, (H - v * 2) * ar), h = w / ar;
    if (!wide && h > H - 120) { h = H - 120; w = h * ar; }
    w = Math.round(w); h = Math.round(h);
    return {w, h, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2)};
  }
  const at = (el, f, dx = 0, dy = 0, k = 1) => { el.__S = null; el.style.transform = `translate3d(${f.x + dx}px, ${f.y + dy}px, 0) scale(${k})`; };
  // morph keyframes between two states of the slide: the visible window (x, y, w, h) and the image's uniform scale sc
  // (relative to its open size f). Sampled so the crop stays exact at every step; only transforms, so it composites.
  const openState = f => ({x: f.x, y: f.y, w: f.w, h: f.h, sc: 1});
  const tileState = (r, f) => ({x: r.left, y: r.top, w: r.width, h: r.height, sc: Math.max(r.width / f.w, r.height / f.h)});
  function nowState(el) {                             // wherever the slide is right now (mid-morph, mid-drag, mid-slide, open)
    const L = livePose(el); if (L) return L;
    if (el.__S) return {...el.__S};                 // mid-morph: the exact pose, crop included (the box alone loses the crop)
    const b = el.getBoundingClientRect();
    return {x: b.left, y: b.top, w: b.width, h: b.height, sc: b.width / el.__f.w};
  }
  // The morph as a Web Animation: the eased path is sampled into transform keyframes (the frame and, against it, the
  // image), played linearly. Only transforms, so the compositor runs it; the main thread can be busy without a stutter.
  function poseCSS(f, S) {
    const ax = S.w / f.w, ay = S.h / f.h;
    return [`translate3d(${S.x}px, ${S.y}px, 0) scale(${ax}, ${ay})`,
            `translate3d(${(f.w - f.w * S.sc / ax) / 2}px, ${(f.h - f.h * S.sc / ay) / 2}px, 0) scale(${S.sc / ax}, ${S.sc / ay})`];
  }
  function pose(el, S) { const [o, n] = poseCSS(el.__f, S); el.__S = S; el.style.transform = o; el.__in.style.transform = n; }
  const mix = (A, B, p) => ({x: A.x + (B.x - A.x) * p, y: A.y + (B.y - A.y) * p, w: A.w + (B.w - A.w) * p, h: A.h + (B.h - A.h) * p, sc: A.sc + (B.sc - A.sc) * p});
  function morph(el, from, to, D, ease, done) {
    stopMorph(el);
    const N = Math.max(12, Math.round(D / 16)), O = [], I = [];
    for (let k = 0; k <= N; k++) { const [o, n] = poseCSS(el.__f, mix(from, to, ease(k / N))); O.push({transform: o}); I.push({transform: n}); }
    const opt = {duration: D, easing: 'linear', fill: 'forwards'};
    const a = el.animate(O, opt), b = el.__in.animate(I, opt);
    el.__anim = {a, b, from, to, D, ease};
    a.onfinish = () => { if (!el.__anim || el.__anim.a !== a) return; el.__anim = null; pose(el, to); a.cancel(); b.cancel(); if (done) done(); };
  }
  function livePose(el) { const m = el && el.__anim; return m ? mix(m.from, m.to, m.ease(Math.min(1, (m.a.currentTime || 0) / m.D))) : null; }
  function stopMorph(el) { if (!el || !el.__anim) return; const S = livePose(el), m = el.__anim; el.__anim = null; pose(el, S); m.a.cancel(); m.b.cancel(); }
  function unhide(t) { if (!t) return; t.classList.add('back'); t.classList.remove('away'); requestAnimationFrame(() => requestAnimationFrame(() => t.classList.remove('back'))); }
  // The home previews fade their last rows out (a mask on the grid). Over such a tile the stage wears the same fade, in
  // screen space, at strength s (0 = none, 1 = exactly the tile's), blending in and out with the motion. Only the mask's
  // gradient changes, never the image, and the motion itself stays on the compositor.
  let edgeS = 0, edgeRaf = 0;
  function edge(t) {
    const g = t.closest('.preview .grid'); if (!g) return null;
    const fade = parseFloat(getComputedStyle(g.closest('.preview')).getPropertyValue('--fade')) || 200;
    return s => {
      edgeS = s;
      if (s < .002) { stage.style.webkitMaskImage = stage.style.maskImage = ''; return; }
      const b = g.getBoundingClientRect().bottom;
      stage.style.webkitMaskImage = stage.style.maskImage = `linear-gradient(180deg, #000 ${b - fade}px, rgba(0,0,0,${1 - .82 * s}) ${b - 46}px, rgba(0,0,0,${1 - s}) ${b}px)`;
    };
  }
  function edgeRun(fn, sOf, D) {
    cancelAnimationFrame(edgeRaf); if (!fn) return;
    const t0 = performance.now(), step = now => { const k = Math.min(1, (now - t0) / D); fn(sOf(k)); if (k < 1) edgeRaf = requestAnimationFrame(step); };
    fn(sOf(0)); edgeRaf = requestAnimationFrame(step);
  }
  function edgeOff() { cancelAnimationFrame(edgeRaf); edgeS = 0; stage.style.webkitMaskImage = stage.style.maskImage = ''; }
  const EASE_OUT = x => 1 - Math.pow(1 - x, 3);
  function hiURL(t, w) {
    const ws = t.dataset.ws.split(',').map(Number), need = w * Math.min(devicePixelRatio || 1, 2.5);
    const pick = ws.find(x => x >= need) || ws[ws.length - 1];
    const im = t.querySelector('img'), avif = im && /\.avif(\?|$)/.test(im.currentSrc || '');
    return t.dataset.full + '-' + pick + (avif ? '.avif' : '.webp') + q(t);
  }
  const warm = new Set();
  function prefetch(t) { if (!t || t.dataset.v) return; const u = hiURL(t, fit(t).w); if (warm.has(u)) return; warm.add(u); const im = new Image(); im.decoding = 'async'; im.src = u; }

  function slide(t) {
    const f = fit(t), el = document.createElement('div'), inn = document.createElement('div');
    el.className = 'lb-slide'; inn.className = 'lb-in'; el.__hq = false;
    el.style.width = f.w + 'px'; el.style.height = f.h + 'px'; inn.style.width = f.w + 'px'; inn.style.height = f.h + 'px'; at(el, f);
    el.appendChild(inn);
    const im = t.querySelector('img');
    const base = new Image(); base.alt = im ? im.alt : ''; base.decoding = 'async';
    base.src = im && im.currentSrc ? im.currentSrc : t.href;           // the tile's own pixels: already decoded
    inn.appendChild(base);
    if (t.dataset.v && !reduce) el.__loop = t;        // its playing video joins once the slide shows (travel)
    else {
      const u = hiURL(t, f.w), path = x => new URL(x, location.href).pathname;
      if (path(u) !== path(base.src)) {
        const hi = new Image(); hi.className = 'hi'; hi.alt = ''; hi.decoding = 'async'; hi.src = u;
        (hi.decode ? hi.decode() : Promise.resolve()).then(() => { hi.classList.add('on'); hq(el); }).catch(() => hq(el));
        inn.appendChild(hi);
      } else el.__hq = true;
    }
    el.__f = f; el.__t = t; el.__in = inn;
    // a new <img> must decode before it can draw, even when the file is cached: wait for it (briefly) before showing
    const dec = base.decode ? base.decode().catch(() => {}) : Promise.resolve();
    el.__ready = Promise.race([dec, new Promise(r => setTimeout(r, 150))]);
    return el;
  }
  // ── loops in the viewer ──
  // One element travels: the tile's own <video>, already playing, moves into the viewer (moveBefore keeps its state; a
  // same-task re-insert keeps it playing too) and back into its tile when the image lands, still playing. It never
  // pauses, reloads or needs syncing on the way in or out. Full quality is a second video, created only once the morph
  // has finished (nothing competes with the animation), locked onto the travelling one's clock and faded in over it.
  // The travelling one plays on underneath, so if full quality runs out of data it shows through on the same frame.
  // At most two videos decode while viewing; the page's own loops rest (see schedule).
  const mov = (parent, node, next = null) => {
    if (parent.moveBefore && node.isConnected && parent.isConnected) { try { parent.moveBefore(node, next); return; } catch (e) {} }
    parent.insertBefore(node, next);
  };
  function travel(el) {
    const t = el.__loop; if (!t || el.__tv) return;
    const tv = t.querySelector('video'); if (!tv) return;
    if (!tv.dataset.ok) attach(t);                   // never loaded: it starts now (the tile's image shows until its first frame)
    tv.dataset.keep = 1; if (tv.paused) tv.play().catch(() => {});
    tv.__home = {parent: tv.parentNode, next: tv.nextSibling};
    mov(el.__in, tv); el.__tv = tv;
  }
  // seconds of data a looping video has ready from where it plays (counting a wrap to the start, all of it if complete)
  function ahead(v) {
    const b = v.buffered, ct = v.currentTime, d = v.duration || 0; let a = 0;
    for (let k = 0; k < b.length; k++) if (b.start(k) <= ct + .05 && b.end(k) >= ct) {
      a = b.end(k) - ct;
      if (b.end(k) >= d - .1) for (let j = 0; j < b.length; j++) if (b.start(j) <= .05) a += b.end(j);
    }
    return a;
  }
  // steer a video's rate in proportion to its lead x (both encodes share timestamps: same clock, same frame)
  function rate(v, x, g) { const k = Math.round(Math.min(1.5, Math.max(.5, 1 - x * g)) * 1000) / 1000; if (v.playbackRate !== k) v.playbackRate = k; }
  function startMaster(el) {
    const t = el.__loop, tv = el.__tv; if (!t || !tv || el.__mv || !el.isConnected) return;
    const mv = document.createElement('video'); mv.className = 'master'; mv.muted = true; mv.loop = true; mv.playsInline = true; mv.preload = 'auto';
    mv.innerHTML = SRC(t.dataset.v + '-m', t);
    el.__in.appendChild(mv); el.__mv = mv;
    const dur = () => mv.duration || 1e9, live = v => !v.paused && v.readyState >= 3;
    const drift = () => { const d = mv.duration || 1, x = mv.currentTime - tv.currentTime; return x - d * Math.round(x / d); };
    let on = false, steer = false, ok = 0, seek = 0, s0 = 0, stuck = 0, last = -1, tlast = -1;
    const cut = () => { mv.playbackRate = 1; ok = 0; on = true; mv.classList.add('on'); hq(el); };
    const drop = () => { mv.style.transition = 'none'; mv.classList.remove('on'); requestAnimationFrame(() => { mv.style.transition = ''; }); on = false; s0 = performance.now(); unhq(el); };
    const tick = () => {
      if (!mv.isConnected) return;
      const now = performance.now(), ref = live(tv) ? tv : null;
      stuck = mv.currentTime === last && !mv.paused ? stuck + 1 : 0; last = mv.currentTime;
      const moving = tv.currentTime !== tlast; tlast = tv.currentTime;
      if (on) {
        if (stuck >= 5 && mv.readyState < 3 && ref && moving) drop();               // out of data: fall back, same frame
        else if (ref && live(mv)) {                                                 // in step; steered only if it drifts
          const x = drift();
          if (steer || Math.abs(x) > .008) { steer = Math.abs(x) > .002; if (steer) rate(mv, x, 6); else mv.playbackRate = 1; }
        }
      } else if (live(mv)) {
        const ready = ahead(mv) >= Math.min(2, (mv.duration || 2) - .2);           // enough data to play on: no flapping
        if (!ref) { if (ready) cut(); }
        else {
          const x = drift();
          if (Math.abs(x) > .4) { if (now - seek > 700) { seek = now; mv.currentTime = (tv.currentTime + .12) % dur(); } }   // too far to steer
          else { if (Math.abs(x) < .002) { if (++ok >= 4 && ready) cut(); } else ok = 0; rate(mv, x, 12); }      // lock within 2 ms
        }
        if (!on && ready && now - s0 > 6000) cut();                                  // never stuck on the lighter one
      }
      requestAnimationFrame(tick);
    };
    mv.addEventListener('canplay', () => {
      if (!mv.isConnected) return;
      mv.currentTime = (tv.currentTime + .3) % dur();
      mv.addEventListener('seeked', () => { mv.play().catch(() => {}); s0 = seek = performance.now(); requestAnimationFrame(tick); }, {once: true});
    }, {once: true});
  }
  const unloadV = x => { x.pause(); x.removeAttribute('src'); x.innerHTML = ''; x.load(); };
  function release(el) {                              // full quality stops; the travelling video goes home, still playing
    if (!el) return;
    if (el.__mv) { unloadV(el.__mv); el.__mv = null; }
    const tv = el.__tv; if (!tv) return; el.__tv = null;
    const h = tv.__home; tv.__home = null; delete tv.dataset.keep; tv.playbackRate = 1;
    if (h && h.parent.isConnected) mov(h.parent, tv, h.next && h.next.parentNode === h.parent ? h.next : null);
    if (!tv.paused && tv.readyState >= 2 && !tv.classList.contains('on')) {
      tv.style.transition = 'none'; tv.classList.add('on'); requestAnimationFrame(() => { tv.style.transition = ''; });
    }
  }
  function label(f) {
    const t = list[i];
    what.textContent = t.dataset.cap || '';
    when.textContent = t.dataset.date || '';
    const below = f.y + f.h + 12, inside = below + 22 > innerHeight - 6;
    cap.classList.toggle('in', inside);
    cap.style.transform = `translate3d(${Math.max(14, f.x + (inside ? 14 : 0))}px, ${inside ? f.y + f.h - 34 : below}px, 0)`;
    cap.style.maxWidth = Math.max(160, f.w - (inside ? 28 : 0)) + 'px';
    ring.style.transform = `translate3d(${Math.min(innerWidth - 14, f.x + f.w - (inside ? 14 : 0)) - 14}px, ${inside ? f.y + f.h - 31 : below + 3}px, 0)`;   // mirrors the caption's inset
    const show = list.length > 1 && f.x >= 48;
    gl.style.display = gr.style.display = show ? '' : 'none';
    gl.style.transform = `translate3d(${f.x / 2 - 14}px, ${f.y + f.h / 2 - 14}px, 0)`;
    gr.style.transform = `translate3d(${innerWidth - f.x / 2 - 14}px, ${f.y + f.h / 2 - 14}px, 0)`;
  }
  function show(k, dir) {
    if (busy || (dir && list.length < 2)) return;
    i = (k + list.length) % list.length;
    const old = cur, el = slide(list[i]); cur = el;
    stage.appendChild(el); label(el.__f);
    if (old) {
      unhide(old.__t); list[i].classList.add('away');
      if (reduce || !dir) { release(old); old.remove(); travel(el); startMaster(el); }
      else {
        busy = true;
        const W = innerWidth, of = old.__f, nf = el.__f, ox = old.__dx || 0;
        at(el, nf, dir * W + ox);                  // waiting off screen until it can draw
        el.__ready.then(() => {
          if (cur !== el) return;
          travel(el);
          old.animate([{transform: `translate3d(${of.x + ox}px, ${of.y}px, 0)`}, {transform: `translate3d(${of.x - dir * W}px, ${of.y}px, 0)`}], {...SLIDE, fill: 'forwards'})
            .onfinish = () => { release(old); old.remove(); };
          at(el, nf);
          el.animate([{transform: `translate3d(${nf.x + dir * W + ox}px, ${nf.y}px, 0)`}, {transform: `translate3d(${nf.x}px, ${nf.y}px, 0)`}], SLIDE).onfinish = () => { busy = false; startMaster(el); };
        });
      }
    }
    prefetch(list[(i + 1) % list.length]); prefetch(list[(i - 1 + list.length) % list.length]);
    zone();
    state();
  }

  function open(t) {
    const g = t.closest('[data-list]');
    list = g && g.hasAttribute('data-solo') ? [t] : ((g && g.__items) || (g ? [...g.querySelectorAll('a.m')] : [t])).filter(x => !x.hidden);
    lb.classList.toggle('solo', list.length < 2);
    token++;
    ui.getAnimations().forEach(a => a.cancel());
    stage.querySelectorAll('.lb-slide').forEach(x => { stopMorph(x); x.getAnimations().forEach(a => a.cancel()); release(x); unhide(x.__t); x.remove(); });
    edgeOff(); if (offScroll) offScroll();
    busy = false; bg.style.opacity = ''; lb.classList.remove('closing');   // nothing from a previous view may block this one
    const tv0 = t.dataset.v && !reduce && t.querySelector('video'); if (tv0) tv0.dataset.keep = 1;   // its video is about to travel: never paused
    opener = t; viewing = true; root.classList.add('lb-on'); lb.classList.add('open'); document.dispatchEvent(new Event('viewer:open'));
    const r = t.getBoundingClientRect();
    cur = null; show(list.indexOf(t), 0); zone();
    const el = cur, f = el.__f, my = token;
    el.style.visibility = 'hidden';
    el.__ready.then(() => {                           // decoded: from here on there is always something on screen
      if (my !== token || cur !== el) return;
      void lb.offsetWidth; lb.classList.add('bg-on');      // the backdrop is a CSS fade on this one class: no state to get stuck
      travel(el);                                      // the tile's video joins, playing, in the same frame the tile hides
      if (reduce) { el.style.visibility = ''; t.classList.add('away'); startMaster(el); return; }
      const ed = edge(t), from = tileState(r, f);
      pose(el, from); if (ed) ed(1);                   // first frame: exactly the tile
      el.style.visibility = ''; t.classList.add('away');
      morph(el, from, openState(f), 560, EASE_OPEN, () => { if (cur === el) { at(el, f); el.__in.style.transform = ''; startMaster(el); } });
      if (ed) edgeRun(ed, k => 1 - Math.min(1, EASE_OPEN(k) / .6), 560);       // the soft edge melts away as it grows
      ui.animate([{opacity: 0}, {opacity: 0, offset: .55}, {opacity: 1}], {duration: 720});
      st.animate([{opacity: 0}, {opacity: 0, offset: .55}, {opacity: 1}], {duration: 720});
    });
    try { history.pushState({lb: 1}, ''); } catch (err) {}
    lb.querySelector('.lb-x').focus({preventScroll: true});
    schedule(); idle();
  }
  let offScroll = null;
  function shut() {
    if (!lbOpen() || !cur) return;
    const el = cur, t = el.__t, my = ++token; cur = null; busy = false;
    stage.querySelectorAll('.lb-slide').forEach(x => { if (x !== el) { stopMorph(x); x.getAnimations().forEach(a => a.cancel()); release(x); unhide(x.__t); x.remove(); } });
    const finish = () => {
      if (offScroll) offScroll();
      if (my !== token) { release(el); el.remove(); unhide(t); return; }   // opened again meanwhile: leave it alone
      edgeOff();
      lb.classList.remove('open', 'closing'); root.classList.remove('lb-on');
      ui.getAnimations().forEach(a => a.cancel());
      document.dispatchEvent(new Event('viewer:close')); schedule();
    };
    if (el.style.visibility === 'hidden') {          // closed before it ever showed: nothing to animate back
      release(el); el.remove(); unhide(t); lb.classList.remove('bg-on');
      const tv = t.querySelector('video'); if (tv) delete tv.dataset.keep;
      finish(); return;
    }
    ui.getAnimations().forEach(a => a.cancel());
    ui.animate([{opacity: 0}, {opacity: 0}], {duration: 600, fill: 'forwards'});      // the caption leaves at once
    lb.classList.add('closing'); bg.style.opacity = ''; lb.classList.remove('bg-on');
    viewing = false; if (!coarse) schedule();       // desktop: the page's loops carry on during the glide (phones: once it lands)
    const f = el.__f, from = nowState(el), r = t.getBoundingClientRect();
    stopMorph(el); el.getAnimations().forEach(a => a.cancel()); el.__in.getAnimations().forEach(a => a.cancel());
    const onScreen = !t.hidden && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    const soft = !!t.closest('.preview .grid'), ed = edge(t);
    const land = () => {                            // exactly over its tile now: hand over
      if (el.__tv) { release(el); unhide(t); el.remove(); finish(); return; }   // a loop: its own video goes home, playing (same element, same frame)
      release(el); unhide(t);
      // a soft-edged tile is matched exactly (same fade): swap in one frame. Cross-fading two half-transparent copies
      // would stack them and weaken the fade for a moment. Opaque tiles cross-fade, which hides any tiny difference.
      if (reduce || soft) { el.remove(); finish(); return; }
      el.animate([{opacity: 1}, {opacity: 0}], {duration: 140, easing: 'linear', fill: 'forwards'}).onfinish = () => { el.remove(); finish(); };
    };
    if (reduce) return land();
    if (onScreen) {
      const s0 = edgeS, go = (S, D) => morph(el, S, tileState(t.getBoundingClientRect(), f), D, EASE_OUT, land);
      go(from, 520);
      if (ed) edgeRun(ed, k => s0 + (1 - s0) * Math.max(0, (EASE_OUT(k) - .35) / .65), 520);     // the soft edge grows in with the glide
      // the page scrolled during the glide: carry on from where it is, towards where the tile is now
      let pend = 0;
      const onScroll = () => { if (pend || !el.__anim) return; pend = requestAnimationFrame(() => { pend = 0; const m = el.__anim; if (!m || my !== token) return; go(livePose(el), Math.max(60, m.D - (m.a.currentTime || 0))); }); };
      addEventListener('scroll', onScroll, {passive: true});
      offScroll = () => { removeEventListener('scroll', onScroll); cancelAnimationFrame(pend); offScroll = null; };
    } else {                                        // its tile is elsewhere: fade away where it is, about its centre
      const to = {x: from.x + from.w * .02, y: from.y + from.h * .02, w: from.w * .96, h: from.h * .96, sc: from.sc * .96};
      morph(el, from, to, 340, EASE_OUT, () => { unhide(t); release(el); el.remove(); finish(); });
      el.animate([{opacity: 1}, {opacity: 0}], {duration: 340, easing: 'cubic-bezier(.33,1,.68,1)', fill: 'forwards'});
    }
    (opener && opener === t ? opener : t).focus({preventScroll: true});
  }
  // close at once; the history entry the viewer added is popped alongside (its popstate is then ignored)
  let ownPop = false;
  function close() { shut(); if (history.state && history.state.lb) { ownPop = true; history.back(); } }
  addEventListener('popstate', () => { if (ownPop) { ownPop = false; return; } if (lbOpen()) shut(); });

  document.addEventListener('click', e => {
    const t = e.target.closest('a.m'); if (!t || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault(); if (!lbOpen() || lb.classList.contains('closing')) open(t);   // a closing viewer hands over at once
  });
  if (fine) document.addEventListener('pointerover', e => { const t = e.target.closest && e.target.closest('a.m'); if (t) prefetch(t); }, {passive: true});
  lb.querySelector('.pv').addEventListener('click', () => show(i - 1, -1));
  lb.querySelector('.nx').addEventListener('click', () => show(i + 1, 1));
  lb.querySelector('.lb-x').addEventListener('click', close);
  addEventListener('keydown', e => {
    if (!lbOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft') show(i - 1, -1);
    else if (e.key === 'ArrowRight') show(i + 1, 1);
    else if (e.key === 'Tab') {
      const f = [...lb.querySelectorAll('button')], a = f.indexOf(document.activeElement);
      e.preventDefault(); f[(a + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
    idle();
  });
  addEventListener('resize', () => {
    if (!lbOpen() || !cur) return;
    const f = fit(cur.__t); cur.__f = f;
    cur.style.width = cur.__in.style.width = f.w + 'px'; cur.style.height = cur.__in.style.height = f.h + 'px'; at(cur, f); label(f);
  });

  // pointer: anywhere off the image closes, except the generous areas around the side arrows, which move. With no
  // room beside the image (wide images), its outer edge moves instead. Clicking the image itself does nothing.
  function hit(x, y) {
    if (!cur) return 'close';
    const f = cur.__f, inside = x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h, multi = list.length > 1;
    if (multi && f.x >= 48 && !inside && Math.abs(y - (f.y + f.h / 2)) < 110) { if (x < f.x) return -1; if (x > f.x + f.w) return 1; }
    if (multi && inside && f.x < 48) { const edge = Math.min(140, f.w * .12); if (x < f.x + edge) return -1; if (x > f.x + f.w - edge) return 1; }
    return inside ? 'none' : 'close';
  }
  let mx = -1, my0 = -1;                            // the mouse's last spot, so the cursor is right the moment the viewer opens
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { mx = e.clientX; my0 = e.clientY; } }, {passive: true});
  function zone() { if (mx < 0) { delete stage.dataset.z; return; } const h = hit(mx, my0); stage.dataset.z = h === -1 ? 'l' : h === 1 ? 'r' : h === 'none' ? 'n' : 'c'; }
  stage.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; mx = e.clientX; my0 = e.clientY; zone(); idle(); });
  let idleT = 0;
  function idle() { lb.classList.remove('idle'); clearTimeout(idleT); if (fine) idleT = setTimeout(() => lbOpen() && lb.classList.add('idle'), 2400); }

  // touch: sideways drag moves (the slide follows the finger), downward drag closes; updates are batched per frame
  let sx = 0, sy = 0, dx = 0, dy = 0, axis = '', down = false, moved = false, t0 = 0, ptype = '', pend = 0;
  const paint = () => {
    pend = 0; if (!cur) return;
    const f = cur.__f;
    if (axis === 'x') { cur.__dx = dx; at(cur, f, dx); }
    else if (axis === 'y') { const k = 1 - Math.min(1, Math.max(0, dy) / innerHeight) * .25; at(cur, f, f.w * (1 - k) / 2, dy + f.h * (1 - k) / 2, k); bg.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / innerHeight * 1.3)); }   // shrinks about its centre
  };
  stage.addEventListener('pointerdown', e => {
    if (e.button || !cur || busy) return;
    down = true; moved = false; axis = ''; sx = e.clientX; sy = e.clientY; dx = dy = 0; t0 = performance.now(); ptype = e.pointerType;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    if (!down || !cur || ptype === 'mouse') return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    if (!axis && Math.hypot(dx, dy) > 8) axis = Math.abs(dx) > Math.abs(dy) ? 'x' : (dy > 0 ? 'y' : 'n');
    if (!axis || axis === 'n') return;
    if (!moved && cur.__anim) { stopMorph(cur); at(cur, cur.__f); cur.__in.style.transform = ''; }   // a drag takes over a still-opening image
    moved = true; if (!pend) pend = requestAnimationFrame(paint);
  });
  stage.addEventListener('pointerup', e => {
    if (!down) return; down = false;
    if (!cur) return;
    if (moved) stopMorph(cur);
    if (pend) { cancelAnimationFrame(pend); paint(); }
    if (ptype === 'mouse' || !axis || axis === 'n') {
      if (!moved && cur) {
        const h = hit(e.clientX, e.clientY);
        if (h === -1 || h === 1) show(i + h, h); else if (h === 'close') close(); else if (ptype !== 'mouse') lb.classList.toggle('idle');
      }
      return;
    }
    const v = (axis === 'x' ? dx : dy) / Math.max(1, performance.now() - t0), f = cur.__f;
    if (axis === 'x' && (Math.abs(dx) > 70 || Math.abs(v) > .45)) show(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    else if (axis === 'y' && (dy > 110 || v > .55)) close();
    else { cur.__dx = 0; cur.animate([{transform: cur.style.transform}, {transform: `translate3d(${f.x}px, ${f.y}px, 0) scale(1)`}], {duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)'}); at(cur, f); bg.style.opacity = ''; }
  });
  stage.addEventListener('pointercancel', () => { down = false; if (cur) { at(cur, cur.__f); cur.__dx = 0; } bg.style.opacity = ''; });

})();
