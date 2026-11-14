/* Media behaviour for the home previews, /renders and /gallery. Tiles are plain links to the full image, so the pages
   work without this file; it adds:
   - fade-in of each tile's image over its blurred placeholder (the tile already has its final shape)
   - the masonry wall (shortest-column placement, re-laid out only when the column count changes)
   - the game filter: logo toggles (none on = everything); tiles glide to their new places
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

  // ── masonry wall ──
  const walls = [...document.querySelectorAll('.wall')];
  for (const wall of walls) {
    const items = [...wall.querySelectorAll(':scope > a.m')]; let n = 0;
    wall.__items = items;
    const count = () => { const w = wall.clientWidth; return w < 480 ? 1 : w < 1000 ? 2 : w < 1600 ? 3 : 4; };
    wall.__layout = (force) => {
      const k = count(); if (k === n && !force) return; n = k;
      const cols = Array.from({length: k}, () => Object.assign(document.createElement('div'), {className: 'col'}));
      const h = new Array(k).fill(0);
      for (const t of items) {
        if (t.hidden) { cols[0].appendChild(t); continue; }
        const j = h.indexOf(Math.min(...h)); cols[j].appendChild(t); h[j] += 1 / (parseFloat(t.style.getPropertyValue('--ar')) || 1.7778);
      }
      wall.replaceChildren(...cols); wall.classList.add('ready'); schedule();
    };
    wall.__layout(true);
    new ResizeObserver(() => wall.__layout()).observe(wall);
  }

  // ── game filter: independent toggles. None on = everything (the default); any on = only those games. ──
  const games = document.querySelector('.games');
  if (games && walls[0]) {
    const wall = walls[0], items = wall.__items, btns = [...games.querySelectorAll('button')];
    const apply = (on, animate) => {
      btns.forEach(b => b.setAttribute('aria-pressed', on.has(b.dataset.f)));
      games.classList.toggle('picked', on.size > 0);
      const first = new Map();
      if (animate) for (const t of items) { if (t.hidden) continue; const r = t.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) first.set(t, r); }
      for (const t of items) t.hidden = on.size > 0 && !on.has(t.dataset.set);
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
    const current = () => new Set(btns.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.f));
    games.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const on = current(); on.has(b.dataset.f) ? on.delete(b.dataset.f) : on.add(b.dataset.f);
      apply(on, !reduce);
      try { history.replaceState(history.state, '', on.size ? '#' + [...on].join('+') : location.pathname); } catch (err) {}
    });
    const h = new Set(location.hash.slice(1).split('+').filter(f => btns.some(b => b.dataset.f === f)));
    if (h.size) apply(h, false);
  }

  // ── viewer ──
  const lb = document.createElement('div');
  lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Viewer');
  lb.innerHTML = `<div class="lb-bar"><div class="lb-info"><span class="ct" aria-live="polite"></span><span class="cap"></span></div>
    <button class="lb-btn x" type="button" aria-label="Close">${svg(ICON.x)}</button></div>
    <div class="lb-stage"><button class="lb-btn lb-nav pv" type="button" aria-label="Previous">${svg(ICON.l)}</button><button class="lb-btn lb-nav nx" type="button" aria-label="Next">${svg(ICON.r)}</button></div>`;
  document.body.appendChild(lb);
  const stage = lb.querySelector('.lb-stage'), ct = lb.querySelector('.ct'), cap = lb.querySelector('.cap');
  let list = [], i = 0, cur = null, from = null, busy = false;
  function lbOpen() { return lb.classList.contains('open'); }
  const pad2 = n => String(n).padStart(2, '0');

  function fit(t) {
    const sw = stage.clientWidth, sh = stage.clientHeight, ar = (+t.dataset.w || 16) / (+t.dataset.h || 9);
    const wide = fine && sw > 640, px = wide ? 96 : 0, pt = wide ? 8 : 0, pb = wide ? 40 : 0;
    let w = Math.min(sw - px * 2, (sh - pt - pb) * ar), h = w / ar;
    return {w, h, x: (sw - w) / 2, y: pt + (sh - pt - pb - h) / 2};
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
    const f = fit(t), el = document.createElement('div');
    el.className = 'lb-slide'; Object.assign(el.style, {width: f.w + 'px', height: f.h + 'px', transform: `translate(${f.x}px, ${f.y}px)`});
    const im = t.querySelector('img');
    const base = new Image(); base.alt = im ? im.alt : ''; base.decoding = 'async';
    base.src = im && im.currentSrc ? im.currentSrc : t.href;          // already decoded in the tile: shows at once
    el.appendChild(base);
    if (t.dataset.v && !reduce) {
      const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
      v.innerHTML = `<source src="${t.dataset.v}-m.webm${q(t)}" type='${AV1}'><source src="${t.dataset.v}-m.mp4${q(t)}" type='${HEVC}'>`;
      v.addEventListener('playing', () => v.classList.add('on'), {once: true});
      el.appendChild(v);
    } else {
      const u = hiURL(t, f.w);
      const path = x => new URL(x, location.href).pathname;
      if (path(u) !== path(base.src)) {
        const hi = new Image(); hi.className = 'hi'; hi.alt = ''; hi.decoding = 'async'; hi.src = u;
        (hi.decode ? hi.decode() : Promise.resolve()).then(() => hi.classList.add('on')).catch(() => {});
        el.appendChild(hi);
      }
    }
    el.__f = f; el.__t = t;
    return el;
  }
  function label() {
    ct.textContent = pad2(i + 1) + ' / ' + pad2(list.length);
    cap.textContent = list[i].dataset.cap || '';
  }
  function show(k, dir) {
    if (busy && dir) return;
    i = (k + list.length) % list.length;
    const old = cur, el = slide(list[i]); cur = el;
    stage.appendChild(el); label();
    if (old && dir && !reduce) {
      const d = stage.clientWidth * .16 * dir, f = el.__f;
      busy = true;
      const ox = old.__dx || 0;
      old.animate([{transform: `translate(${old.__f.x + ox}px, ${old.__f.y}px)`, opacity: 1}, {transform: `translate(${old.__f.x - d}px, ${old.__f.y}px)`, opacity: 0}], {duration: 380, easing: EASE, fill: 'forwards'}).onfinish = () => old.remove();
      el.animate([{transform: `translate(${f.x + d}px, ${f.y}px)`, opacity: 0}, {transform: `translate(${f.x}px, ${f.y}px)`, opacity: 1}], {duration: 380, easing: EASE}).onfinish = () => { busy = false; };
    } else if (old) old.remove();
    prefetch(list[(i + 1) % list.length]); prefetch(list[(i - 1 + list.length) % list.length]);
  }
  function open(t) {
    const g = t.closest('[data-list]');
    list = ((g && g.__items) || (g ? [...g.querySelectorAll('a.m')] : [t])).filter(x => !x.hidden);
    from = t; document.documentElement.style.overflow = 'hidden';
    lb.classList.add('open'); lb.classList.remove('idle');
    show(list.indexOf(t), 0);
    if (!reduce) {                                       // grow out of the tile
      const r = t.getBoundingClientRect(), s = stage.getBoundingClientRect(), f = cur.__f;
      const k = r.width / f.w, dx = r.left + r.width / 2 - (s.left + f.x + f.w / 2), dy = r.top + r.height / 2 - (s.top + f.y + f.h / 2);
      cur.animate([{transform: `translate(${f.x + dx}px, ${f.y + dy}px) scale(${k})`, opacity: .5}, {transform: `translate(${f.x}px, ${f.y}px) scale(1)`, opacity: 1}], {duration: 460, easing: EASE});
    }
    try { history.pushState({lb: 1}, ''); } catch (err) {}
    lb.querySelector('.x').focus({preventScroll: true});
    schedule(); idle();
  }
  function shut() {
    if (!lbOpen()) return;
    const el = cur; cur = null; lb.classList.remove('open');
    if (el) {
      const t = el.__t, r = t.getBoundingClientRect(), s = stage.getBoundingClientRect(), f = el.__f;
      const onScreen = r.bottom > 0 && r.top < innerHeight && !t.hidden;
      const tx = f.x + r.left + r.width / 2 - (s.left + f.x + f.w / 2), ty = f.y + r.top + r.height / 2 - (s.top + f.y + f.h / 2);
      const end = onScreen && !reduce ? {transform: `translate(${tx}px, ${ty}px) scale(${r.width / f.w})`, opacity: .3}
        : {transform: `translate(${f.x}px, ${f.y + (el.__dy || 0)}px) scale(.96)`, opacity: 0};
      el.querySelectorAll('video').forEach(v => v.pause());
      if (reduce) el.remove(); else el.animate([{transform: getComputedStyle(el).transform, opacity: getComputedStyle(el).opacity}, end], {duration: 360, easing: EASE, fill: 'forwards'}).onfinish = () => el.remove();
    }
    document.documentElement.style.overflow = '';
    from && from.focus({preventScroll: true});
    schedule();
  }
  function close() { if (history.state && history.state.lb) history.back(); else shut(); }
  addEventListener('popstate', () => { if (lbOpen()) shut(); });

  document.addEventListener('click', e => {
    const t = e.target.closest('a.m'); if (!t || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault(); open(t);
  });
  if (fine) document.addEventListener('pointerover', e => { const t = e.target.closest && e.target.closest('a.m'); if (t) prefetch(t); }, {passive: true});
  lb.querySelector('.pv').addEventListener('click', () => show(i - 1, -1));
  lb.querySelector('.nx').addEventListener('click', () => show(i + 1, 1));
  lb.querySelector('.x').addEventListener('click', close);
  stage.addEventListener('click', e => { if (e.target === stage && !dragged) close(); });
  addEventListener('keydown', e => {
    if (!lbOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft') show(i - 1, -1);
    else if (e.key === 'ArrowRight') show(i + 1, 1);
    else if (e.key === 'Tab') {
      const f = [...lb.querySelectorAll('button')].filter(b => b.offsetParent), a = f.indexOf(document.activeElement);
      e.preventDefault(); f[(a + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
    idle();
  });
  addEventListener('resize', () => { if (!lbOpen() || !cur) return; const f = fit(cur.__t); cur.__f = f; Object.assign(cur.style, {width: f.w + 'px', height: f.h + 'px', transform: `translate(${f.x}px, ${f.y}px)`}); });

  // controls fade after a few still seconds (pointer devices); tap toggles them on touch
  let idleT = 0;
  function idle() { lb.classList.remove('idle'); clearTimeout(idleT); if (fine) idleT = setTimeout(() => lbOpen() && lb.classList.add('idle'), 2600); }
  lb.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') idle(); });

  // drag: sideways to move, down to close (follows the finger)
  let sx = 0, sy = 0, dx = 0, dy = 0, axis = '', down = false, dragged = false, t0 = 0;
  stage.addEventListener('pointerdown', e => {
    if (e.button || !cur || busy || e.target.closest('button')) return;
    down = true; dragged = false; axis = ''; sx = e.clientX; sy = e.clientY; dx = dy = 0; t0 = performance.now();
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    if (!down || !cur) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    if (!axis && Math.hypot(dx, dy) > 8) axis = Math.abs(dx) > Math.abs(dy) ? 'x' : (dy > 0 ? 'y' : 'n');
    if (!axis || axis === 'n') return;
    dragged = true;
    const f = cur.__f;
    if (axis === 'x') { cur.__dx = dx; cur.style.transform = `translate(${f.x + dx}px, ${f.y}px)`; cur.style.opacity = 1 - Math.min(.5, Math.abs(dx) / stage.clientWidth); }
    else { const k = Math.min(1, dy / stage.clientHeight); cur.__dy = dy; cur.style.transform = `translate(${f.x}px, ${f.y + dy}px) scale(${1 - k * .18})`; lb.style.backgroundColor = `rgba(5,3,4,${.97 * (1 - k * .9)})`; }
  });
  const release = () => {
    if (!down) return; down = false;
    if (!cur || !axis || axis === 'n') return;
    const v = (axis === 'x' ? dx : dy) / Math.max(1, performance.now() - t0), f = cur.__f;
    lb.style.backgroundColor = '';
    if (axis === 'x' && (Math.abs(dx) > 70 || Math.abs(v) > .5)) show(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    else if (axis === 'y' && (dy > 110 || v > .6)) close();
    else { cur.animate([{transform: cur.style.transform, opacity: cur.style.opacity || 1}, {transform: `translate(${f.x}px, ${f.y}px)`, opacity: 1}], {duration: 300, easing: EASE});
      cur.style.transform = `translate(${f.x}px, ${f.y}px)`; cur.style.opacity = ''; cur.__dx = cur.__dy = 0; }
    setTimeout(() => { dragged = false; }, 0);
  };
  stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', release);
  if (!fine) stage.addEventListener('click', e => { if (e.target !== stage && !dragged) lb.classList.toggle('idle'); });
})();
