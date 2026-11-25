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
    $$('.vt-rise-in').forEach((el) => { el.classList.remove('vt-rise-in'); el.style.removeProperty('--d'); });
  };
  const imgOf = (el) => (el.tagName === 'IMG' ? el : el.querySelector('img'));

  function leave(here, there) {
    const glass = $('#glass'); if (glass && !seen(glass)) { glass.style.viewTransitionName = 'none'; named.push(glass); }
    const rec = { from: here, keys: {}, preview: null };
    for (const [k, el] of slots(here)) {
      if (!relevant(k, here, there) || !seen(el) || named.length > 40) continue;
      if (k.startsWith('t-') && here.k === 'home' && !el.closest(there.k === 'renders' ? '#art' : '#gallery')) continue;
      const r = el.getBoundingClientRect(), info = { ar: r.width / r.height };
      if (isText(k)) { info.text = norm(el.textContent); info.lines = lines(el); }
      const im = imgOf(el); if (im && im.currentSrc) info.src = im.currentSrc;
      if (k.startsWith('t-')) { const e = edgeOf(el); if (e) info.edge = e; }
      name(el, k, null); rec.keys[k] = info;
    }
    if (here.k === 'home' && (there.k === 'renders' || there.k === 'gallery')) {
      const g = $((there.k === 'renders' ? '#art' : '#gallery') + ' .preview .grid'); if (g) rec.preview = g.getBoundingClientRect().top;
    }
    try { sessionStorage.setItem(ST, JSON.stringify(rec)); } catch (e) { /* no pairing: a plain transition */ }
  }

  function arrive(here, there, traverse) {
    let rec = null; try { rec = JSON.parse(sessionStorage.getItem(ST) || 'null'); sessionStorage.removeItem(ST); } catch (e) { /* none */ }
    if (!rec || rec.from.k !== there.k) rec = { keys: {} };
    // "See all": the wall lands exactly where the preview was
    if (!traverse && rec.preview != null && (here.k === 'renders' || here.k === 'gallery')) {
      const w = $('main .wall');
      if (w) scrollTo(0, Math.max(0, w.getBoundingClientRect().top + scrollY - rec.preview));
    }
    const glass = $('#glass'); if (glass && !seen(glass)) { glass.style.viewTransitionName = 'none'; named.push(glass); }
    const mine = slots(here), matched = new Set();
    for (const [k, info] of Object.entries(rec.keys)) {
      const el = mine.get(k);
      if (!el || !seen(el) || named.length > 40) continue;
      if (isText(k) && (norm(el.textContent) !== info.text || lines(el) !== info.lines)) continue;   // would not match: leaves with the page
      const r = el.getBoundingClientRect();
      if (info.ar && Math.abs(r.width / r.height / info.ar - 1) > .03) continue;                       // not the same shape: it would stretch
      // the edge it wore (expand) or will wear (collapse)
      const edge = k.startsWith('t-') ? (here.k === 'home' ? edgeOf(el) : info.edge) : null;
      const im = imgOf(el);
      if (im && info.src) handoff(im, info.src);
      name(el, k, edge); matched.add(k);
    }
    // slots that found no partner leave with the page (their old capture fades out where it was)
    for (const k of Object.keys(rec.keys)) if (!matched.has(k)) css(`::view-transition-old(${k}){display:block !important;animation:calc(.16s * var(--vtk)) cubic-bezier(.4, 0, 1, 1) both vt-out !important}`);
    // the rest of the wall arrives band by band
    if (here.k === 'renders' || here.k === 'gallery') {
      const first = Math.min(...named.filter((el) => el.classList && el.classList.contains('m')).map((el) => el.getBoundingClientRect().top), innerHeight);
      $$('main .wall .m').filter((t) => !matched.has(tileKey(t)) && seen(t)).forEach((t) => {
        const d = Math.max(0, Math.min(.3, (t.getBoundingClientRect().top - first) / innerHeight * .35));
        t.style.setProperty('--d', d.toFixed(3) + 's'); t.classList.add('vt-rise-in');
      });
    }
  }
  // the moving picture shows the image the old page had already decoded; responsive images come back afterwards
  function handoff(im, src) {
    const pic = im.parentElement, srcs = pic && pic.tagName === 'PICTURE' ? $$('source', pic) : [];
    const saved = { ss: im.getAttribute('srcset'), srcs: srcs.map((s) => s.getAttribute('srcset')) };
    srcs.forEach((s) => s.removeAttribute('srcset')); im.removeAttribute('srcset');
    im.loading = 'eager'; im.decoding = 'sync'; im.src = src; im.classList.add('ld');
    window.__vtDone.then(() => setTimeout(() => {
      srcs.forEach((s, i) => saved.srcs[i] && s.setAttribute('srcset', saved.srcs[i]));
      if (saved.ss) im.setAttribute('srcset', saved.ss); im.decoding = 'async';
    }, 400));
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
