/* Project pages: the "On this page" index follows the reading position, and diagrams draw in once they come into
   view (static with reduced motion; the CSS shows them fully without this script). */
(() => {
  const links = [...document.querySelectorAll('.p-toc a')];
  const heads = links.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
  if (heads.length) {
    let raf = 0;
    const pick = () => {
      raf = 0;
      let cur = heads[0];
      for (const h of heads) if (h.getBoundingClientRect().top < innerHeight * 0.35) cur = h;
      for (const a of links) a.classList.toggle('on', a.hash === '#' + cur.id);
    };
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(pick); }, { passive: true });
    pick();
  }
  const dgs = document.querySelectorAll('.dg');
  if (!('IntersectionObserver' in window)) { dgs.forEach((d) => d.classList.add('on')); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); } }), { threshold: 0.3 });
  dgs.forEach((d) => io.observe(d));
})();
