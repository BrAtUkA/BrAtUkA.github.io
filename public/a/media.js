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
  function attach(t) {
    const v = t.querySelector('video'); if (!v || v.dataset.ok) return v;
    v.dataset.ok = 1;
    const r = t.getBoundingClientRect(), need = Math.min(r.width, r.height) * Math.min(devicePixelRatio || 1, 2);
    const tiers = t.dataset.t.split(',').map(Number), tier = tiers.find(x => x >= need * .9) || tiers[tiers.length - 1];
    const b = t.dataset.v + '-g' + tier;
    v.innerHTML = `<source src="${b}.webm${q(t)}" type='${AV1}'><source src="${b}.mp4${q(t)}" type='${HEVC}'>`;
    v.addEventListener('playing', () => v.classList.add('on'), {once: true});
    v.load(); return v;
  }
  function schedule() {
    if (!loops.length) return;
    const mid = innerHeight / 2;
    const want = loops.filter(t => !t.hidden && (ratio.get(t) || 0) >= .25 && !reduce && !document.hidden && !lbOpen())
      .map(t => { const r = t.getBoundingClientRect(); return [Math.abs(r.top + r.height / 2 - mid), t]; })
      .sort((a, b) => a[0] - b[0]).slice(0, MAX).map(x => x[1]);
    for (const t of loops) {
      const v = t.querySelector('video'); if (!v) continue;
      if (want.includes(t)) { attach(t); if (v.paused) v.play().catch(() => {}); }
      else if (!v.paused) v.pause();
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
  // Everything that moves is a transform or opacity, so it runs on the compositor. Opening morphs the tile into the
  // full image: an outer frame (the visible window) and the image inside it are scaled against each other, sampled
  // into keyframes so the tile's crop opens out exactly. A loop keeps playing through the open: its own video element
  // moves into the viewer, and the full-quality master takes over only once it plays in step with it.
  const root = document.documentElement;
  function lbOpen() { return root.classList.contains('lb-on'); }
  const lb = document.createElement('div');
  lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Viewer');
  lb.innerHTML = `<div class="lb-bg"></div><div class="lb-stage"></div>
    <div class="lb-ui"><p class="lb-cap"><span class="what"></span><span class="when"></span></p>
    <span class="lb-g l" aria-hidden="true">${svg(ICON.l, 1.25)}</span><span class="lb-g r" aria-hidden="true">${svg(ICON.r, 1.25)}</span>
    <button class="lb-x" type="button" aria-label="Close">${svg(ICON.x, 1.25)}</button>
    <button class="lb-sr pv" type="button" aria-label="Previous">${svg(ICON.l)}</button><button class="lb-sr nx" type="button" aria-label="Next">${svg(ICON.r)}</button></div>`;
  document.body.appendChild(lb);
  const stage = lb.querySelector('.lb-stage'), bg = lb.querySelector('.lb-bg'), ui = lb.querySelector('.lb-ui');
  const what = lb.querySelector('.what'), when = lb.querySelector('.when'), cap = lb.querySelector('.lb-cap');
  const gl = lb.querySelector('.lb-g.l'), gr = lb.querySelector('.lb-g.r');
  let list = [], i = 0, cur = null, busy = false, opener = null;
  const EASE_OPEN = x => 1 - Math.pow(1 - x, 4);                    // fast out, long soft landing
  const SLIDE = {duration: 460, easing: 'cubic-bezier(.25,.8,.25,1)'};
  // no scrolling behind the viewer, without touching overflow (that re-lays out the page and flickers)
  for (const ev of ['wheel', 'touchmove']) lb.addEventListener(ev, e => { if (lbOpen()) e.preventDefault(); }, {passive: false});

  function fit(t) {                                  // the image's box: as large as the screen allows, thin borders
    const W = innerWidth, H = innerHeight, ar = (+t.dataset.w || 16) / (+t.dataset.h || 9);
    const wide = W > 640, side = wide ? 16 : 0, top = wide ? 16 : 0, bot = wide ? 46 : 0;
    let w = Math.min(W - side * 2, (H - top - bot) * ar), h = w / ar;
    if (!wide && h > H - 120) { h = H - 120; w = h * ar; }
    return {w, h, x: Math.round((W - w) / 2), y: Math.round(top + (H - top - bot - h) / 2)};
  }
  const at = (el, f, dx = 0, dy = 0, k = 1) => { el.style.transform = `translate3d(${f.x + dx}px, ${f.y + dy}px, 0) scale(${k})`; };
  // keyframes for the morph between the tile's box r and the full image f (both in screen pixels)
  function morph(r, f, n = 26, reverse = false) {
    const s0 = Math.max(r.width / f.w, r.height / f.h), outer = [], inner = [];
    for (let k = 0; k <= n; k++) {
      const p = EASE_OPEN(k / n);
      const x = r.left + (f.x - r.left) * p, y = r.top + (f.y - r.top) * p, w = r.width + (f.w - r.width) * p, h = r.height + (f.h - r.height) * p;
      const ax = w / f.w, ay = h / f.h, sc = s0 + (1 - s0) * p;   // window scale (non-uniform) and image scale (uniform)
      outer.push({transform: `translate3d(${x}px, ${y}px, 0) scale(${ax}, ${ay})`});
      inner.push({transform: `translate3d(${(f.w - f.w * sc / ax) / 2}px, ${(f.h - f.h * sc / ay) / 2}px, 0) scale(${sc / ax}, ${sc / ay})`});
    }
    if (reverse) { outer.reverse(); inner.reverse(); }
    return [outer, inner];
  }
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
    el.className = 'lb-slide'; inn.className = 'lb-in';
    el.style.width = inn.style.width = f.w + 'px'; el.style.height = inn.style.height = f.h + 'px'; at(el, f);
    el.appendChild(inn);
    const im = t.querySelector('img');
    const base = new Image(); base.alt = im ? im.alt : ''; base.decoding = 'async';
    base.src = im && im.currentSrc ? im.currentSrc : t.href;           // the tile's own pixels: already decoded
    inn.appendChild(base);
    if (t.dataset.v && !reduce) adoptLoop(t, inn);
    else {
      const u = hiURL(t, f.w), path = x => new URL(x, location.href).pathname;
      if (path(u) !== path(base.src)) {
        const hi = new Image(); hi.className = 'hi'; hi.alt = ''; hi.decoding = 'async'; hi.src = u;
        (hi.decode ? hi.decode() : Promise.resolve()).then(() => hi.classList.add('on')).catch(() => {});
        inn.appendChild(hi);
      }
    }
    el.__f = f; el.__t = t; el.__in = inn;
    return el;
  }
  // a loop's own playing video moves into the viewer (no restart); the master loads hidden, seeks to the same moment,
  // and cross-fades in once it is actually playing in step
  function adoptLoop(t, inn) {
    const tv = t.querySelector('video');
    if (tv && tv.dataset.ok) { tv.__home = t; inn.appendChild(tv); tv.classList.add('on'); tv.play().catch(() => {}); }
    const mv = document.createElement('video'); mv.className = 'master'; mv.muted = true; mv.loop = true; mv.playsInline = true; mv.preload = 'auto';
    mv.innerHTML = `<source src="${t.dataset.v}-m.webm${q(t)}" type='${AV1}'><source src="${t.dataset.v}-m.mp4${q(t)}" type='${HEVC}'>`;
    inn.appendChild(mv);
    // sync like a player: one seek slightly ahead, then nudge the playback rate until both show the same moment
    const ref = () => (tv && tv.parentNode === inn && !tv.paused ? tv : null);
    const drift = () => { const r = ref(), d = mv.duration || 1; if (!r) return 0; let x = mv.currentTime - r.currentTime; x -= d * Math.round(x / d); return x; };
    const swap = () => { mv.playbackRate = 1; mv.classList.add('on'); setTimeout(() => { const r = ref(); if (r) r.pause(); }, 450); };
    const sync = () => {
      if (!mv.isConnected) return;
      const r = ref();
      if (!r) { mv.play().then(swap).catch(() => {}); return; }
      mv.currentTime = (r.currentTime + .3) % (mv.duration || 1e9);
      mv.addEventListener('seeked', () => {
        mv.play().then(() => {
          const t0 = performance.now();
          const step = () => {
            if (!mv.isConnected) return;
            const x = drift();
            if (Math.abs(x) < .045 || performance.now() - t0 > 4000 || !ref()) return swap();
            mv.playbackRate = x > 0 ? (x > .3 ? .6 : .85) : (x < -.3 ? 1.6 : 1.2);
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }).catch(() => {});
      }, {once: true});
    };
    mv.addEventListener('canplay', sync, {once: true});
  }
  function release(el) {                              // hand an adopted tile video back to its tile, still playing
    if (!el) return;
    el.querySelectorAll('video.master').forEach(v => { v.pause(); v.removeAttribute('src'); v.innerHTML = ''; v.load(); });
    el.querySelectorAll('video:not(.master)').forEach(v => { if (v.__home) { v.__home.appendChild(v); v.play().catch(() => {}); } });
  }

  function label(f) {
    const t = list[i];
    what.textContent = t.dataset.cap || '';
    when.textContent = t.dataset.date || '';
    const below = f.y + f.h + 12, inside = below + 22 > innerHeight - 6;
    cap.classList.toggle('in', inside);
    cap.style.transform = `translate3d(${Math.max(14, f.x + (inside ? 14 : 0))}px, ${inside ? f.y + f.h - 34 : below}px, 0)`;
    cap.style.maxWidth = Math.max(160, f.w - (inside ? 28 : 0)) + 'px';
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
      old.__t.classList.remove('away'); list[i].classList.add('away');
      if (reduce || !dir) { release(old); old.remove(); }
      else {
        busy = true;
        const W = innerWidth, of = old.__f, nf = el.__f, ox = old.__dx || 0;
        old.animate([{transform: `translate3d(${of.x + ox}px, ${of.y}px, 0)`}, {transform: `translate3d(${of.x - dir * W}px, ${of.y}px, 0)`}], {...SLIDE, fill: 'forwards'})
          .onfinish = () => { release(old); old.remove(); };
        el.animate([{transform: `translate3d(${nf.x + dir * W + ox}px, ${nf.y}px, 0)`}, {transform: `translate3d(${nf.x}px, ${nf.y}px, 0)`}], SLIDE).onfinish = () => { busy = false; };
      }
    }
    prefetch(list[(i + 1) % list.length]); prefetch(list[(i - 1 + list.length) % list.length]);
  }

  function open(t) {
    const g = t.closest('[data-list]');
    list = g && g.hasAttribute('data-solo') ? [t] : ((g && g.__items) || (g ? [...g.querySelectorAll('a.m')] : [t])).filter(x => !x.hidden);
    lb.classList.toggle('solo', list.length < 2);
    opener = t; root.classList.add('lb-on'); lb.classList.add('open'); document.dispatchEvent(new Event('viewer:open'));
    const r = t.getBoundingClientRect();
    show(list.indexOf(t), 0);
    t.classList.add('away');
    if (!reduce) {
      const [outer, inner] = morph(r, cur.__f);
      cur.animate(outer, {duration: 560, easing: 'linear'});
      cur.__in.animate(inner, {duration: 560, easing: 'linear'});
      bg.animate([{opacity: 0}, {opacity: 1}], {duration: 380, easing: 'ease-out'});
      ui.animate([{opacity: 0}, {opacity: 0, offset: .55}, {opacity: 1}], {duration: 720});
    }
    try { history.pushState({lb: 1}, ''); } catch (err) {}
    lb.querySelector('.lb-x').focus({preventScroll: true});
    schedule(); idle();
  }
  function shut() {
    if (!lbOpen() || !cur) return;
    const el = cur, t = el.__t; cur = null;
    const finish = () => {
      release(el); el.remove(); t.classList.remove('away');
      lb.classList.remove('open', 'closing'); root.classList.remove('lb-on'); bg.getAnimations().forEach(a => a.cancel());
      document.dispatchEvent(new Event('viewer:close')); schedule();
    };
    lb.classList.add('closing');
    const r = t.getBoundingClientRect();
    const onScreen = !t.hidden && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    bg.animate([{opacity: 1}, {opacity: 0}], {duration: 360, easing: 'ease-in', fill: 'forwards'});
    if (reduce) finish();
    else if (onScreen && !el.__dragged) {           // fly back into its tile
      const [outer, inner] = morph(r, el.__f, 22, true);
      el.animate(outer, {duration: 440, easing: 'linear', fill: 'forwards'}).onfinish = finish;
      el.__in.animate(inner, {duration: 440, easing: 'linear', fill: 'forwards'});
    } else {                                        // its tile is elsewhere: fade away where it is
      el.animate([{opacity: 1}, {opacity: 0, transform: el.style.transform + ' scale(.97)'}], {duration: 300, easing: 'ease-in', fill: 'forwards'}).onfinish = finish;
    }
    (opener && opener === t ? opener : t).focus({preventScroll: true});
  }
  function close() { if (history.state && history.state.lb) history.back(); else shut(); }
  addEventListener('popstate', () => { if (lbOpen()) shut(); });

  document.addEventListener('click', e => {
    const t = e.target.closest('a.m'); if (!t || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault(); if (!lbOpen()) open(t);
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

  // pointer: the outer edge of the image (and the space beside it) moves back / forward; anywhere else closes
  const zone = x => {
    if (!cur || list.length < 2) return 0;
    const f = cur.__f, edge = Math.min(140, f.w * .12);
    return x < f.x + edge ? -1 : x > f.x + f.w - edge ? 1 : 0;
  };
  stage.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const z = zone(e.clientX); stage.dataset.z = z < 0 ? 'l' : z > 0 ? 'r' : 'c'; idle(); });
  let idleT = 0;
  function idle() { lb.classList.remove('idle'); clearTimeout(idleT); if (fine) idleT = setTimeout(() => lbOpen() && lb.classList.add('idle'), 2400); }

  // touch: sideways drag moves (the slide follows the finger), downward drag closes; updates are batched per frame
  let sx = 0, sy = 0, dx = 0, dy = 0, axis = '', down = false, moved = false, t0 = 0, ptype = '', pend = 0;
  const paint = () => {
    pend = 0; if (!cur) return;
    const f = cur.__f;
    if (axis === 'x') { cur.__dx = dx; at(cur, f, dx); }
    else if (axis === 'y') { const k = Math.min(1, Math.max(0, dy) / innerHeight); at(cur, f, 0, dy, 1 - k * .25); bg.style.opacity = String(1 - k * 1.3); }
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
    moved = true; if (!pend) pend = requestAnimationFrame(paint);
  });
  stage.addEventListener('pointerup', e => {
    if (!down) return; down = false;
    if (pend) { cancelAnimationFrame(pend); paint(); }
    if (ptype === 'mouse' || !axis || axis === 'n') {
      if (!moved && cur) {
        const z = zone(e.clientX), f = cur.__f, beside = e.clientX < f.x || e.clientX > f.x + f.w;
        if (ptype === 'mouse') { if (z) show(i + z, z); else close(); }
        else if (z && beside) show(i + z, z); else lb.classList.toggle('idle');
      }
      return;
    }
    const v = (axis === 'x' ? dx : dy) / Math.max(1, performance.now() - t0), f = cur.__f;
    if (axis === 'x' && (Math.abs(dx) > 70 || Math.abs(v) > .45)) show(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    else if (axis === 'y' && (dy > 110 || v > .55)) { cur.__dragged = true; bg.style.opacity = ''; close(); }
    else { cur.__dx = 0; cur.animate([{transform: cur.style.transform}, {transform: `translate3d(${f.x}px, ${f.y}px, 0) scale(1)`}], {duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)'}); at(cur, f); bg.style.opacity = ''; }
  });
  stage.addEventListener('pointercancel', () => { down = false; if (cur) { at(cur, cur.__f); cur.__dx = 0; } bg.style.opacity = ''; });
})();
