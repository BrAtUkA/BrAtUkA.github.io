/* ── reeded glass hero ──
   - a/hero-home.webp: the B as red optical glass, rendered in Blender Cycles (render_heroshape.py, shape B), with its turn frames in a/turn-home/
   - a/glass-refraction.png: one flute of a real reeded-glass panel baked in Cycles; per pixel, how far it shifts
     the view behind it for three wavelengths (dispersion) plus transmittance
   The lighting is analytic: each reed is a cylindrical lens (same profile as the bake) and one normal per pixel
   drives a GGX key softbox with specular anti-aliasing, a dark studio reflection, total internal reflection on the
   wall turned away from the light, and the light that escapes at each groove (box-filtered over 4 sub-pixel taps).
   Phase wrap uses Paper Shaders' smoothFract (Apache-2.0, https://shaders.paper.design). */
(() => {
  const hero = document.querySelector('.hero'), cv = document.getElementById('glass');
  if (!hero || !cv) return;
  const BASE = hero.dataset.base || '', PLATE_SRC = BASE + (hero.dataset.plate || 'a/hero-home.webp'), HAS_TURN = hero.dataset.turn !== 'off';
  const TURN_SRC = BASE + (hero.dataset.turn && hero.dataset.turn !== 'off' ? hero.dataset.turn : 'a/turn-home/b');   // frame i is TURN_SRC + i + '.webp'
  const flags = new URLSearchParams(location.search), hash = location.hash;
  const POSTER = flags.has('poster'), DEBUG = flags.has('debug') || hash === '#debug';
  if (POSTER) document.documentElement.classList.add('poster-capture');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  // why the hero is in the mode it is in: shown by ?debug (with a copy button), so a visitor can send it
  const diag = { mode: 'live', why: [], renderer: '?', fps: '' };
  if (reduce) diag.why.push('reduced motion (OS setting: on Windows, Settings > Accessibility > Visual effects > Animation effects)');
  if (saveData) diag.why.push('Save-Data is on');
  let dbg = null;
  const report = () => {
    if (!DEBUG) return;
    if (!dbg) {
      dbg = document.body.appendChild(document.createElement('div'));
      dbg.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;max-width:min(560px, calc(100vw - 16px));font:12px/1.45 monospace;color:#ece6e3;background:#000c;padding:8px 10px;border-radius:6px;white-space:pre-wrap';
      const b = dbg.appendChild(document.createElement('button')); b.textContent = 'copy';
      b.style.cssText = 'float:right;margin:0 0 4px 10px;font:inherit;color:#060405;background:#ece6e3;border:0;border-radius:4px;padding:2px 8px;cursor:pointer';
      b.onclick = () => navigator.clipboard && navigator.clipboard.writeText(dbg.dataset.t).then(() => { b.textContent = 'copied'; });
      dbg.appendChild(document.createElement('span'));
    }
    const t = [`hero: ${diag.mode}${diag.why.length ? ' because ' + diag.why.join('; ') : ''}`, `renderer: ${diag.renderer}`,
      `browser: ${navigator.userAgent}`, `screen: ${innerWidth}x${innerHeight} @${devicePixelRatio}x`, diag.fps].filter(Boolean).join('\n');
    dbg.dataset.t = t; dbg.lastChild.textContent = t;
  };
  // Reduced motion, Save-Data or software-only graphics: the real glass, drawn once at the real size (and again on
  // resize), never animated. Only without WebGL at all does a still picture stand in (see fallback).
  let STILL = !POSTER && (reduce || saveData);
  if (STILL) diag.mode = 'still (one frame, not animated)';
  // Without WebGL the still is put together from two pictures, the empty glass (tiled at the live reed width) and the
  // shape with the glass over it, placed by the same rules as the live hero (layout() below), so it fits any screen.
  // Where the B goes. Beside the words on wide screens: its left edge stays clear of the text (measured, not
  // guessed), its right edge inside the page gutter, and it shrinks to fit; with too little room it moves above the
  // words, as on phones. vis = the visible B's left and right edge around the plate centre, in plate heights.
  const textRight = () => {
    const hr = hero.getBoundingClientRect(); let r = 0;
    for (const el of hero.querySelectorAll('.intro h1, .intro p, .intro .acts, .intro .tabs')) {
      const rg = document.createRange(); rg.selectNodeContents(el); const b = rg.getBoundingClientRect();
      if (b.width) r = Math.max(r, b.right - hr.left);
    }
    return r;
  };
  const textTop = () => {
    const hr = hero.getBoundingClientRect(), el = hero.querySelector('.intro h1'); if (!el) return 0;
    const rg = document.createRange(); rg.selectNodeContents(el); const b = rg.getBoundingClientRect();
    return b.height ? b.top - hr.top : 0;
  };
  const placeB = (W, H, asp, vis) => {
    const o = hero.dataset; let wide = W / H > 1.1, Hb = 0, x = 0, y = 0;
    if (wide) {
      Hb = Math.min(H * (+o.size || .66), W * (+o.wcap || .4)); x = W * (+o.x || .68); y = H * (+o.y || .5);
      if (o.avoid !== 'off') {
        const g = Math.min(92, Math.max(16, W * .04)), tr = textRight() + W * .035, span = vis[1] - vis[0];
        Hb = Math.min(Hb, (W - g - tr) / span);
        x = Math.min(Math.max(x, tr - vis[0] * Hb), W - g - vis[1] * Hb);
        if (Hb < H * .42) wide = false;
      }
    }
    if (!wide) {
      Hb = Math.min(H * (+o.sizeN || .38), W * .78 / asp); x = W * .5; y = H * (+o.yN || .32);
      // above the words: if they start higher than the B ends, fit the B between the nav and the words
      const tt = textTop(), top = Math.min(H * .14, 96), gap = H * .03;
      if (tt > 0 && y + .48 * Hb > tt - gap) { Hb = Math.max(H * .16, Math.min(Hb, (tt - gap - top) / .96)); y = Math.max(top + .48 * Hb, tt - gap - .48 * Hb); }
    }
    return { wide, Hb, x, y };
  };

  const fallback = (why) => {
    if (why) diag.why.push(String(why && why.message || why));
    diag.mode = 'picture (no live glass)'; diag.fps = ''; report();
    if (cv.parentNode) cv.remove();
    const S = hero.dataset.still; if (!S || hero.querySelector('.still')) return;
    const box = document.createElement('div'); box.className = 'still'; box.setAttribute('aria-hidden', 'true');
    const img = new Image(); img.alt = ''; img.decoding = 'async'; box.appendChild(img);
    hero.insertBefore(box, hero.firstChild);
    const V = hero.dataset.sv ? '?v=' + hero.dataset.sv : '';     // content version (build_site.py)
    fetch(BASE + S + '.json' + V).then((r) => r.json()).then((G) => {
      let mode = '';
      const place = () => {
        const r = hero.getBoundingClientRect(), W = r.width, H = r.height, o = hero.dataset;
        const w = Math.max(22, Math.min(40, W / 40));
        const P = placeB(W, H, G.pa, G.vis || [-.45, .45]), wide = P.wide, x = P.x, y = P.y;
        const Hb = P.Hb * (+o.k || 1.0105), md = wide ? 'w' : 'n', c = G[md];
        if (md !== mode) { mode = md; img.src = `${BASE}${S}-${md}.webp${V}`; box.style.backgroundImage = `url(${BASE}${S}-${md}-glass.webp${V})`; }
        box.style.backgroundSize = `${w}px 100%`;                        // the glass strip is one reed wide
        img.style.width = c.wd * Hb + 'px'; img.style.height = c.ht * Hb + 'px';
        img.style.transform = `translate3d(${x + c.l * Hb}px, ${y + c.t * Hb}px, 0)`;
      };
      place(); addEventListener('resize', place, { passive: true });
      if (document.fonts) document.fonts.ready.then(place);          // the words' width changes once the font is in
    }).catch(() => box.remove());
  };

  if (flags.get('gl') === 'off') { fallback('turned off with ?gl=off'); return; }   // testing: the picture fallback
  let gl = null;
  try { gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: POSTER }); } catch (e) { gl = null; }
  if (!gl) {
    const v1 = (() => { try { return !!document.createElement('canvas').getContext('webgl'); } catch (e) { return false; } })();
    fallback(v1 ? 'WebGL 2 is not available (WebGL 1 is)' : 'WebGL is not available (graphics acceleration off or blocked)'); return;
  }
  // no hardware graphics (software rasterisers such as SwiftShader or llvmpipe): the live glass would run on the CPU
  // and block the page, so show the still poster instead (?gl=force keeps it for testing)
  try {
    const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(dbgInfo ? dbgInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    diag.renderer = renderer;
    if (!POSTER && flags.get('gl') !== 'force' && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)) {   // one frame is fine on the CPU; animating is not
      STILL = true; diag.mode = 'still (one frame, not animated)'; diag.why.push('software graphics: ' + renderer);
    }
  } catch (e) { /* if the renderer can't be read, keep the live hero */ }

  const FS = `#version 300 es
precision highp float;
uniform sampler2D uPlate;   // lit B, premultiplied
uniform sampler2D uRefr;    // baked flute refraction: rgb = shift per channel (flute widths), a = transmittance
uniform vec2 uRes;          // canvas, device px
uniform float uDpr;         // device px per css px
uniform vec2 uBc;           // plate centre, css px (y down)
uniform vec2 uBsz;          // plate size, css px
uniform float uGx;          // glass offset, css px
uniform float uW;           // flute width, css px
uniform float uBias, uFade;
uniform vec2 uPool;         // where the key light falls on the glass (uv of the hero)
uniform float uRefrK, uShade;
uniform vec3 uBack;         // page background, sRGB
uniform float uLz, uLh, uLw, uRough, uSpecI, uEnvI, uStripX, uStripW, uDark, uSide, uLoff, uFil, uPipe, uPipeBase, uSig;
uniform highp sampler2DArray uTurn;   // turntable frames of the B (premultiplied)
uniform float uTurnOn, uFrame, uFrames;
const float SAG = .22, RR = (.25 + SAG * SAG) / (2. * SAG);   // reed profile (same as the Cycles bake): circular segment, flute widths
out vec4 fragColor;

vec2 plateUV(vec2 p) { return (p - uBc) / uBsz + .5; }
float smoothFract(float x) {                     // fract with the wrap filtered over one pixel (Paper Shaders)
  float f = fract(x), w = fwidth(x);
  return mix(f, 1. - f, smoothstep(-w, w, abs(f - .5) - .5));
}
vec4 plate(vec2 p) {
  vec2 uv = plateUV(p);
  vec2 aa = 2. * fwidth(uv);
  float inside = smoothstep(0., aa.x, uv.x) * smoothstep(1., 1. - aa.x, uv.x) * smoothstep(0., aa.y, uv.y) * smoothstep(1., 1. - aa.y, uv.y);
  uv = clamp(uv, 0., 1.);
  vec4 c = vec4(0.);
  if (uTurnOn < 1.) c = texture(uPlate, uv, uBias) * (1. - uTurnOn);
  if (uTurnOn > 0.) {                                   // turn: Cycles turntable frames, evenly crossfaded between the two nearest angles
    float f0 = floor(uFrame), f1 = min(f0 + 1., uFrames - 1.);
    c += mix(texture(uTurn, vec3(uv, f0), uBias), texture(uTurn, vec3(uv, f1), uBias), uFrame - f0) * uTurnOn;
  }
  return c * inside;
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 view = uRes / uDpr;
  vec2 vv = p / view;
  vec2 tuv = vec2((p.x - uGx) / uW, .5);                 // repeats every flute; the glass slides with uGx


  // refraction baked from a Cycles render of the panel
  vec4 rf = texture(uRefr, tuv);
  vec3 sh = (rf.rgb - .5) * 2. * uW * uRefrK;          // baked bending, toned down
  vec4 cR = plate(vec2(p.x + sh.r, p.y)), cG = plate(vec2(p.x + sh.g, p.y)), cB = plate(vec2(p.x + sh.b, p.y));
  vec4 img = vec4(cR.r, cG.g, cB.b, (cR.a + cG.a + cB.a) / 3.) * mix(1., rf.a, uRefrK) * uFade;

  vec2 q = (vv - uPool) / vec2(.26, .5);
  float pool = exp(-dot(q, q) * 1.6);
  vec3 col = img.rgb + uBack * (1. - img.a);

  {
    // ── each reed is a cylindrical lens: one analytic normal drives the lighting ──
    // geometry in css px: glass at z = 0, eye 1.6 screen widths in front, a tall softbox at the light pool
    vec3 P = vec3(p, 0.);
    vec3 V = normalize(vec3(view.x * .5, view.y * .42, 1.6 * max(view.x, view.y)) - P);
    vec3 Lc = vec3((uPool.x + uLoff) * view.x, uPool.y * view.y, uLz * view.x);      // key softbox: beside the pool, low, so it rakes the reeds
    vec3 Lp = vec3(Lc.x, clamp(P.y, Lc.y - uLh * view.y, Lc.y + uLh * view.y), Lc.z);   // nearest point of the tall softbox
    vec3 L = normalize(Lp - P);
    vec3 H = normalize(L + V);
    float dl = length(Lp - P);
    float a = min(uRough + uLw * view.x / (3. * dl), 1.);                 // a finite light widens the lobe
    float fp = 1. / (uW * uDpr);                                          // flute widths per device px (undistorted phase)
    float eps = max(uFil / uW, fp);                                       // groove fillet: at least one device px, never more than uFil css px
    float lightFall = 1. / (1. + dl * dl / (view.x * view.x * .25));
    // lighting: one evaluation per pixel; the lobe is widened by how far the normal turns across the pixel
    float u = fract(tuv.x) - .5, au = abs(u);
    float nx = clamp(u / RR, -.74, .74);
    vec3 N = vec3(nx, 0., sqrt(1. - nx * nx));
    float dn = fp / RR;                                                   // normal change per device px (Tokuyoshi-Kaplanyan)
    float a2 = min(a * a + min(2. * .159 * dn * dn, .18), 1.);
    float nv = max(dot(N, V), 1e-3), nl = max(dot(N, L), 0.), nh = max(dot(N, H), 0.);
    float m = 1. - nv, F = .04 + .96 * m * m * m * m * m;
    float d = nh * nh * (a2 - 1.) + 1.;
    float spec = F * nl * a2 / (3.14159 * d * d);                         // GGX from the finite softbox
    vec3 R = reflect(-V, N);
    float sx = uStripX + (uSide - .5) * .14;                              // dark studio: tall strip at a grazing angle
    float env = F * exp(-((R.x - sx) * (R.x - sx)) / (uStripW * uStripW) - R.y * R.y * 3.);
    // the groove: two thin lines (light escaping on the lit wall, a dark wall opposite), drawn as Gaussians whose width
    // never drops under uSig device px, so their peak does not jump with sub-pixel alignment while the glass moves
    float y = fract(tuv.x + .5) - .5;                                     // phase measured from the groove, flute widths
    float sL = sign(L.x + 1e-4);
    float sg = sqrt(eps * eps / 12. + uSig * uSig * fp * fp);            // line blur: its own width plus the pixel floor
    float amp = eps / (sg * 2.5066);                                      // keeps each line's total light equal to its width
    float yl = y + sL * .5 * eps, ys = y - sL * .5 * eps;
    float pipe = amp * exp(-.5 * yl * yl / (sg * sg));
    float shade = amp * exp(-.5 * ys * ys / (sg * sg));
    float side = .5 - .5 * clamp(nx * sL * 3., -1., 1.);                  // total internal reflection on the wall turned away
    float dark = smoothstep(.36, .5 - eps, au) * side + shade;
    col *= 1. - uDark * dark;
    // the escaping light takes the colour of what is nearby: red around the B, warm white elsewhere
    vec4 near = textureLod(uPlate, clamp(plateUV(p), 0., 1.), 4.5) * step(abs(plateUV(p).x - .5), .5) * step(abs(plateUV(p).y - .5), .5);
    vec3 tint = mix(vec3(1., .96, .93), near.rgb / max(near.a, .05), clamp(near.a * 1.6, 0., .85));
    vec3 lit = vec3(1., .97, .94) * (uSpecI * spec * lightFall * mix(.3, 1., pool) + uEnvI * env * mix(.45, 1., pool))
             + tint * pipe * uPipe * (uPipeBase + (1. - uPipeBase) * pool * lightFall * 2.);
    lit *= uFade;
    col += (1. - col) * (1. - exp(-lit));                                 // soft clip: light adds, never washes to flat white
    col *= 1. - uShade * .5 * pow(smoothFract(tuv.x), 1.3);
  }
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
  fragColor = vec4(min(col, 1.) + (ign - .5) / 255., 1.);
}`;
  const VS = '#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }';
  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let pr, U = {};
  // program and geometry; run again after a lost context comes back
  function setup() {
    pr = gl.createProgram(); gl.attachShader(pr, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr); U = {};
    ['uPlate','uRefr','uRes','uDpr','uBc','uBsz','uGx','uW','uBias','uFade','uPool','uRefrK','uShade','uBack','uLz','uLh','uLw','uRough','uSpecI','uEnvI','uLoff','uFil','uPipe','uPipeBase','uSig','uTurn','uTurnOn','uFrame','uFrames','uStripX','uStripW','uDark','uSide'].forEach(n => U[n] = gl.getUniformLocation(pr, n));
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }
  try { setup(); } catch (e) { console.error(e); fallback('shader error: ' + e.message); return; }

  /* look */
  const LOOK = { bias: 0, refrK: .5, shade: .35, lz: .25, lh: .14, lw: .04, rough: .05, specI: .17, envI: 1.1, stripX: .93, stripW: .05, dark: .18, loff: .45, fil: .6, pipe: .65, pipeBase: .12, sig: .7, turn: 1, back: [6 / 255, 4 / 255, 5 / 255] };
  ['bias', 'refrK', 'shade', 'lz', 'lh', 'lw', 'rough', 'specI', 'envI', 'loff', 'fil', 'pipe', 'pipeBase', 'sig', 'turn', 'stripX', 'stripW', 'dark'].forEach(k => { if (flags.has(k)) LOOK[k] = +flags.get(k); });
  window.__look = LOOK;   // the lab pages switch interaction variants live

  /* quality tiers: once a tier proves too slow it is never used again */
  const TIERS = [{ dpr: 2 }, { dpr: 1.5 }, { dpr: 1.25 }, { dpr: 1 }];   // never below 1: thin edges need real pixels
  const FORCED = flags.has('tier') ? Math.max(0, Math.min(3, +flags.get('tier') | 0)) : -1;
  let tier = FORCED >= 0 ? FORCED : (POSTER || STILL ? 0 : 1), ceiling = 0;

  const PLATE = { k: +hero.dataset.k || 1.0105, dx: +(hero.dataset.dx || .0011), dy: +(hero.dataset.dy || .0004) };                  // plate box vs the B inside it (from turn2/encode.py)
  let W = 1, H = 1, dpr = 1, w = 30, Hb = 400, aspect = 1, B0 = { x: 0, y: 0 }, VIS = [-.45, .45];
  function layout() {
    const r = hero.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, TIERS[tier].dpr);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); gl.viewport(0, 0, cv.width, cv.height);
    w = Math.max(22, Math.min(40, W / 40));
    const P = placeB(W, H, aspect, VIS), wide = P.wide;   // per-page placement (data-x, data-size, ... on the hero)
    Hb = P.Hb * PLATE.k;                                  // the plate box includes room for the B to turn
    B0 = { x: P.x, y: P.y };
    if (POSTER) window.__geo = { W, H, Hb, x: B0.x, y: B0.y, w, aspect, k: PLATE.k, wide, vis: VIS };   // for the still pictures (render_still.js)
  }

  const st = { scroll: 0, sv: 0, mx: -1, my: .5, vx: 0, vy: 0, sx: .5, gate: 1, phase: 0 };
  const COARSE = matchMedia('(pointer:coarse)').matches || innerWidth < 760 || (navigator.deviceMemory || 8) <= 4;
  // turntable: FN frames FD degrees apart, rest pose at frame FR (home B: 17 x 2.25 deg, rest 8); FA scales the swing.
  // Phones load every other frame.
  const FN = +hero.dataset.tn || 17, FR = +hero.dataset.tr || 8, FD = +hero.dataset.td || 2.25, FA = +hero.dataset.ta || 1;
  const TURN = { step: COARSE ? 2 : 1, n: COARSE ? Math.ceil(FN / 2) : FN, rest: COARSE ? FR / 2 : FR, ready: false, aspect: 1, mix: 0 };
  let tx = .5, ty = .5, lastAct = -1e9, t0 = 0, last = 0, ready = false;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const outCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3), outQuart = (x) => 1 - Math.pow(1 - clamp01(x), 4);
  // the glass follows the pointer anywhere on the page while the hero is on screen (positions past its edges clamp)
  // with no pointer on the page the B rests in its own pose: the pointer counts as over the B, not the hero's middle
  let seen = false;
  addEventListener('pointermove', (e) => { const r = hero.getBoundingClientRect(); if (r.bottom < 0) return;
    seen = true; tx = clamp01((e.clientX - r.left) / r.width); ty = clamp01((e.clientY - r.top) / r.height); lastAct = performance.now(); }, { passive: true });
  document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) { seen = false; ty = .5; } });
  addEventListener('scroll', () => { lastAct = performance.now(); }, { passive: true });

  // critically damped spring: eases in and out, never overshoots, settles in about 4/omega seconds
  const spring = (x, v, target, omega, dt) => { const a = omega * omega * (target - x) - 2 * omega * v; v += a * dt; return [x + v * dt, v]; };
  const soft = (x) => { x = Math.max(-1, Math.min(1, x)); return x * (1.5 - .5 * x * x); };   // gentle at the edges of the hero
  function state(now, dt) {
    const t = (now - t0) / 1000;
    if (st.mx < 0) st.mx = B0.x / W;                        // first frame: start at rest
    const damp = (c, g, tau) => g + (c - g) * Math.exp(-dt / tau);
    // fixed small sub-steps keep the springs stable on slow frames
    for (let k = 0, n = Math.max(1, Math.ceil(dt / .008)), h = dt / n; k < n; k++) {
      [st.mx, st.vx] = spring(st.mx, st.vx, seen ? tx : B0.x / W, 5.2, h);
      [st.my, st.vy] = spring(st.my, st.vy, ty, 5.2, h);
      [st.scroll, st.sv] = spring(st.scroll, st.sv, Math.min(H, Math.max(0, window.scrollY)), 9, h);
    }
    st.sx = damp(st.sx, tx, .8);
    st.gate = damp(st.gate, now - lastAct > 2500 ? 1 : 0, 1);
    st.phase += dt * (2 * Math.PI / 16) * st.gate;
    // The B turns towards the pointer at one rate everywhere: the whole width between the left edge and the B spans
    // the frames on the left of the rest pose, and the right side turns at the same rate for as far as it reaches
    // (frames rendered with more room on the left match it exactly). n: -1 at the left edge, 0 at the B.
    const n = (st.mx * W - B0.x) / Math.max(1, B0.x);
    const u = .5 * Math.max(-1, Math.min(1, n)), v = st.my - .5, sc = Math.min(1, st.scroll / H);
    // in frames: the pointer's share of the frames left of rest (data-ta scales it), minus the scroll turning it away
    const turnF = n * TURN.rest * FA - 18 * sc / (FD * TURN.step);
    if (TURN.ready) TURN.mix = Math.min(1, TURN.mix + dt / .6);              // ease from the still plate to the frames
    return {
      gx: 3 * w * (1 - outQuart((t - .05) / 2.0)) - st.scroll * .45,   // the glass only moves with the intro and scroll: no idle crawl
      bx: B0.x - PLATE.dx * Hb * aspect - u * 26,
      by: B0.y - PLATE.dy * Hb - v * 14 + st.scroll * .3,
      side: st.sx,
      // one light sweep across the glass on load, then the light pool follows the pointer; at idle the light drifts
      pool: (() => { const k = outCubic((t - .4) / 2.4); const px = .72 + (st.sx - .5) * .36 + .07 * Math.sin(st.phase);
        return [-.25 + (px + .25) * k, .24 + v * .14 + .035 * Math.sin(st.phase * .63)]; })(),
      frame: Math.max(0, Math.min(TURN.n - 1, TURN.rest + turnF)),
      fade: outCubic((t - .1) / 1.2) * (1 - .35 * sc),
    };
  }
  function draw(s) {
    if (DEBUG) window.__frame = s.frame;                   // tests read the turn
    gl.uniform1i(U.uPlate, 0); gl.uniform1i(U.uRefr, 1);
    gl.uniform2f(U.uRes, cv.width, cv.height); gl.uniform1f(U.uDpr, dpr);
    const turning = LOOK.turn > .5 && TURN.ready;   // the plate and the frames share one box, so the size never changes
    gl.uniform2f(U.uBc, s.bx, s.by); gl.uniform2f(U.uBsz, Hb * aspect, Hb);
    gl.uniform1i(U.uTurn, 2); gl.uniform1f(U.uTurnOn, turning ? TURN.mix : 0); gl.uniform1f(U.uFrame, s.frame); gl.uniform1f(U.uFrames, TURN.n);
    gl.uniform1f(U.uGx, s.gx); gl.uniform1f(U.uW, w);
    gl.uniform1f(U.uBias, LOOK.bias); gl.uniform1f(U.uFade, s.fade);
    gl.uniform2f(U.uPool, s.pool[0], s.pool[1]);
    gl.uniform1f(U.uLz, LOOK.lz); gl.uniform1f(U.uLh, LOOK.lh); gl.uniform1f(U.uLw, LOOK.lw); gl.uniform1f(U.uRough, LOOK.rough); gl.uniform1f(U.uSpecI, LOOK.specI); gl.uniform1f(U.uEnvI, LOOK.envI); gl.uniform1f(U.uLoff, LOOK.loff); gl.uniform1f(U.uFil, LOOK.fil); gl.uniform1f(U.uPipe, LOOK.pipe); gl.uniform1f(U.uPipeBase, LOOK.pipeBase); gl.uniform1f(U.uSig, LOOK.sig); gl.uniform1f(U.uStripX, LOOK.stripX); gl.uniform1f(U.uStripW, LOOK.stripW); gl.uniform1f(U.uDark, LOOK.dark); gl.uniform1f(U.uSide, s.side);
    gl.uniform1f(U.uRefrK, LOOK.refrK); gl.uniform1f(U.uShade, LOOK.shade);
    gl.uniform3f(U.uBack, LOOK.back[0], LOOK.back[1], LOOK.back[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  let running = false, visible = true, raf = 0, win = 0, winN = 0, winStart = 0, goodSince = 0, lastChange = 0;
  function setTier(n, now) { tier = n; lastChange = now; goodSince = 0; layout(); }
  function frame(now) {
    if (!running) return;
    const dt = Math.min(.05, last ? (now - last) / 1000 : 1 / 60); last = now;
    draw(state(now, dt));
    win += dt * 1000; winN++;
    if (now - winStart > 1000) {
      const avg = win / winN;
      if (FORCED < 0 && now - t0 > 1500) {
        if (avg > 20 && tier < TIERS.length - 1) { ceiling = Math.max(ceiling, tier + 1); setTier(tier + 1, now); }
        else if (avg < 17.6) { goodSince = goodSince || now; if (tier - 1 >= ceiling && now - goodSince > 3000 && now - lastChange > 3000) setTier(tier - 1, now); }
        else goodSince = 0;
      }
      if (DEBUG) { diag.fps = `${Math.round(1000 / avg)} fps · tier ${tier} · dpr ${dpr} · ${cv.width}×${cv.height} · flute ${w.toFixed(1)}px`; report(); }
      win = 0; winN = 0; winStart = now;
    }
    raf = requestAnimationFrame(frame);
  }
  let lost = false;
  const start = () => { if (lost || POSTER || STILL || running || !visible || document.hidden || !ready || document.documentElement.classList.contains('lb-on')) return; running = true; last = 0; winStart = performance.now(); raf = requestAnimationFrame(frame); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }, { threshold: 0 }).observe(hero);
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  document.addEventListener('viewer:open', stop); document.addEventListener('viewer:close', start);   // the full-screen viewer covers the hero: no need to draw it
  addEventListener('resize', () => { layout(); if (!running && ready) draw(state(performance.now(), 0)); }, { passive: true });
  // A lost context (driver reset, a laptop switching graphics chips, too many tabs) usually comes back: wait for it and
  // rebuild. Only if it stays lost, or is lost again, does the still picture stand in.
  let losses = 0, lostTimer = 0;
  cv.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); stop(); losses++; lost = true; diag.mode = 'paused (graphics context lost)';
    diag.why.push(`graphics context lost (${losses}x)`); report();
    clearTimeout(lostTimer);
    lostTimer = setTimeout(() => fallback('the lost context did not come back'), losses > 1 ? 0 : 2500);
  });
  cv.addEventListener('webglcontextrestored', () => {
    if (losses > 1 || !cv.parentNode) return;
    clearTimeout(lostTimer); lost = false; diag.mode = 'live';
    try {
      setup();
      if (IMG.plate) { upload(0, IMG.plate, { premult: true }); upload(1, IMG.refr, { repeat: true, mips: false }); }
      if (TURN.ims) uploadTurn(TURN.ims);
      layout();
    } catch (err) { console.error(err); fallback('could not rebuild after a lost context: ' + err.message); return; }
    diag.why.push('context restored'); report();
    if (POSTER || STILL) draw(state(performance.now(), 0)); else start();
  });

  const load = (src) => new Promise((res, rej) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = rej; im.src = src; });
  const upload = (unit, im, { premult = false, repeat = false, mips = true } = {}) => {
    const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premult); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  const IMG = {};
  function uploadTurn(ims) {
      const w0 = ims[0].naturalWidth, h0 = ims[0].naturalHeight, lv = 1 + Math.floor(Math.log2(Math.max(w0, h0)));
      const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, lv, gl.RGBA8, w0, h0, TURN.n);
      ims.forEach((im, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, w0, h0, 1, gl.RGBA, gl.UNSIGNED_BYTE, im));
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      TURN.aspect = w0 / h0; TURN.ready = true;
  }
  function loadTurn() {                                   // turntable frames load after the hero is up, into one texture array
    Promise.all(Array.from({ length: TURN.n }, (_, i) => load(`${TURN_SRC}${i * TURN.step}.webp${hero.dataset.tv ? '?v=' + hero.dataset.tv : ''}`)))
      .then((ims) => { TURN.ims = ims; uploadTurn(ims); }).catch((e) => console.warn('turn frames unavailable', e));
  }
  Promise.all([load(PLATE_SRC), load(BASE + 'a/glass-refraction.png')]).then(([plateImg, refrImg]) => {
    try {
      IMG.plate = plateImg; IMG.refr = refrImg;
      aspect = plateImg.naturalWidth / plateImg.naturalHeight;
      try {                                                 // the visible B inside the plate (its alpha), for placeB
        const c2 = document.createElement('canvas'), sw = 160, sh = Math.max(1, Math.round(160 / aspect));
        c2.width = sw; c2.height = sh; const x2 = c2.getContext('2d', { willReadFrequently: true }); x2.drawImage(plateImg, 0, 0, sw, sh);
        const a = x2.getImageData(0, 0, sw, sh).data; let l = sw, r = -1;
        for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) if (a[(yy * sw + xx) * 4 + 3] > 24) { if (xx < l) l = xx; if (xx > r) r = xx; }
        if (r > l) VIS = [(l / sw - .5) * aspect, ((r + 1) / sw - .5) * aspect];
      } catch (e) { /* keep the estimate */ }
      upload(0, plateImg, { premult: true });
      upload(1, refrImg, { repeat: true, mips: false });     // shifts must not be averaged across the seam
      layout();
    } catch (err) { console.error(err); fallback('could not set up the textures: ' + err.message); return; }
    ready = true; t0 = performance.now();
    if (document.fonts) document.fonts.ready.then(() => { layout(); if (!running) draw(state(performance.now(), 0)); });
    if (LOOK.turn > 0 && !POSTER && !STILL && HAS_TURN) loadTurn();
    report();
    // test hook: ?lose loses the context 3 s in (?lose=hold keeps it lost) to check the recovery
    if (flags.has('lose')) { const ext = gl.getExtension('WEBGL_lose_context'); setTimeout(() => { ext.loseContext(); if (flags.get('lose') !== 'hold') setTimeout(() => ext.restoreContext(), 800); }, 3000); }
    if (POSTER || STILL) { t0 -= 10000; st.gate = 0; lastAct = performance.now(); const s0 = state(performance.now(), 0); s0.gx += +(flags.get('gx') || 0); draw(s0); if (POSTER) window.__posterReady = true; return; }
    start();
  }).catch((e) => fallback('the hero images did not load: ' + (e && e.type || e)));
})();
