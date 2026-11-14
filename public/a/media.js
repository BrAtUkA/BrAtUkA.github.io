/* Loops and the viewer. Tiles are plain links to the full image, so everything works without this script.
   Loops: sources are attached only when a tile nears the screen; a loop plays while at least a quarter of it is
   visible and pauses otherwise (and while the tab is hidden). Reduced motion: posters only. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const AV1 = 'video/webm; codecs="av01.0.05M.08"';
  const pickW = (el, ladder) => { const need = el.getBoundingClientRect().width * (devicePixelRatio || 1); return ladder.find(w => w >= need) || ladder[ladder.length - 1]; };
  const vids = [...document.querySelectorAll('.m video[data-v]')];

  function attach(v) {
    if (v.dataset.ok) return; v.dataset.ok = 1;
    const w = pickW(v, [720, 1280]), b = v.dataset.v + '-' + w;
    v.innerHTML = `<source src="${b}.webm" type='${AV1}'><source src="${b}.mp4" type="video/mp4">`;
    v.addEventListener('playing', () => v.classList.add('on'), {once: true});
    v.load();
  }
  const seen = new Map();
  function sync() { for (const v of vids) { if (seen.get(v) && !reduce && !document.hidden) { attach(v); v.play().catch(() => {}); } else if (!v.paused) v.pause(); } }
  if (vids.length && 'IntersectionObserver' in window) {
    const near = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && !reduce && attach(e.target)), {rootMargin: '400px 0px'});
    const vis = new IntersectionObserver(es => { es.forEach(e => seen.set(e.target, e.intersectionRatio >= .25)); sync(); }, {threshold: [0, .25, .5]});
    vids.forEach(v => { near.observe(v); vis.observe(v); });
    document.addEventListener('visibilitychange', sync);
  }

  // viewer: arrows / swipe / Esc, scoped to the group the tile belongs to ([data-list])
  const lb = document.createElement('div');
  lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Viewer');
  lb.innerHTML = '<div class="fr"><button class="nv pv" type="button" aria-label="Previous">\u2190</button><button class="nv nx" type="button" aria-label="Next">\u2192</button><button class="x" type="button">Close \u2715</button></div><div class="bar"><span class="mono" data-c></span><span class="mono" data-n></span></div>';
  document.body.appendChild(lb);
  const fr = lb.querySelector('.fr'); let list = [], i = 0, back = null;
  const pad = n => String(n).padStart(2, '0');
  function show(k) {
    i = (k + list.length) % list.length; const t = list[i];
    fr.querySelectorAll('img,video').forEach(n => n.remove());
    let node;
    if (t.dataset.v && !reduce) {
      node = document.createElement('video'); node.muted = true; node.loop = true; node.autoplay = true; node.playsInline = true;
      node.poster = t.querySelector('img').currentSrc; const b = t.dataset.v + '-1280';
      node.innerHTML = `<source src="${b}.webm" type='${AV1}'><source src="${b}.mp4" type="video/mp4">`;
    } else {
      const ws = t.dataset.ws.split(',').map(Number), need = Math.max(innerWidth, innerHeight * 1.78) * Math.min(devicePixelRatio || 1, 2);
      const w = ws.find(x => x >= need) || ws[ws.length - 1];
      node = new Image(); node.decoding = 'async'; node.alt = t.querySelector('img').alt;
      node.src = t.querySelector('img').currentSrc;                       // show the tile's image at once, then the sharp one
      const hi = new Image(); hi.onload = () => { if (list[i] === t) node.src = hi.src; };
      hi.src = t.dataset.full + '-' + w + (/\.avif$/.test(node.src) ? '.avif' : '.webp');   // same format the browser already chose
    }
    fr.prepend(node);
    lb.querySelector('[data-c]').textContent = t.dataset.cap || '';
    lb.querySelector('[data-n]').textContent = pad(i + 1) + ' / ' + pad(list.length);
  }
  function open(t) {
    const g = t.closest('[data-list]'); list = g ? [...g.querySelectorAll('a.m')] : [t];
    back = t; show(list.indexOf(t)); lb.classList.add('open'); document.documentElement.style.overflow = 'hidden';
    lb.querySelector('.x').focus({preventScroll: true});
  }
  function close() { lb.classList.remove('open'); document.documentElement.style.overflow = ''; fr.querySelectorAll('video').forEach(v => v.pause()); back && back.focus({preventScroll: true}); }
  document.addEventListener('click', e => {
    const t = e.target.closest('a.m'); if (!t || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault(); open(t);
  });
  lb.querySelector('.pv').onclick = () => show(i - 1);
  lb.querySelector('.nx').onclick = () => show(i + 1);
  lb.querySelector('.x').onclick = close;
  lb.addEventListener('click', e => { if (e.target === fr || e.target === lb) close(); });
  addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') show(i - 1); else if (e.key === 'ArrowRight') show(i + 1);
    else if (e.key === 'Tab') { const f = [...lb.querySelectorAll('button')].filter(b => b.offsetParent); const a = f.indexOf(document.activeElement);
      e.preventDefault(); f[(a + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); }
  });
  let x0 = null;
  lb.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, {passive: true});
  lb.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1)); x0 = null; });
})();
