/* Page transitions: the engine (a/vt.css holds the motion). Loaded in each page's head so its listeners are in
   place before the first render.
   - html.vt while a transition is captured or revealed: hover styles and CSS transitions are off, so a hovered card
     doesn't morph from red, and a cursor resting on the new page doesn't flash a hover mid-transition
   - names the pieces that reshape into their counterpart on the other page, for that one navigation only
   - types per navigation (route and direction) for the CSS: e.g. to-project, from-project, next, prev, sibling, back
   - holds the old glass until the new page's glass has drawn its first frame (hero.js fires glass:ready)
   - hands each moving picture's already-decoded image to its counterpart, so it lands sharp
   - window.__vtDone resolves once the transition is over: heavy work (turn frames, loop videos) waits for it
   - ?vtslow=5 slows everything down for review (kept for the session; ?vtslow=1 turns it off) */
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
  const seen = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; };
  const named = [];
  const name = (el, n, cls) => { if (!el || !seen(el) || named.length > 24) return; el.style.viewTransitionName = n; if (cls) el.style.viewTransitionClass = cls; named.push(el); };
  const clear = () => { named.splice(0).forEach((el) => { el.style.viewTransitionName = ''; el.style.viewTransitionClass = ''; }); };
  const tileKey = (t) => 't-' + (t.dataset.full || '').split('/').pop().replace(/[^a-z0-9-]/gi, '-');
  const ORDER = ['home', 'projects', 'proj', 'renders', 'gallery'];

  function types(here, there, leaving, traverse) {
    const from = leaving ? here : there, to = leaving ? there : here, t = [];
    if (to.k === 'proj' && from.k === 'proj') t.push('project-step');
    else if (to.k === 'proj') t.push('to-project');
    else if (from.k === 'proj') t.push('from-project');
    if ((from.k === 'renders' && to.k === 'gallery') || (from.k === 'gallery' && to.k === 'renders')) t.push('sibling');
    if (from.k === 'home' && (to.k === 'renders' || to.k === 'gallery')) t.push('expand');
    if (to.k === 'home' && (from.k === 'renders' || from.k === 'gallery')) t.push('collapse');
    const fwd = ORDER.indexOf(to.k) >= ORDER.indexOf(from.k);
    t.push(traverse ? 'back' : 'forward', fwd ? 'next' : 'prev');
    return t;
  }

  // here: this page; there: the other page; leaving: true in pageswap
  function pair(here, there, leaving) {
    const H = here.k, T = there.k;
    const glass = $('#glass'); if (glass && !seen(glass)) { glass.style.viewTransitionName = 'none'; named.push(glass); }
    if (H === 'home' && (T === 'renders' || T === 'gallery')) {
      const sec = $(T === 'renders' ? '#art' : '#gallery');
      name($('h2', sec), 'ttl');
      $$('.m', sec).forEach((t) => name(t, tileKey(t), 'vt-tile'));
    } else if ((H === 'renders' || H === 'gallery') && T === 'home') {
      name($('.hero .intro h1'), 'ttl');
      $$('main .m').filter(seen).slice(0, 20).forEach((t) => name(t, tileKey(t), 'vt-tile'));
    } else if (H === 'home' && T === 'projects') {
      name($('#work h2'), 'ttl');
    } else if (H === 'projects' && T === 'home') {
      name($('.p-hero h1'), 'ttl');
    } else if ((H === 'home' || H === 'projects') && T === 'proj') {
      const card = $(`a.cs[href$="projects/${there.s}/"]`), row = $(`.cs-rest a[href$="projects/${there.s}/"]`);
      if (card) { name($('figure', card), 'cov', 'vt-cov'); name($('h3', card), 'ttl'); }
      else if (row) name($('strong', row), 'ttl');
    } else if (H === 'proj' && (T === 'home' || T === 'projects')) {
      name($('.p-cover .m'), 'cov', 'vt-cov'); name($('.p-hero h1 span'), 'ttl');
    } else if (H === 'proj' && T === 'proj') {
      if (leaving) name($(`.p-nx[href$="projects/${there.s}/"] strong`), 'ttl');
      else name($('.p-hero h1 span'), 'ttl');
    }
  }

  // the moving pictures' decoded images, handed from the old page to the new one
  const SRC_KEY = 'vt-src';
  function keepSources() {
    const m = {};
    for (const el of named) { const n = el.style.viewTransitionName, im = el.querySelector && el.querySelector('img'); if (n && n.startsWith('t-') && im && im.currentSrc) m[n] = im.currentSrc; }
    try { sessionStorage.setItem(SRC_KEY, JSON.stringify(m)); } catch (e) { /* no handoff */ }
  }
  function useSources() {
    let m = {}; try { m = JSON.parse(sessionStorage.getItem(SRC_KEY) || '{}'); sessionStorage.removeItem(SRC_KEY); } catch (e) { return; }
    for (const el of named) {
      const u = m[el.style.viewTransitionName], im = u && el.querySelector('img'); if (!im) continue;
      const pic = im.parentElement, srcs = pic && pic.tagName === 'PICTURE' ? $$('source', pic) : [];
      const saved = { ss: im.getAttribute('srcset'), src: im.getAttribute('src'), srcs: srcs.map((s) => s.getAttribute('srcset')), lz: im.loading };
      srcs.forEach((s) => s.removeAttribute('srcset')); im.removeAttribute('srcset'); im.loading = 'eager'; im.decoding = 'sync'; im.src = u;
      window.__vtDone.then(() => setTimeout(() => {          // back to the responsive images once the motion is over
        srcs.forEach((s, i) => saved.srcs[i] && s.setAttribute('srcset', saved.srcs[i]));
        if (saved.ss) im.setAttribute('srcset', saved.ss); im.decoding = 'async';
      }, 300));
    }
  }

  // the old glass is held until the new page's glass has drawn (or 0.9 s), then dissolves
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
    html.classList.add('vt');
    const lb = $('.lb.open'); if (lb) html.classList.remove('lb-on');      // the viewer never travels into a snapshot
    const here = page(location.href), there = page(e.activation.entry.url);
    pair(here, there, true); keepSources();
    types(here, there, true, e.activation.navigationType === 'traverse').forEach((t) => e.viewTransition.types.add(t));
  });
  addEventListener('pagereveal', (e) => {
    if (!e.viewTransition) { done(); return; }
    html.classList.add('vt');
    const act = navigation.activation, from = act && act.from;
    if (from && from.url) {
      const here = page(location.href), there = page(from.url);
      pair(here, there, false); useSources();
      types(here, there, false, act.navigationType === 'traverse').forEach((t) => e.viewTransition.types.add(t));
    }
    holdGlass(e.viewTransition);
    e.viewTransition.finished.finally(() => { clear(); html.classList.remove('vt'); done(); });
  });
  addEventListener('pageshow', (e) => { if (e.persisted) { clear(); html.classList.remove('vt'); } });   // back from the bfcache
})();
