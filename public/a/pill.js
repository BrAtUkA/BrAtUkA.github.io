/* The gallery filter's indicator: a pill of smooth liquid glass, drawn in WebGL over the filter's own buttons.
   The buttons' contents (the word "All" and the two game logos) are painted once into a texture. Outside the pill they
   show dim and grey; under the pill they are seen through the glass, in colour: the rounded rim magnifies like a lens
   with a little colour fringing, a highlight runs along the top edge and follows the pointer, and the game's
   colour glows faintly in the body. Moving, the pill's edges ride separate springs (it stretches toward its target and
   catches up) and a droplet pulls away from its tail and melts back in: a smooth union of the two signed distances.
   Returns null when WebGL2 is unavailable or motion is reduced; media.js then uses a plain sliding pill. */
window.GlassPill = (box) => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const cv = document.createElement('canvas');
  const gl = cv.getContext('webgl2', {alpha: true, premultipliedAlpha: true, antialias: false});
  if (!gl) return null;
  cv.className = 'pillgl'; cv.setAttribute('aria-hidden', 'true');
  const btns = [...box.querySelectorAll('button')];
  const TINT = {all: [.55, .5, .52], rdr2: [.75, .08, .1], cyberpunk: [.05, .62, .7]};

  const vs = `#version 300 es
  in vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;
  const fs = `#version 300 es
  precision highp float;
  uniform sampler2D S; uniform vec2 R; uniform vec4 P; uniform vec3 D; uniform vec3 T; uniform float LX, DPR, SQ, TIME;
  out vec4 o;
  float box(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
  float smin(float a, float b, float k){ float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
  float sdf(vec2 p){
    vec2 c = vec2((P.x + P.y) * .5, (P.z + P.w) * .5), hb = vec2((P.y - P.x) * .5, (P.w - P.z) * .5 * SQ);
    float d = box(p - c, hb, hb.y);
    return D.z > 0. ? smin(d, length(p - D.xy) - D.z, 12. * DPR) : d;
  }
  vec3 grey(vec3 c){ return vec3(dot(c, vec3(.299, .587, .114))); }
  void main(){
    vec2 p = vec2(gl_FragCoord.x, R.y - gl_FragCoord.y);
    vec4 base = texture(S, p / R);
    vec4 dim = vec4(grey(base.rgb) * .55, base.a * .55);           // outside the glass: quiet and grey
    float d = sdf(p), aa = 1.1 * DPR, inside = clamp(.5 - d / aa, 0., 1.);
    if (inside <= 0.) { o = dim; return; }
    float hh = (P.w - P.z) * .5;
    vec2 e = vec2(1., 0.);
    vec2 g = vec2(sdf(p + e.xy) - sdf(p - e.xy), sdf(p + e.yx) - sdf(p - e.yx));
    g = g / max(length(g), 1e-4);
    float rim = clamp(1. + d / (hh * .62), 0., 1.);                   // 0 in the body, 1 at the edge
    float bulge = rim * rim * (3. - 2. * rim);
    vec2 off = -g * bulge * hh * .26;                                 // smooth lens: the rim pulls the view inward
    float k = .012 * DPR;                                            // a little dispersion at the rim
    vec3 col = vec3(texture(S, (p + off * (1. + k)) / R).r, texture(S, (p + off) / R).g, texture(S, (p + off * (1. - k)) / R).b);
    float a = texture(S, (p + off) / R).a;
    float yv = (p.y - P.z) / (P.w - P.z);                          // 0 at the top of the pill, 1 at the bottom
    vec3 body = T * (.22 - .08 * yv);                               // the game's colour, deepening toward the bottom
    vec3 glass = col + body * (1. - a) * .9;
    // light: crisp hairlines only (no glow). A bright one along the top edge, strongest under the pointer, and a faint
    // reflected one along the bottom.
    float line = smoothstep(-1.6 * DPR, -.5 * DPR, d) * (1. - smoothstep(-.5 * DPR, .2 * DPR, d));
    float hl = exp(-pow((p.x - LX) / (hh * 2.6), 2.));
    float up = smoothstep(.2, -.75, g.y), down = smoothstep(-.2, .75, g.y);
    glass += vec3(1.) * line * (up * (.32 + .55 * hl) + down * .12);
    float ga = max(a, .88);
    vec4 inn = vec4(glass * ga, ga);
    o = mix(dim, inn, inside);
  }`;
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(x); return x; };
  let prog;
  try { prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog); } catch (err) { console.warn('pill', err); return null; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {}; for (const n of ['S', 'R', 'P', 'D', 'T', 'LX', 'DPR', 'SQ', 'TIME']) U[n] = gl.getUniformLocation(prog, n);
  const tex = gl.createTexture();
  const scene = document.createElement('canvas'), sx = scene.getContext('2d');
  let W = 1, H = 1, dpr = 1, rects = [], ready = false;

  function paint() {                                       // the buttons' contents, as they sit in the layout
    const br = box.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(br.width * dpr)); H = Math.max(1, Math.round(br.height * dpr));
    cv.width = scene.width = W; cv.height = scene.height = H;
    sx.clearRect(0, 0, W, H);
    rects = btns.map(b => { const r = b.getBoundingClientRect(); return {x: (r.left - br.left) * dpr, y: (r.top - br.top) * dpr, w: r.width * dpr, h: r.height * dpr}; });
    btns.forEach((b, k) => {
      const r = rects[k], img = b.querySelector('img');
      if (img && img.naturalWidth) {
        const h = img.getBoundingClientRect().height * dpr, w = h * img.naturalWidth / img.naturalHeight;
        sx.drawImage(img, r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h);
      } else {
        const cs = getComputedStyle(b);
        sx.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * dpr}px ${cs.fontFamily}`;
        sx.fillStyle = '#ece6e3'; sx.textAlign = 'center'; sx.textBaseline = 'middle';
        sx.fillText(b.textContent.trim(), r.x + r.w / 2, r.y + r.h / 2 + dpr * .5);
      }
    });
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.viewport(0, 0, W, H);
  }

  // motion: the same critically damped springs as the hero
  const st = {l: 0, r: 0, vl: 0, vr: 0, c: 0, vc: 0, sq: 1, vs: 0, tl: 0, tr: 0, lean: 0, press: 0, lx: 0, tlx: 0, vlx: 0};
  const spring = (x, v, to, w, dt) => { const acc = w * w * (to - x) - 2 * w * v; v += acc * dt; return [x + v * dt, v]; };
  let cur = box.querySelector('[aria-pressed=true]') || btns[0], raf = 0, last = 0, t0 = performance.now(), tint = TINT.all.slice(), ttint = TINT.all;
  function target(b) { const k = btns.indexOf(b), r = rects[k]; return [r.x, r.x + r.w]; }
  function frame(now) {
    const dt = Math.min(.033, (now - last) / 1000 || .016); last = now;
    for (let k = 0; k < 3; k++) {
      const h = dt / 3, dir = Math.sign((st.tl + st.tr) - (st.l + st.r));
      [st.l, st.vl] = spring(st.l, st.vl, st.tl + st.lean, dir < 0 ? 30 : 14, h);
      [st.r, st.vr] = spring(st.r, st.vr, st.tr + st.lean, dir > 0 ? 30 : 14, h);
      [st.c, st.vc] = spring(st.c, st.vc, (st.l + st.r) / 2, 8, h);
      [st.sq, st.vs] = spring(st.sq, st.vs, 1 - st.press * .1, 28, h);
      [st.lx, st.vlx] = spring(st.lx, st.vlx, st.tlx, 10, h);
    }
    for (let k = 0; k < 3; k++) tint[k] += (ttint[k] - tint[k]) * Math.min(1, dt * 6);
    const pad = 4 * dpr, top = pad, bot = H - pad, hh = (bot - top) / 2;
    const L = Math.max(pad, st.l), R = Math.min(W - pad, st.r);
    const sep = Math.abs(st.c - (L + R) / 2), drop = Math.min(1, sep / (26 * dpr));
    const speed = Math.min(1, Math.abs(st.vl + st.vr) / (2600 * dpr));
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1i(U.S, 0); gl.uniform2f(U.R, W, H);
    gl.uniform4f(U.P, L, Math.max(L + hh * 2, R), top, bot);
    gl.uniform3f(U.D, st.c, (top + bot) / 2, drop > .02 ? hh * (.35 + .4 * drop) : -1);
    gl.uniform3f(U.T, tint[0], tint[1], tint[2]);
    gl.uniform1f(U.LX, st.lx); gl.uniform1f(U.DPR, dpr); gl.uniform1f(U.SQ, st.sq * (1 - speed * .1)); gl.uniform1f(U.TIME, (now - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const moving = Math.abs(st.vl) + Math.abs(st.vr) + Math.abs(st.vc) + Math.abs(st.vs) + Math.abs(st.vlx) > .4 * dpr
      || Math.abs(st.l - st.tl - st.lean) > .3 || Math.abs(st.r - st.tr - st.lean) > .3;
    raf = (moving || visible) ? requestAnimationFrame(frame) : 0;      // keeps breathing slowly while on screen
  }
  let visible = true;
  const kick = () => { if (!raf && ready) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  new IntersectionObserver(es => { visible = es[0].isIntersecting && !document.hidden; kick(); }).observe(box);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; kick(); });

  function go(b, instant) {
    cur = b; box.dataset.on = b.dataset.f; ttint = TINT[b.dataset.f] || TINT.all;
    if (!ready) return;
    [st.tl, st.tr] = target(b); st.tlx = (st.tl + st.tr) / 2;
    if (instant) { st.l = st.tl; st.r = st.tr; st.c = (st.l + st.r) / 2; st.lx = st.tlx; st.vl = st.vr = st.vc = st.vlx = 0; tint = ttint.slice(); }
    kick();
  }
  box.addEventListener('pointermove', e => {
    if (!ready) return;
    const br = box.getBoundingClientRect(), x = (e.clientX - br.left) * dpr;
    st.tlx = x;
    if (e.pointerType === 'mouse') st.lean = Math.max(-10 * dpr, Math.min(10 * dpr, (x - (st.tl + st.tr) / 2) * .06));
    kick();
  });
  box.addEventListener('pointerleave', () => { st.lean = 0; st.tlx = (st.tl + st.tr) / 2; kick(); });
  box.addEventListener('pointerdown', () => { st.press = 1; kick(); });
  addEventListener('pointerup', () => { if (st.press) { st.press = 0; kick(); } });

  const imgs = btns.map(b => b.querySelector('img')).filter(Boolean);
  Promise.all([document.fonts ? document.fonts.ready : 0, ...imgs.map(im => im.decode ? im.decode().catch(() => {}) : 0)]).then(() => {
    box.appendChild(cv); paint(); ready = true; box.classList.add('gl'); go(cur, true);
    new ResizeObserver(() => { paint(); go(cur, true); }).observe(box);
  });
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; cv.remove(); box.classList.remove('gl'); ready = false; });
  return {go};
};
