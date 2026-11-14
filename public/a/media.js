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

  // ── in-page links glide (eased, length scaled to the distance) and stop short of the top edge ──
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    const id = a.getAttribute('href').slice(1), el = id ? document.getElementById(id) : null; if (!el) return;
    e.preventDefault();
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    const from = scrollY, to = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, from + el.getBoundingClientRect().top - margin));
    try { history.pushState(null, '', '#' + id); } catch (err) {}
    if (reduce) { scrollTo(0, to); return; }
    const d = to - from, T = Math.min(1300, Math.max(550, Math.abs(d) * .45)), t0 = performance.now();
    const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    const step = now => { const k = Math.min(1, (now - t0) / T); scrollTo(0, from + d * ease(k)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });

  // ── viewer ──
  function lbOpen() { return document.documentElement.classList.contains('lb-lock'); }
  // The tile's own image morphs into the viewer: one element moves from the tile's box (cropped exactly like the tile:
  // scaled to cover it, clipped to it) to the full uncropped image, and back again on close. Moving between pieces
  // slides them sideways; on phones the slide follows the finger, and a downward drag closes.
  const lb = document.createElement('div');
  lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Viewer');
  lb.innerHTML = `<div class="lb-bg"></div><div class="lb-stage"></div>
    <div class="lb-ui"><p class="lb-cap"><span class="what"></span><span class="when"></span></p>
    <button class="lb-x" type="button" aria-label="Close">${svg(ICON.x, 1.25)}</button>
    <span class="lb-g l" aria-hidden="true">${svg(ICON.l, 1.25)}</span><span class="lb-g r" aria-hidden="true">${svg(ICON.r, 1.25)}</span>
    <button class="lb-sr pv" type="button" aria-label="Previous">${svg(ICON.l)}</button><button class="lb-sr nx" type="button" aria-label="Next">${svg(ICON.r)}</button></div>`;
  document.body.appendChild(lb);
  const stage = lb.querySelector('.lb-stage'), bg = lb.querySelector('.lb-bg'), what = lb.querySelector('.what'), when = lb.querySelector('.when');
  const cap = lb.querySelector('.lb-cap'), gl = lb.querySelector('.lb-g.l'), gr = lb.querySelector('.lb-g.r');
  let list = [], i = 0, cur = null, busy = false, opener = null;
  const OPEN = {duration: 560, easing: 'cubic-bezier(.22,.8,.18,1)'}, SLIDE = {duration: 480, easing: 'cubic-bezier(.25,.8,.25,1)'};

  function fit(t) {                                  // the image's box: as large as the screen allows, thin borders
    const W = innerWidth, H = innerHeight, ar = (+t.dataset.w || 16) / (+t.dataset.h || 9);
    const wide = W > 640, side = wide ? 16 : 0, top = wide ? 16 : 0, bot = wide ? 46 : 0;
    let w = Math.min(W - side * 2, (H - top - bot) * ar), h = w / ar;
    if (!wide && h > H - 120) { h = H - 120; w = h * ar; }
    return {w, h, x: (W - w) / 2, y: top + (H - top - bot - h) / 2};
  }
  const place = (el, f, dx = 0, dy = 0, k = 1) => { el.style.transform = `translate(${f.x + dx}px, ${f.y + dy}px) scale(${k})`; };
  function tileState(t, f) {                          // where the slide must start/end to look exactly like the tile
    const r = t.getBoundingClientRect(), s = Math.max(r.width / f.w, r.height / f.h);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const iw = (f.w - r.width / s) / 2, ih = (f.h - r.height / s) / 2, rad = (parseFloat(getComputedStyle(t).borderRadius) || 0) / s;
    return {transform: `translate(${cx - f.w / 2}px, ${cy - f.h / 2}px) scale(${s})`, clipPath: `inset(${ih}px ${iw}px ${ih}px ${iw}px round ${rad}px)`};
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
    el.className = 'lb-slide'; el.style.width = f.w + 'px'; el.style.height = f.h + 'px'; place(el, f);
    const im = t.querySelector('img');
    const base = new Image(); base.alt = im ? im.alt : ''; base.decoding = 'sync';
    base.src = im && im.currentSrc ? im.currentSrc : t.href;           // the tile's own (already decoded) pixels
    el.appendChild(base);
    if (t.dataset.v && !reduce) {
      const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
      v.innerHTML = `<source src="${t.dataset.v}-m.webm${q(t)}" type='${AV1}'><source src="${t.dataset.v}-m.mp4${q(t)}" type='${HEVC}'>`;
      const tv = t.querySelector('video'); if (tv && !tv.paused) { try { v.currentTime = tv.currentTime; } catch (e) {} }
      v.addEventListener('playing', () => v.classList.add('on'), {once: true});
      el.appendChild(v);
    } else {
      const u = hiURL(t, f.w), path = x => new URL(x, location.href).pathname;
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
    const t = list[i];
    what.textContent = t.dataset.cap || '';
    when.textContent = t.dataset.date ? t.dataset.date : '';
    frame(fit(t));
  }
  function frame(f) {                                 // caption under the image's bottom-left corner; nav hints beside it
    const below = f.y + f.h + 12, inside = below + 22 > innerHeight - 6;
    cap.classList.toggle('in', inside);
    cap.style.left = Math.max(14, f.x + (inside ? 14 : 0)) + 'px';
    cap.style.top = (inside ? f.y + f.h - 34 : below) + 'px';
    cap.style.maxWidth = Math.max(160, f.w - (inside ? 28 : 0)) + 'px';
    const gut = f.x, show = list.length > 1 && gut >= 48;
    for (const [el, x] of [[gl, gut / 2], [gr, innerWidth - gut / 2]]) {
      el.style.display = show ? '' : 'none';
      el.style.transform = `translate(${x - 14}px, ${f.y + f.h / 2 - 14}px)`;
    }
  }
  function show(k, dir) {                             // dir: -1 / 1 slide sideways; 0 just place
    if (busy || (dir && list.length < 2)) return;
    i = (k + list.length) % list.length;
    const old = cur, el = slide(list[i]); cur = el;
    stage.appendChild(el); label();
    if (old && dir) {
      if (reduce) { old.remove(); }
      else {
        busy = true;
        const W = innerWidth, of = old.__f, nf = el.__f, ox = old.__dx || 0;
        old.animate([{transform: `translate(${of.x + ox}px, ${of.y}px)`}, {transform: `translate(${of.x - dir * W}px, ${of.y}px)`}], {...SLIDE, fill: 'forwards'}).onfinish = () => old.remove();
        el.animate([{transform: `translate(${nf.x + dir * W + ox}px, ${nf.y}px)`}, {transform: `translate(${nf.x}px, ${nf.y}px)`}], SLIDE).onfinish = () => { busy = false; };
      }
      swapHidden(old.__t, list[i]);
    } else if (old) old.remove();
    prefetch(list[(i + 1) % list.length]); prefetch(list[(i - 1 + list.length) % list.length]);
  }
  function swapHidden(prev, next) { if (prev) prev.classList.remove('away'); if (next) next.classList.add('away'); }

  function open(t) {
    const g = t.closest('[data-list]');
    list = g && g.hasAttribute('data-solo') ? [t] : ((g && g.__items) || (g ? [...g.querySelectorAll('a.m')] : [t])).filter(x => !x.hidden);
    lb.classList.toggle('solo', list.length < 2);
    opener = t; lb.classList.add('open'); document.documentElement.classList.add('lb-lock');
    show(list.indexOf(t), 0);
    t.classList.add('away');                           // the tile's image is now the one in the viewer
    if (!reduce) {
      const st = tileState(t, cur.__f), f = cur.__f;
      cur.animate([st, {transform: `translate(${f.x}px, ${f.y}px) scale(1)`, clipPath: 'inset(0px 0px 0px 0px round 2px)'}], OPEN);
      bg.animate([{opacity: 0}, {opacity: 1}], {duration: 420, easing: 'ease-out'});
      lb.querySelector('.lb-ui').animate([{opacity: 0}, {opacity: 0, offset: .5}, {opacity: 1}], {duration: 700});
    }
    try { history.pushState({lb: 1}, ''); } catch (err) {}
    lb.querySelector('.lb-x').focus({preventScroll: true});
    schedule(); idle();
  }
  function shut() {
    if (!lbOpen() || !cur) return;
    const el = cur, t = el.__t; cur = null;
    el.querySelectorAll('video').forEach(v => v.pause());
    const done = () => { el.remove(); t.classList.remove('away'); lb.classList.remove('open', 'closing'); document.documentElement.classList.remove('lb-lock'); schedule(); };
    if (reduce || t.hidden) { done(); }
    else {
      let r = t.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) {        // its tile is off screen: bring it into view behind the viewer first
        scrollTo({top: scrollY + r.top + r.height / 2 - innerHeight / 2, behavior: 'instant'});
      }
      lb.classList.add('closing');
      el.animate([tileState(t, el.__f)], {...OPEN, duration: 480, fill: 'forwards'}).onfinish = done;
      bg.animate([{opacity: getComputedStyle(bg).opacity}, {opacity: 0}], {duration: 420, easing: 'ease-in', fill: 'forwards'}).onfinish = () => bg.getAnimations().forEach(a => a.cancel());
    }
    opener && opener !== t ? t.focus({preventScroll: true}) : opener && opener.focus({preventScroll: true});
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
  addEventListener('resize', () => { if (!lbOpen() || !cur) return; const f = fit(cur.__t); cur.__f = f; cur.style.width = f.w + 'px'; cur.style.height = f.h + 'px'; place(cur, f); frame(f); });

  // pointer: the outer thirds of the screen move back / forward (the cursor turns into a thin arrow), the middle closes
  const zone = x => {
    if (!cur || list.length < 2) return 0;
    const f = cur.__f, edge = Math.min(140, f.w * .12);
    return x < f.x + edge ? -1 : x > f.x + f.w - edge ? 1 : 0;
  };
  stage.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const z = zone(e.clientX); stage.dataset.z = z < 0 ? 'l' : z > 0 ? 'r' : 'c'; idle(); });
  let idleT = 0;
  function idle() { lb.classList.remove('idle'); clearTimeout(idleT); if (fine) idleT = setTimeout(() => lbOpen() && lb.classList.add('idle'), 2400); }

  // touch: drag sideways to move (the slide follows the finger), drag down to close; tap toggles the caption
  let sx = 0, sy = 0, dx = 0, dy = 0, axis = '', down = false, moved = false, t0 = 0, ptype = '';
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
    moved = true;
    const f = cur.__f;
    if (axis === 'x') { cur.__dx = dx; place(cur, f, dx); }
    else { const k = Math.min(1, dy / innerHeight); place(cur, f, 0, dy, 1 - k * .25); bg.style.opacity = String(1 - k * 1.3); }
  });
  const release = (e) => {
    if (!down) return; down = false;
    const f = cur && cur.__f;
    if (ptype === 'mouse' || !axis || axis === 'n') {          // a click / tap
      if (!moved && cur) {
        if (ptype === 'mouse') { const z = zone(e.clientX); if (z) show(i + z, z); else close(); }
        else { const z = zone(e.clientX); if (z && e.clientX < cur.__f.x || z && e.clientX > cur.__f.x + cur.__f.w) show(i + z, z); else lb.classList.toggle('idle'); }
      }
      return;
    }
    const v = (axis === 'x' ? dx : dy) / Math.max(1, performance.now() - t0);
    if (axis === 'x' && (Math.abs(dx) > 70 || Math.abs(v) > .45)) show(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    else if (axis === 'y' && (dy > 110 || v > .55)) { bg.style.opacity = ''; close(); }
    else if (cur) { cur.__dx = 0; cur.animate([{transform: cur.style.transform}, {transform: `translate(${f.x}px, ${f.y}px) scale(1)`}], {duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)'}); place(cur, f); bg.style.opacity = ''; }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', () => { down = false; if (cur) { place(cur, cur.__f); cur.__dx = 0; } bg.style.opacity = ''; });
})();
