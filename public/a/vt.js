/* Page transitions, shared elements. The CSS (index.html) gives every navigation a crossfade; this names the elements
   that should reshape into their counterpart on the other page, just for that one navigation:
     home "Projects" heading  <-> /projects/ title
     home "Renders"/"Gallery" heading and its preview tiles <-> the full page's title and the same tiles in its wall
     a project card (home or /projects/) <-> that project's cover and title
     a project's previous/next link -> the next project's title
   The leaving page names its side in pageswap, the arriving page its side in pagereveal; the names are cleared once
   the transition ends, so the image viewer's own morph never sees them. Browsers without cross-document View
   Transitions (or with reduced motion, where the CSS turns them off) skip all of this. */
(() => {
  if (!('onpagereveal' in window)) return;
  const page = (u) => {
    const p = new URL(u, location.href).pathname.replace(/index\.html$/, '');
    let m = p.match(/\/projects\/([^/]+)\/$/); if (m) return { k: 'proj', s: m[1] };
    if (/\/projects\/$/.test(p)) return { k: 'projects' };
    if (/\/renders\/$/.test(p)) return { k: 'renders' };
    if (/\/gallery\/$/.test(p)) return { k: 'gallery' };
    return { k: 'home' };
  };
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const seen = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; };
  const named = [];
  const name = (el, n, cls) => { if (!el || !seen(el)) return; el.style.viewTransitionName = n; if (cls) el.style.viewTransitionClass = cls; named.push(el); };
  const clear = () => { named.splice(0).forEach((el) => { el.style.viewTransitionName = ''; el.style.viewTransitionClass = ''; }); };
  const tileKey = (t) => 't-' + (t.dataset.full || '').split('/').pop().replace(/[^a-z0-9-]/gi, '-');

  // here: this page; there: the other page; leaving: true in pageswap
  function pair(here, there, leaving) {
    const H = here.k, T = there.k;
    // the glass and header: only when this page's hero is on screen (a group sliding in from off screen looks wrong)
    const glass = $('#glass'); if (glass && !seen(glass)) { glass.style.viewTransitionName = 'none'; named.push(glass); }
    if (H === 'home' && (T === 'renders' || T === 'gallery')) {
      const sec = $(T === 'renders' ? '#art' : '#gallery');
      name($('h2', sec), 'ttl');
      $$('.m', sec).forEach((t) => name(t, tileKey(t), 'vt-tile'));
    } else if ((H === 'renders' || H === 'gallery') && T === 'home') {
      name($('.hero .intro h1'), 'ttl');
      $$('main .m').filter(seen).slice(0, 24).forEach((t) => name(t, tileKey(t), 'vt-tile'));
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

  addEventListener('pageswap', (e) => {
    if (!e.viewTransition || !e.activation || !e.activation.entry) return;
    pair(page(location.href), page(e.activation.entry.url), true);
  });
  addEventListener('pagereveal', (e) => {
    if (!e.viewTransition) return;
    const from = navigation.activation && navigation.activation.from;
    if (from && from.url) pair(page(location.href), page(from.url), false);
    e.viewTransition.finished.finally(clear);
  });
  addEventListener('pageshow', (e) => { if (e.persisted) clear(); });   // back from the bfcache: the leaving names stayed
})();
