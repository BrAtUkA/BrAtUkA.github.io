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
  let token = 0;                                                   // a newer open makes an older close's clean-up a no-op
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
  // morph keyframes between two states of the slide: the visible window (x, y, w, h) and the image's uniform scale sc
  // (relative to its open size f). Sampled so the crop stays exact at every step; only transforms, so it composites.
  const openState = f => ({x: f.x, y: f.y, w: f.w, h: f.h, sc: 1});
  const tileState = (r, f) => ({x: r.left, y: r.top, w: r.width, h: r.height, sc: Math.max(r.width / f.w, r.height / f.h)});
  function nowState(el) {                             // wherever the slide is right now (mid-drag, mid-slide, open)
    const b = el.getBoundingClientRect();
    return {x: b.left, y: b.top, w: b.width, h: b.height, sc: b.width / el.__f.w};
  }
  function morph(A, B, f, ease, n = 28, fade = null) {           // fade: null, [from, to] or k => opacity
    const outer = [], inner = [];
    for (let k = 0; k <= n; k++) {
      const p = ease(k / n), L = (a, b) => a + (b - a) * p;
      const x = L(A.x, B.x), y = L(A.y, B.y), w = L(A.w, B.w), h = L(A.h, B.h), sc = L(A.sc, B.sc), ax = w / f.w, ay = h / f.h;
      const o = {transform: `translate3d(${x}px, ${y}px, 0) scale(${ax}, ${ay})`};
      if (fade) o.opacity = typeof fade === 'function' ? fade(k / n) : L(fade[0], fade[1]);
      outer.push(o);
      inner.push({transform: `translate3d(${(f.w - f.w * sc / ax) / 2}px, ${(f.h - f.h * sc / ay) / 2}px, 0) scale(${sc / ax}, ${sc / ay})`});
    }
    return [outer, inner];
  }
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
  // A loop never leaves its tile (moving a video element drops its decoded frames, and it would re-buffer). Opening:
  // the tile's video pauses where it is; the viewer shows a snapshot of its current frame at once, then plays its own
  // copy of the same, already cached file from that moment; the full-quality master syncs in after. Closing: the tile's
  // video seeks to the viewer's moment (inside data it already has) and the hand-over waits for its first new frame.
  const snap = (src, parent, cls) => {
    if (!src || src.readyState < 2 || !src.videoWidth) return null;
    const c = document.createElement('canvas'); c.width = src.videoWidth; c.height = src.videoHeight; c.className = cls;
    try { c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); parent.appendChild(c); return c; } catch (e) { return null; }
  };
  const frameOf = (v, max) => new Promise(res => {          // resolves once v is really playing (its clock has moved with
    const c0 = v.currentTime, t0 = performance.now();          // frame data ready), or after max ms. (The frame callback
    const tick = () => {                                      // does not fire while the video is covered, so poll instead.)
      if ((!v.paused && v.readyState >= 3 && v.currentTime !== c0) || performance.now() - t0 > max) return res();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  function adoptLoop(t, inn) {
    const tv = t.querySelector('video');
    const ready = tv && tv.readyState >= 2 && tv.currentSrc;
    const t0 = ready ? tv.currentTime : 0;
    if (ready) { snap(tv, inn, 'still'); tv.dataset.keep = 1; if (tv.paused) tv.play().catch(() => {}); }   // keeps playing, unseen, in step
    let vv = null;
    if (ready) {                                     // the viewer's own copy of the tile's (cached) file
      vv = document.createElement('video'); vv.className = 'copy'; vv.muted = true; vv.loop = true; vv.playsInline = true; vv.preload = 'auto'; vv.src = tv.currentSrc;
      inn.appendChild(vv);
      vv.addEventListener('loadeddata', () => {
        vv.currentTime = t0;
        vv.addEventListener('seeked', () => vv.play().then(() => frameOf(vv, 600)).then(() => { vv.classList.add('on'); const st = inn.querySelector('canvas.still'); if (st) setTimeout(() => st.remove(), 400); }).catch(() => {}), {once: true});
      }, {once: true});
    }
    const mv = document.createElement('video'); mv.className = 'master'; mv.muted = true; mv.loop = true; mv.playsInline = true; mv.preload = 'auto';
    mv.innerHTML = `<source src="${t.dataset.v}-m.webm${q(t)}" type='${AV1}'><source src="${t.dataset.v}-m.mp4${q(t)}" type='${HEVC}'>`;
    inn.appendChild(mv);
    // sync like a player: one seek slightly ahead, then nudge the playback rate until both show the same moment
    const ref = () => (vv && vv.classList.contains('on') && !vv.paused ? vv : null);
    const drift = () => { const r = ref(), d = mv.duration || 1; if (!r) return 0; let x = mv.currentTime - r.currentTime; x -= d * Math.round(x / d); return x; };
    const swap = () => { mv.playbackRate = 1; mv.classList.add('on'); setTimeout(() => { if (vv) vv.pause(); }, 450); };
    const sync = () => {
      if (!mv.isConnected) return;
      const r = ref();
      mv.currentTime = ((r ? r.currentTime : t0) + .3) % (mv.duration || 1e9);
      mv.addEventListener('seeked', () => {
        mv.play().then(() => {
          const s0 = performance.now();
          const step = () => {
            if (!mv.isConnected) return;
            const x = drift();
            if (!ref() || Math.abs(x) < .045 || performance.now() - s0 > 4000) return swap();
            mv.playbackRate = x > 0 ? (x > .3 ? .6 : .85) : (x < -.3 ? 1.6 : 1.2);
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }).catch(() => {});
      }, {once: true});
    };
    mv.addEventListener('canplay', sync, {once: true});
  }
  function playing(el) {                              // the video the viewer is showing right now, if any
    const m = el.querySelector('video.master.on'), c = el.querySelector('video.copy.on');
    return m && !m.paused ? m : c && !c.paused ? c : (m || c);
  }
  function freeze(el) { const v = playing(el); if (v) snap(v, el.__in, 'still'); }
  function release(el) {                              // stop the viewer's videos; the tile's own video is already in step
    if (!el) return Promise.resolve();
    el.querySelectorAll('video').forEach(x => { x.pause(); x.removeAttribute('src'); x.innerHTML = ''; x.load(); });
    const tv = el.__t && el.__t.querySelector('video');
    if (!tv || !tv.currentSrc || tv.readyState < 1) return Promise.resolve();
    delete tv.dataset.keep;
    return (tv.paused ? tv.play().catch(() => {}) : Promise.resolve()).then(() => frameOf(tv, 700));
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
    token++;
    ui.getAnimations().forEach(a => a.cancel());
    stage.querySelectorAll('.lb-slide').forEach(x => { x.getAnimations().forEach(a => a.cancel()); release(x); x.__t.classList.remove('away'); x.remove(); });
    busy = false; bg.style.opacity = ''; lb.classList.remove('closing');   // nothing from a previous view may block this one
    opener = t; root.classList.add('lb-on'); lb.classList.add('open'); document.dispatchEvent(new Event('viewer:open'));
    void lb.offsetWidth; lb.classList.add('bg-on');      // the backdrop is a CSS fade on this one class: no state to get stuck
    const r = t.getBoundingClientRect();
    cur = null; show(list.indexOf(t), 0);
    // only a still under a preview's soft edge needs the brief overlap (it fades in over its half-faded tile);
    // everything else hides its tile at once under an opaque image (a loop's video has just left its tile)
    const soft = !t.dataset.v && !!t.closest('.preview');
    if (soft) { const opened = token; setTimeout(() => { if (opened === token && cur && cur.__t === t) t.classList.add('away'); }, reduce ? 0 : 120); }
    else t.classList.add('away');
    if (!reduce) {
      // fade in over the first fifth: tiles under the home previews' soft edge are partly transparent
      const f = cur.__f, [outer, inner] = morph(tileState(r, f), openState(f), f, EASE_OPEN, 28, soft ? (k => Math.min(1, k / .2)) : null);
      cur.animate(outer, {duration: 560, easing: 'linear'});
      cur.__in.animate(inner, {duration: 560, easing: 'linear'});
      ui.animate([{opacity: 0}, {opacity: 0, offset: .55}, {opacity: 1}], {duration: 720});
    }
    try { history.pushState({lb: 1}, ''); } catch (err) {}
    lb.querySelector('.lb-x').focus({preventScroll: true});
    schedule(); idle();
  }
  function shut() {
    if (!lbOpen() || !cur) return;
    const el = cur, t = el.__t, my = ++token; cur = null; busy = false;
    stage.querySelectorAll('.lb-slide').forEach(x => { if (x !== el) { x.getAnimations().forEach(a => a.cancel()); release(x); x.__t.classList.remove('away'); x.remove(); } });
    const finish = () => {
      if (my !== token) { el.remove(); t.classList.remove('away'); return; }   // opened again meanwhile: leave it alone
      lb.classList.remove('open', 'closing'); root.classList.remove('lb-on');
      ui.getAnimations().forEach(a => a.cancel());
      document.dispatchEvent(new Event('viewer:close')); schedule();
    };
    ui.getAnimations().forEach(a => a.cancel());
    ui.animate([{opacity: 0}, {opacity: 0}], {duration: 600, fill: 'forwards'});      // the caption leaves at once
    lb.classList.add('closing'); bg.style.opacity = ''; lb.classList.remove('bg-on');
    const f = el.__f, from = nowState(el), r = t.getBoundingClientRect();
    el.getAnimations().forEach(a => a.cancel()); el.__in.getAnimations().forEach(a => a.cancel());
    const onScreen = !t.hidden && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    const land = () => {                            // exactly over its tile now: reveal the tile under it, then let go
      freeze(el); t.classList.remove('away');
      release(el).then(() => {
        if (reduce) { el.remove(); finish(); return; }
        el.animate([{opacity: 1}, {opacity: 0}], {duration: 160, easing: 'linear', fill: 'forwards'}).onfinish = () => { el.remove(); finish(); };
      });
    };
    if (reduce) return land();
    if (onScreen) {
      const [outer, inner] = morph(from, tileState(r, f), f, EASE_OUT, 24);
      el.animate(outer, {duration: 520, easing: 'linear', fill: 'forwards'}).onfinish = land;
      el.__in.animate(inner, {duration: 520, easing: 'linear', fill: 'forwards'});
    } else {                                        // its tile is elsewhere: fade away where it is, about its centre
      const to = {x: from.x + from.w * .02, y: from.y + from.h * .02, w: from.w * .96, h: from.h * .96, sc: from.sc * .96};
      const [outer, inner] = morph(from, to, f, EASE_OUT, 16, [1, 0]);
      el.animate(outer, {duration: 340, easing: 'linear', fill: 'forwards'}).onfinish = () => { t.classList.remove('away'); release(el); el.remove(); finish(); };
      el.__in.animate(inner, {duration: 340, easing: 'linear', fill: 'forwards'});
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
  stage.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const h = hit(e.clientX, e.clientY); stage.dataset.z = h === -1 ? 'l' : h === 1 ? 'r' : h === 'none' ? 'n' : 'c'; idle(); });
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
    moved = true; if (!pend) pend = requestAnimationFrame(paint);
  });
  stage.addEventListener('pointerup', e => {
    if (!down) return; down = false;
    if (!cur) return;
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
