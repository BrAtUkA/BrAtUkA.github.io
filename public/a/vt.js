/* Page transitions: the engine (a/vt.css holds the motion). Loaded in each page's head so its listeners are in
   place before the first render.

   Shared pieces are carried, never crossfaded. Every page lists its slots under shared keys:
     h-renders / h-gallery / h-projects  a section heading and its page's counterpart (same text, same style)
     t-<piece>                           a tile; previews and walls share one proportional pattern, so same crop
     cov-<slug>                          a project's cover picture (the card shows the same file)
     ttl-, kick-, tag-<slug>             a project's title, kicker and tagline (same text, style and line breaks)
   The leaving page names its slots that matter for the destination and records them (text, line count, decoded
   image, the preview's soft edge); the arriving page names its own slots only where the key, text and line count
   match. Slots left without a partner leave with the page. Only the new capture of a pair is drawn (vt.css).

   Also: html.vt while capturing/revealing (hover styles and CSS transitions off); transition types per navigation;
   the old glass held until the new page's glass draws (glass:ready); "See all" lands with the wall exactly where
   the preview was; window.__vtDone for deferred heavy work; ?vtslow=5 to review in slow motion. */
(() => {
  let done; window.__vtDone = new Promise((r) => { done = r; });
  const html = document.documentElement;
  // Pages are prepared before the click: hovering a link to another page of the site (or pressing on it) has Chrome
  // prerender it, so a transition starts on a page that is already loaded, laid out and painted. Not with Save-Data.
  try {
    if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules') && !(navigator.connection && navigator.connection.saveData)) {
      const sr = document.createElement('script'); sr.type = 'speculationrules';
      sr.textContent = JSON.stringify({ prerender: [{ where: { and: [{ href_matches: '/*' }, { not: { href_matches: '/a/*' } }, { not: { href_matches: '*.*' } },
        { not: { selector_matches: '[target=_blank], .m, [download]' } }] }, eagerness: 'moderate' }] });
      document.head.appendChild(sr);
    }
  } catch (e) { /* no prerendering */ }
  // Where the browser doesn't prerender (other browsers, Chrome's limits, Save-Data aside): on hover or press, the
  // destination's first pictures are fetched and decoded, so they are in the cache when its page draws and nothing
  // loads in the middle of the transition.
  const warmed = new Set();
  function warm(a) {
    if (!a || a.target === '_blank' || a.hasAttribute('download') || (navigator.connection && navigator.connection.saveData)) return;
    let u; try { u = new URL(a.href, location.href); } catch (e) { return; }
    if (u.origin !== location.origin || /^\/a\//.test(u.pathname) || /\.[a-z0-9]{2,5}$/i.test(u.pathname) || u.pathname === location.pathname || warmed.has(u.pathname)) return;
    warmed.add(u.pathname);
    fetch(u.pathname, { credentials: 'same-origin' }).then((r) => (r.ok ? r.text() : '')).then((t) => {
      if (!t) return;
      const d = new DOMParser().parseFromString(t, 'text/html'), abs = (v) => v.split(',').map((p) => { const [s, ...w] = p.trim().split(/\s+/); return [new URL(s, u).href, ...w].join(' '); }).join(', ');
      [...d.querySelectorAll('main img')].filter((im) => im.getAttribute('loading') !== 'lazy').slice(0, 18).forEach((s) => {
        const im = new Image(), pic = s.parentElement && s.parentElement.tagName === 'PICTURE' ? document.createElement('picture') : null;
        if (pic) s.parentElement.querySelectorAll('source').forEach((so) => { const n = document.createElement('source');
          ['type', 'media', 'sizes'].forEach((k) => so.hasAttribute(k) && n.setAttribute(k, so.getAttribute(k))); if (so.getAttribute('srcset')) n.srcset = abs(so.getAttribute('srcset')); pic.appendChild(n); });
        if (s.getAttribute('sizes')) im.sizes = s.getAttribute('sizes');
        if (s.getAttribute('srcset')) im.srcset = abs(s.getAttribute('srcset'));
        if (pic) pic.appendChild(im);
        im.src = new URL(s.getAttribute('src') || '', u).href; im.decode().catch(() => {});
      });
    }).catch(() => {});
  }
  let hov = 0;
  const target = (e) => e.target && e.target.closest && e.target.closest('a[href]');
  addEventListener('pointerover', (e) => { const a = target(e); clearTimeout(hov); if (a) hov = setTimeout(() => warm(a), 70); }, { passive: true });
  addEventListener('pointerdown', (e) => warm(target(e)), { passive: true });
  addEventListener('focusin', (e) => warm(target(e)));
  if (!('onpagereveal' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return; }
  try {
    const q = new URLSearchParams(location.search).get('vtslow');
    if (q) sessionStorage.setItem('vtslow', q);
    const k = +sessionStorage.getItem('vtslow') || 1; if (k !== 1) html.style.setProperty('--vtk', k);
  } catch (e) { /* storage blocked: normal speed */ }

  const page = (u) => {
    const p = new URL(u, location.href).pathname.replace(/index\.html$/, '');
    const m = p.match(/\/projects\/([^/]+)\/$/); if (m) return { k: 'proj', s: m[1] };
    if (/\/projects\/$/.test(p)) return { k: 'projects' };
    if (/\/renders\/$/.test(p)) return { k: 'renders' };
    if (/\/gallery\/$/.test(p)) return { k: 'gallery' };
    return { k: 'home' };
  };
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const seen = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 && r.height > 0; };
  const near = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > -innerHeight * .5 && r.top < innerHeight * 1.5; };
  const tileKey = (t) => 't-' + (t.dataset.full || '').split('/').pop().replace(/[^a-z0-9-]/gi, '-');
  const slugOf = (a) => ((a.getAttribute('href') || '').match(/projects\/([^/]+)\/$/) || [])[1];
  const isText = (k) => /^(h-|ttl-|kick-|tag-)/.test(k);
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; };
  const ST = 'vt-pairs';

  // every slot this page has: key -> element
  function slots(here) {
    const S = new Map(), add = (k, el) => { if (el && k) S.set(k, el); };
    if (here.k === 'home') {
      add('h-projects', $('#work .h-t')); add('h-renders', $('#art .h-t')); add('h-gallery', $('#gallery .h-t'));
      $$('#art .m, #gallery .m').forEach((t) => add(tileKey(t), t));
    }
    if (here.k === 'renders' || here.k === 'gallery') {
      add('h-' + here.k, $('.hero .intro h1 .vt-t'));
      $$('main .wall .m').forEach((t) => add(tileKey(t), t));
    }
    if (here.k === 'projects') add('h-projects', $('.p-hero h1 .vt-t'));
    if (here.k === 'home' || here.k === 'projects') {
      $$('a.cs').forEach((a) => { const s = slugOf(a); if (!s) return;
        add('cov-' + s, $('img.cv', a)); add('ttl-' + s, $('h3 .vt-t', a)); add('kick-' + s, $('.mono .vt-t', a)); add('tag-' + s, $('.tg .vt-t', a)); });
      $$('.cs-rest a').forEach((a) => { const s = slugOf(a); if (s && !S.has('ttl-' + s)) add('ttl-' + s, $('strong', a)); });
    }
    if (here.k === 'proj') {
      add('cov-' + here.s, $('.p-cover .m')); add('ttl-' + here.s, $('.p-hero h1 .vt-t'));
      add('kick-' + here.s, $('.p-kick .vt-t')); add('tag-' + here.s, $('.p-tag .vt-t'));
      $$('.p-nx').forEach((a) => { const s = slugOf(a); if (s) add('ttl-' + s, $('strong', a)); });
    }
    return S;
  }
  // which of the leaving page's slots can have a partner on the destination
  function relevant(key, here, there) {
    if (key === 'h-renders') return there.k === 'renders' || there.k === 'home';
    if (key === 'h-gallery') return there.k === 'gallery' || there.k === 'home';
    if (key === 'h-projects') return there.k === 'projects' || there.k === 'home';
    if (key.startsWith('t-')) return (here.k === 'home' && (there.k === 'renders' || there.k === 'gallery')) || ((here.k === 'renders' || here.k === 'gallery') && there.k === 'home');
    const s = key.replace(/^(cov|ttl|kick|tag)-/, '');
    if (there.k === 'proj') return s === there.s && (here.k !== 'proj' || key.startsWith('ttl-'));
    if (here.k === 'proj') return s === here.s && (there.k === 'home' || there.k === 'projects');
    return false;
  }
  // the home previews' soft bottom edge: its strength at a tile's top and bottom (1 = untouched)
  function edgeOf(t) {
    const g = t.closest('.preview .grid'); if (!g) return null;
    const r = g.getBoundingClientRect(), tr = t.getBoundingClientRect(), F = parseFloat(getComputedStyle(g.parentElement).getPropertyValue('--fade')) || 200;
    const a = (y) => { const d = r.bottom - y; return d >= F ? 1 : d >= 46 ? .18 + .82 * (d - 46) / (F - 46) : Math.max(0, .18 * d / 46); };
    const a0 = a(tr.top), a1 = a(tr.bottom);
    return a0 > .995 && a1 > .995 ? null : [a0, a1];
  }

  const named = [];
  let dyn = null;
  const css = (rule) => { if (!dyn) { dyn = document.createElement('style'); document.head.appendChild(dyn); } dyn.textContent += rule + '\n'; };
  const name = (el, k, edge) => {
    el.style.viewTransitionName = k;
    el.style.viewTransitionClass = 'vt-c' + (k.startsWith('t-') ? ' vt-tile' : '') + (edge ? ' vt-fade' : '');
    if (edge) css(`::view-transition-new(${k}){--a0:${edge[0].toFixed(3)};--a1:${edge[1].toFixed(3)}}`);
    named.push(el);
  };
  const clear = () => {
    named.splice(0).forEach((el) => { el.style.viewTransitionName = ''; el.style.viewTransitionClass = ''; });
    if (dyn) { dyn.remove(); dyn = null; }
    $$('.vt-deal').forEach((el) => { el.classList.remove('vt-deal'); ['--d', '--fx', '--fy'].forEach((v) => el.style.removeProperty(v)); });
  };
  const imgOf = (el) => (el.tagName === 'IMG' ? el : el.querySelector('img'));

  // Loops carried to the other page: the frame on screen is shown there while it moves, and the loop resumes from it.
  // On press the loops are paused and their frames encoded off the main thread, ready before the click lands;
  // without a press (Back, keyboard) one small frame is taken at the swap, the cheapest that still matches.
  const pre = new Map();
  const crop = (v, t, max) => {
    const r = t.getBoundingClientRect(), cw = Math.max(16, Math.min(max, Math.round(r.width * Math.min(devicePixelRatio || 1, 1.5)))), ch = Math.max(16, Math.round(cw * r.height / r.width));
    const vw = v.videoWidth, vh = v.videoHeight, sc = Math.max(cw / vw, ch / vh), sw = cw / sc, sh = ch / sc;
    return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh, cw, ch };
  };
  const live = (t) => { const v = t.querySelector('video'); return v && v.classList.contains('on') && v.readyState >= 2 && v.videoWidth && seen(t) ? v : null; };
  function grab(t) {
    const v = live(t); if (!v || pre.has(t) || !window.createImageBitmap || !window.OffscreenCanvas) return;
    v.pause(); const c = crop(v, t, 1200), at = v.currentTime; pre.set(t, null);
    createImageBitmap(v, c.sx, c.sy, c.sw, c.sh, { resizeWidth: c.cw, resizeHeight: c.ch, resizeQuality: 'medium' })
      .then((bm) => { const oc = new OffscreenCanvas(c.cw, c.ch); oc.getContext('2d').drawImage(bm, 0, 0); bm.close(); return oc.convertToBlob({ type: 'image/jpeg', quality: .86 }); })
      .then((b) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); }))
      .then((src) => { if (pre.has(t)) pre.set(t, { src, vt: at }); }).catch(() => pre.set(t, null));
  }
  function still(t, info) {
    const p = pre.get(t); if (p) { info.src = p.src; info.vt = p.vt; return true; }
    const v = live(t); if (!v) return false;
    try {
      const c = crop(v, t, 640), cv = document.createElement('canvas'); cv.width = c.cw; cv.height = c.ch;
      cv.getContext('2d').drawImage(v, c.sx, c.sy, c.sw, c.sh, 0, 0, c.cw, c.ch);
      info.src = cv.toDataURL('image/jpeg', .82); info.vt = v.currentTime; return true;
    } catch (e) { return false; }
  }
  // pressing a link to a page that takes tiles: hold the loops that would be carried
  addEventListener('pointerdown', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]'); if (!a || e.button) return;
    const here = page(location.href), there = page(a.href);
    const tiles = here.k === 'home' && (there.k === 'renders' || there.k === 'gallery') ? $$((there.k === 'renders' ? '#art' : '#gallery') + ' .m')
      : (here.k === 'renders' || here.k === 'gallery') && there.k === 'home' ? $$('main .wall .m') : [];
    const held = tiles.filter((t) => live(t)).slice(0, 3); if (!held.length) return;
    held.forEach(grab);
    // no navigation after all (dragged off, cancelled): play on
    setTimeout(() => {
      if (document.visibilityState !== 'visible' || html.classList.contains('vt')) return;
      held.forEach((t) => { const v = t.querySelector('video'); if (v && v.paused) v.play().catch(() => {}); });
      pre.clear();
    }, 1600);
  }, { passive: true, capture: true });
  function leave(here, there) {
    const glass = $('#glass'), gs = !!glass && seen(glass); if (glass && !gs) { glass.style.viewTransitionName = 'none'; named.push(glass); }
    const rec = { from: here, keys: {}, preview: null, head: null, glass: gs };
    let frames = 0;
    for (const [k, el] of slots(here)) {
      if (!relevant(k, here, there) || !seen(el) || named.length > 40) continue;
      if (k.startsWith('t-') && here.k === 'home' && !el.closest(there.k === 'renders' ? '#art' : '#gallery')) continue;
      const r = el.getBoundingClientRect(), info = { ar: r.width / r.height };
      if (k.startsWith('t-')) info.r = [r.left, r.top, r.width, r.height];
      if (isText(k)) { info.text = norm(el.textContent); info.lines = lines(el); }
      const im = imgOf(el); if (im && im.currentSrc) info.src = im.currentSrc;
      if (k.startsWith('t-')) { const e = edgeOf(el); if (e) info.edge = e; if (pre.get(el) || frames < 1) { if (still(el, info) && !pre.get(el)) frames++; } }
      name(el, k, null); rec.keys[k] = info;
    }
    if (here.k === 'home' && (there.k === 'renders' || there.k === 'gallery')) {
      const sec = there.k === 'renders' ? '#art' : '#gallery', g = $(sec + ' .preview .grid'), h = $(sec + ' .h-t');
      if (g) rec.preview = g.getBoundingClientRect().top;
      if (h && seen(h) && h.getBoundingClientRect().top > 40) rec.head = h.getBoundingClientRect().top;
    }
    try { sessionStorage.setItem(ST, JSON.stringify(rec)); } catch (e) { /* no pairing: a plain transition */ }
  }

  function arrive(here, there, traverse) {
    let rec = null; try { rec = JSON.parse(sessionStorage.getItem(ST) || 'null'); sessionStorage.removeItem(ST); } catch (e) { /* none */ }
    if (!rec || rec.from.k !== there.k) rec = { keys: {} };
    // "See all": the page's title lands where the section heading was (so the title, its line and the wall are all on
    // screen and the preview only moves down a little as it grows); if the heading was out of view, the wall lands
    // exactly where the preview was
    if (!traverse && (here.k === 'renders' || here.k === 'gallery')) {
      const h = $('.hero .intro h1 .vt-t'), w = $('main .wall');
      const y = rec.head != null && h ? h.getBoundingClientRect().top + scrollY - rec.head : rec.preview != null && w ? w.getBoundingClientRect().top + scrollY - rec.preview : null;
      if (y != null) scrollTo(0, Math.max(0, y));
    }
    // the glass is carried only when both pages show it; otherwise it is part of the page (under its own words)
    const glass = $('#glass'); if (glass && (!seen(glass) || rec.glass === false)) { glass.style.viewTransitionName = 'none'; named.push(glass); }
    // the full pages' line and filter rise in as the page arrives (above the glass, never hidden under it)
    if (here.k === 'renders' || here.k === 'gallery') {
      [['vt-lede', $('.hero.sub .intro p')], ['vt-games', $('.hero.sub > .games')]].forEach(([n, el]) => {
        if (!el || !seen(el)) return; el.style.viewTransitionName = n; el.style.viewTransitionClass = 'vt-enter'; named.push(el); });
    }
    const mine = slots(here), matched = new Set();
    for (const [k, info] of Object.entries(rec.keys)) {
      const el = mine.get(k);
      if (!el || !(k.startsWith("t-") ? near(el) : seen(el)) || named.length > 40) continue;   // a tile may land just off screen (it slides out of view)
      if (isText(k) && (norm(el.textContent) !== info.text || lines(el) !== info.lines)) continue;   // would not match: leaves with the page
      const r = el.getBoundingClientRect();
      if (info.ar && Math.abs(r.width / r.height / info.ar - 1) > .03) continue;                       // not the same shape: it would stretch
      // the edge it wore (expand) or will wear (collapse)
      const edge = k.startsWith('t-') ? (here.k === 'home' ? edgeOf(el) : info.edge) : null;
      const im = imgOf(el);
      if (im && info.src) handoff(im, info.src);
      if (info.vt != null) {
        const v = el.querySelector && el.querySelector('video');
        if (v && v.dataset.ok) {        // a page back from the cache, its loop already loaded: hidden, moved to the frame shown, back once playing
          v.classList.remove('on'); v.pause(); try { v.currentTime = info.vt % (v.duration || 1e9); } catch (e) {}
          v.addEventListener('playing', () => v.classList.add('on'), { once: true });
        } else el.dataset.resume = info.vt.toFixed(3);   // a/media.js starts the loop from the frame shown
      }
      name(el, k, edge); matched.add(k);
    }
    // slots that found no partner leave with the page (their old capture fades out where it was), except wall tiles
    // coming home: those gather back under the preview they came out of
    const pv = here.k === 'home' && there.k !== 'home' ? $((there.k === 'renders' ? '#art' : '#gallery') + ' .preview .grid') : null;
    const block = pv && seen(pv) ? pv.getBoundingClientRect() : null;
    for (const [k, info] of Object.entries(rec.keys)) {
      if (matched.has(k)) continue;
      if (block && info.r) {
        const [x, y, w, h] = info.r, [dx, dy] = toward(block, x + w / 2, y + h / 2), n = 'vg-' + k;
        css(`@keyframes ${n}{70%{opacity:.15}to{transform:translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(.82);opacity:0}}`);
        css(`::view-transition-old(${k}){display:block !important;animation:calc(.3s * var(--vtk)) cubic-bezier(.5, 0, .75, .3) both ${n} !important}`);
      } else css(`::view-transition-old(${k}){display:block !important;animation:calc(.2s * var(--vtk)) cubic-bezier(.4, 0, 1, 1) both vt-out !important}`);
    }
    // "See all": the rest of the wall is dealt out from under the preview's edges, nearest first
    if ((here.k === 'renders' || here.k === 'gallery') && !traverse) {
      const rs = named.filter((el) => el.classList && el.classList.contains('m')).map((el) => el.getBoundingClientRect());
      if (rs.length) {
        const B = { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) };
        $$('main .wall .m').filter((t) => !matched.has(tileKey(t)) && seen(t)).forEach((t) => {
          const r = t.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, [dx, dy] = toward(B, cx, cy);
          const dist = Math.hypot(dx, dy);
          t.style.setProperty('--fx', (dx * .9).toFixed(1) + 'px'); t.style.setProperty('--fy', (dy * .9).toFixed(1) + 'px');
          t.style.setProperty('--d', Math.min(.28, dist / innerHeight * .32).toFixed(3) + 's'); t.classList.add('vt-deal');
        });
      }
    }
  }
  // from a point to the nearest point inside a box (zero if it is inside)
  function toward(B, x, y) { return [Math.min(Math.max(x, B.left), B.right) - x, Math.min(Math.max(y, B.top), B.bottom) - y]; }

  // the moving picture shows the image the old page had already decoded; responsive images come back afterwards
  function handoff(im, src) {
    const pic = im.parentElement, srcs = pic && pic.tagName === 'PICTURE' ? $$('source', pic) : [];
    const saved = { ss: im.getAttribute('srcset'), srcs: srcs.map((s) => s.getAttribute('srcset')) };
    srcs.forEach((s) => s.removeAttribute('srcset')); im.removeAttribute('srcset');
    im.loading = 'eager'; im.decoding = 'sync'; im.src = src; im.classList.add('ld');
    const back = () => { srcs.forEach((s, i) => saved.srcs[i] && s.setAttribute('srcset', saved.srcs[i])); if (saved.ss) im.setAttribute('srcset', saved.ss); im.decoding = 'async'; };
    // a loop's frame stays until the loop itself is playing over it (else the poster would flash in between)
    const v = src.startsWith('data:') && im.closest('.m') && im.closest('.m').querySelector('video');
    if (v) v.addEventListener('playing', () => setTimeout(back, 800), { once: true });
    else window.__vtDone.then(() => setTimeout(back, 400));
  }

  const ORDER = ['home', 'projects', 'proj', 'renders', 'gallery'];
  function types(from, to, traverse) {
    const t = [];
    if (to.k === 'proj' && from.k === 'proj') t.push('project-step');
    else if (to.k === 'proj') t.push('to-project');
    else if (from.k === 'proj') t.push('from-project');
    if ((from.k === 'renders' && to.k === 'gallery') || (from.k === 'gallery' && to.k === 'renders')) t.push('sibling');
    if (from.k === 'home' && (to.k === 'renders' || to.k === 'gallery')) t.push('expand');
    if (to.k === 'home' && (from.k === 'renders' || from.k === 'gallery')) t.push('collapse');
    t.push(traverse ? 'back' : 'forward', ORDER.indexOf(to.k) >= ORDER.indexOf(from.k) ? 'next' : 'prev');
    return t;
  }

  // the old glass is held until the new page's glass has drawn (or 0.9 s), then gives way
  function holdGlass(vt) {
    const g = $('#glass'); if (!g || g.style.viewTransitionName === 'none') return;
    let drawn = false; addEventListener('glass:ready', () => { drawn = true; }, { once: true });
    vt.ready.then(() => {
      const a = document.getAnimations().filter((x) => x.effect && x.effect.pseudoElement === '::view-transition-old(glass)');
      if (!a.length || drawn) return;
      a.forEach((x) => x.pause());
      const go = () => a.forEach((x) => { try { x.play(); } catch (e) {} });
      addEventListener('glass:ready', go, { once: true }); setTimeout(go, 900);
    }).catch(() => {});
  }

  addEventListener('pageswap', (e) => {
    if (!e.viewTransition || !e.activation || !e.activation.entry) return;
    html.classList.add('vt'); html.classList.remove('lb-on');
    const here = page(location.href), there = page(e.activation.entry.url), trav = e.activation.navigationType === 'traverse';
    leave(here, there);
    types(here, there, trav).forEach((t) => e.viewTransition.types.add(t));
  });
  addEventListener('pagereveal', (e) => {
    if (!e.viewTransition) { done(); return; }
    html.classList.add('vt');
    const act = navigation.activation, from = act && act.from;
    if (from && from.url) {
      const here = page(location.href), there = page(from.url), trav = act.navigationType === 'traverse';
      arrive(here, there, trav);
      types(there, here, trav).forEach((t) => e.viewTransition.types.add(t));
    }
    holdGlass(e.viewTransition);
    e.viewTransition.finished.finally(() => { clear(); html.classList.remove('vt'); done(); });
  });
  addEventListener('pageshow', (e) => { if (e.persisted) { clear(); html.classList.remove('vt'); } });   // back from the bfcache
})();
