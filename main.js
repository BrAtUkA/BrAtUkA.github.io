/* ══════════════════════════════════════════════════════════════
   BrAtUkA — interaction engine
   GPU liquid-glass background (single fragment shader) that the
   cursor sculpts + ripples. No backdrop-filter. vanilla JS · no deps.
   ══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp  = (a, b, t) => a + (b - a) * t;
  const pad   = (n, l = 2) => String(n).padStart(l, '0');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;
  document.documentElement.classList.add('js');   // arms scroll-reveal CSS (degrades gracefully if JS fails)
  let pointerHeld = false;                         // drives the held-press content dent

  const state = { rawx: innerWidth / 2, rawy: innerHeight / 2, t: 0 };

  /* ════════ AUDIO (opt-in) ═════════════════════════════════ */
  const audio = (() => {
    let ctx = null, on = false, master = null, friction = null, whiteBuf = null;
    const makeIR = (sec, decay) => {                         // procedural reverb impulse (glassy space)
      const rate = ctx.sampleRate, len = Math.floor(rate * sec), buf = ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
      return buf;
    };
    const ensure = () => {
      if (ctx) return;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.9;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.5;
      const dry = ctx.createGain(); dry.gain.value = 0.85;
      const verb = ctx.createConvolver(); verb.buffer = makeIR(1.8, 3.0);
      const wet = ctx.createGain(); wet.gain.value = 0.22;
      master.connect(lp); lp.connect(dry).connect(ctx.destination);
      lp.connect(verb); verb.connect(wet).connect(ctx.destination);
      // short white-noise buffer for percussive contact transients (the "tick" of a tap)
      whiteBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
      const wd = whiteBuf.getChannelData(0); for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
      // cursor "rub" — looping BROWN noise (deep, silky, not hissy) through a low band-pass
      const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
      let bn = 0;
      for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; bn = (bn + 0.02 * w) / 1.02; nd[i] = bn * 3.2; }
      const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.8;
      const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 1400; lp2.Q.value = 0.5;
      const fg = ctx.createGain(); fg.gain.value = 0;
      src.connect(bp).connect(lp2).connect(fg).connect(master);
      src.start();
      friction = { gain: fg, bp };
    };
    // one soft glassy voice: gentle attack, smooth tail, optional pitch glide + detuned partner
    const voice = (freq, { type = 'sine', vol = 0.15, dur = 0.4, glide = 1, detune = 0, attack = 0.012 } = {}) => {
      if (!on || !ctx) return;
      const t = ctx.currentTime, g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(master);
      const osc = (dt) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
        if (dt) o.detune.value = dt;
        if (glide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * glide), t + dur * 0.9);
        o.connect(g); o.start(t); o.stop(t + dur + 0.05); };
      osc(0); if (detune) osc(detune);
    };
    // a short filtered noise burst — the percussive "contact" of a tap
    const noiseHit = (freq, { dur = 0.04, vol = 0.05, Q = 1, type = 'bandpass' } = {}) => {
      if (!on || !ctx || !whiteBuf) return;
      const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = whiteBuf;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q;
      const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.2); s.stop(t + dur + 0.02);
    };
    return {
      set(v){ on = v;
        if (v){ ensure(); ctx.resume?.(); voice(523.25, { vol: .12, dur: .5 }); voice(784, { vol: .07, dur: .6, attack: .03 }); }
        else if (friction){ friction.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } },
      get on(){ return on; },
      tap(freq){ freq = freq * 0.5 + 90;                                                             // rounder, lower register (less "ting")
                 noiseHit(800, { dur: .028, vol: .035, Q: .7, type: 'lowpass' });                    // soft contact pock (not a bright tick)
                 voice(freq,        { type: 'sine', vol: .13,  dur: .2,  attack: .002 });            // clean body — FAST decay (glass is highly damped)
                 voice(freq * 2.0,  { type: 'sine', vol: .04,  dur: .12, attack: .001 });            // harmonic octave sparkle, short
                 voice(freq * 3.01, { type: 'sine', vol: .018, dur: .06, attack: .001 });            // faint top shimmer, near-instant (no bell ring)
                 voice(freq * 0.5,  { type: 'sine', vol: .055, dur: .28, attack: .004 }); },         // low weight
      rub(level){ if (!on || !ctx || !friction) return;                                              // deep ceramic/silk rub
                  const t = ctx.currentTime;
                  friction.gain.gain.setTargetAtTime(level * level * 0.03, t, 0.05);                 // squared + quiet → subtle
                  friction.bp.frequency.setTargetAtTime(400 + level * 520, t, 0.07); },              // low register, opens a touch with speed
      tick(freq = 680){ voice(freq, { type: 'triangle', vol: .04, dur: .12 }); },                    // ui hover
      tock(freq = 300){ noiseHit(900, { dur: .012, vol: .025, Q: .7, type: 'lowpass' });             // ui click (soft glass tap)
                        voice(freq, { type: 'sine', vol: .07, dur: .16, attack: .002 });
                        voice(freq * 2.0, { type: 'sine', vol: .022, dur: .09 }); },                 // harmonic, short — no metallic ring
    };
  })();

  /* ════════ LIQUID-GLASS SCENE (WebGL) ═════════════════════ */
  const scene = (() => {
    const cv = $('#bg');
    let gl = null;
    // phones skip WebGL entirely and use the lightweight CSS aurora backdrop (see .mbg)
    try { if (!coarse) gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' }) || cv.getContext('experimental-webgl'); } catch (e) { gl = null; }
    const ctx2d = (gl || coarse) ? null : cv.getContext('2d');

    let W = 1, H = 1;
    const RN = 14;                                    // max content blocks (gentle readability calm)
    const rbuf = new Float32Array(RN * 4); let rcount = 0;
    let mx = 0, my = 0, tmx = 0, tmy = 0, press = 0, pvel = 0, pressTarget = 0;
    let dent = 0, dentX = 0, dentY = 0;                              // held-press dent: persists, relaxes slowly

    const toP = (cx, cy) => [ (cx - innerWidth * 0.5) / innerHeight, (innerHeight * 0.5 - cy) / innerHeight ];

    // noise differs by device: desktop keeps the original full-precision hash (smooth, but cracks on weak mobile GPUs);
    // phones read noise from a 16-bit texture (immune to GPU float precision → no cracks, no 8-bit grain).
    const noiseGLSL = coarse ? `
      uniform sampler2D uNoise;
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        vec4 t=texture2D(uNoise,(i+f+0.5)*0.00390625);
        return (t.r*256.0 + t.g)*(1.0/257.0); }                  // R=hi byte, G=lo byte → 16-bit value, no grain
    ` : `
      float hash(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
      float noise(vec2 p){ vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y); }
    `;
    const FS = `precision highp float;
      uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uPress; uniform float uScroll; uniform vec2 uVel; uniform float uDent; uniform vec2 uDentPos;
      uniform vec4 uRect[${RN}]; uniform int uRectN;            // content blocks: (cx,cy,halfW,halfH) in p-space
      ${noiseGLSL}
      float fbm(vec2 p){ float v=0.0,a=0.5; mat2 m=mat2(1.6,1.2,-1.2,1.6);
        for(int i=0;i<${coarse ? 3 : 4};i++){ v+=a*noise(p); p=m*p; a*=0.5; } return v; }
      float fluid(vec2 p){
        float t=uTime*0.06;
        vec2 ps=p+vec2(0.0,uScroll);
        vec2 q=vec2(fbm(ps+vec2(0.0,t)), fbm(ps+vec2(4.3,1.7)-vec2(t,0.0)));
        return fbm(ps*1.6 + 1.3*q);
      }
      float sdRR(vec2 p, vec2 c, vec2 b, float r){ vec2 q=abs(p-c)-b+r; return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r; }
      const float FALL=0.13;
      float smin(float a, float b, float k){ float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0); return mix(b,a,h)-k*h*(1.0-h); }
      float contentSDF(vec2 pp){                      // flow-WARPED smooth-union → genuinely fluid pools, not rects
        vec2 q = vec2(noise(pp*6.0 + vec2(0.0, uTime*0.05)), noise(pp*6.0 + vec2(3.7, -uTime*0.05))) - 0.5;
        float d=1000.0;
        for(int i=0;i<${RN};i++){ if(i<uRectN){ vec2 c=uRect[i].xy, b=uRect[i].zw;
          float amp = 0.13 * smoothstep(0.015, 0.07, min(b.x,b.y));  // thin blocks warp far LESS → stay hugging the text
          d=smin(d, sdRR(pp + q*amp, c, b, min(b.x,b.y)*0.55), 0.07); } }
        vec2 rel = pp - uDentPos;
        vec2 off = uVel * 1.6;                          // push direction from cursor travel (≈0 when still → symmetric)
        off /= max(1.0, length(off)/0.17);             // cap how far the lobes split apart
        float gRec = exp(-dot(rel+off*0.6, rel+off*0.6)*7.0);  // SINK biased to trail behind the push
        float gBul = exp(-dot(rel-off, rel-off)*2.0);          // displaced fluid PILES / wraps AHEAD in travel direction
        d += uDent * (gRec - 0.32*gBul) * 0.14;        // HELD press: directional shove + wrap (collision); slow via JS
        return d;
      }
      float veilAt(vec2 pp){ return smoothstep(FALL,0.0, contentSDF(pp)); }
      float bulgeAt(vec2 pp){ float dm=length(pp-uMouse); return (0.42+uPress*0.3)*exp(-dm*dm*9.0); }
      float height(vec2 pp){
        float dC = contentSDF(pp);
        float wall = smoothstep(-0.04, 0.0, dC);      // content is an OBSTACLE: ripples hug the edge, can't slip under
        float b = bulgeAt(pp) * wall;                 // bulge blocked inside content → piles up & wraps around it
        vec2 toM = pp-uMouse;
        vec2 warp = -toM*b*0.5 - uVel*b*1.0;          // warp follows the blocked bulge → fluid flows AROUND content
        return fluid(pp+warp) + b - smoothstep(FALL,0.0,dC)*0.12;
      }
      void main(){
        vec2 p=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
        float veil=veilAt(p);                         // content coverage → readability calm + collision

        float e=${coarse ? '0.010' : '0.006'};
        float h=height(p);
        float hx=height(p+vec2(e,0.0))-h;
        float hy=height(p+vec2(0.0,e))-h;
        vec3 n=normalize(vec3(-hx/e,-hy/e,1.0));
        float c=abs(fract(h*6.0)-0.5)*2.0;                      // flowing contour rings (fewer = calmer on click)
        float line=smoothstep(${coarse ? '0.30' : '0.18'},0.0,c);   // wider/softer on phones → no aliased jaggies
        vec3 L=normalize(vec3(0.5,0.65,0.8));
        float spec=pow(max(dot(n,L),0.0),${coarse ? '15.0' : '26.0'});  // broader highlight on phones → less shimmer
        float fres=pow(1.0-clamp(n.z,0.0,1.0),2.0);
        vec3 base=vec3(0.018,0.022,0.03);
        vec3 red=vec3(1.0,0.20,0.30);
        vec3 col=base;
        col+=line*mix(vec3(0.42,0.47,0.52),red,smoothstep(0.35,0.85,h))*0.62*(1.0-veil*0.6);
        col+=spec*vec3(1.0,0.96,0.96)*0.85*(1.0-veil*0.9);
        col+=fres*red*0.20*(1.0-veil*0.6);
        float dm=length(p-uMouse);
        col+=exp(-dm*dm*9.0)*red*(0.12+uPress*0.4)*(1.0-veil*0.35);    // cursor red glow (tighter, no spread)
        col+=exp(-dm*dm*18.0)*(0.02+uPress*0.07)*vec3(1.0,0.55,0.62)*(1.0-veil*0.3);  // tiny warm glint (no white wash)
        col*=(1.0-veil*0.42);                                   // gentle darken for readability
        float asp=uRes.x/uRes.y;
        vec2 vg=(gl_FragCoord.xy/uRes-0.5)*vec2(asp,1.0);
        col*=1.0-0.55*pow(length(vg),2.2);                      // vignette
        gl_FragColor=vec4(col,1.0);
      }`;

    let prog, uRes, uTime, uMouse, uPress, uScroll, uRectLoc, uRectNLoc, uVelLoc, uDentLoc, uDentPosLoc;
    const initGL = () => {
      const mk = (ty, src) => { const s = gl.createShader(ty); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      prog = gl.createProgram();
      gl.attachShader(prog, mk(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position=vec4(p,0.0,1.0); }'));
      gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const pl = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
      uRes = gl.getUniformLocation(prog, 'uRes'); uTime = gl.getUniformLocation(prog, 'uTime');
      uMouse = gl.getUniformLocation(prog, 'uMouse'); uPress = gl.getUniformLocation(prog, 'uPress');
      uScroll = gl.getUniformLocation(prog, 'uScroll');
      uRectLoc = gl.getUniformLocation(prog, 'uRect[0]'); uRectNLoc = gl.getUniformLocation(prog, 'uRectN');
      uVelLoc = gl.getUniformLocation(prog, 'uVel');
      uDentLoc = gl.getUniformLocation(prog, 'uDent'); uDentPosLoc = gl.getUniformLocation(prog, 'uDentPos');
      if (coarse) {                                                    // mobile only — desktop uses the float hash, no texture needed
        const NS = 256, ND = new Uint8Array(NS * NS * 4);              // 16-bit noise: R = hi byte, G = lo byte
        for (let i = 0; i < NS * NS; i++) { const r = Math.random() * 65535 | 0; ND[i*4] = r >> 8; ND[i*4+1] = r & 255; }
        const ntex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ntex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NS, NS, 0, gl.RGBA, gl.UNSIGNED_BYTE, ND);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // POT (256) → REPEAT allowed → seamless tiling
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.uniform1i(gl.getUniformLocation(prog, 'uNoise'), 0);
      }
    };
    if (gl) { try { initGL(); } catch (e) { console.warn('webgl scene off:', e.message); gl = null; } }

    const resize = () => {
      const maxDim = coarse ? 900 : 1500;                        // cap render res → consistent FPS
      let scl = Math.min(1, maxDim / Math.max(innerWidth, innerHeight));
      if (coarse) scl *= 0.62;                                   // extra downscale on phones — fluid is soft, upscaling is invisible
      W = Math.max(1, Math.round(innerWidth * scl));
      H = Math.max(1, Math.round(innerHeight * scl));
      cv.width = W; cv.height = H;
      cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
      if (gl) gl.viewport(0, 0, W, H);
    };
    addEventListener('resize', resize, { passive: true });
    resize();

    let fallbackPainted = false;
    let vmx = 0, vmy = 0;
    const draw = (dt) => {
      state.t += dt;
      vmx = lerp(vmx, tmx - mx, 0.4); vmy = lerp(vmy, tmy - my, 0.4);   // smoothed residual ≈ velocity → wake
      mx = lerp(mx, tmx, 0.26); my = lerp(my, tmy, 0.26);              // follow the cursor crisply
      pvel += ((pressTarget - press) * 160 - pvel * 13) * dt;          // springy press
      press += pvel * dt;
      if (pointerHeld) {                                              // press SLOWLY builds the dent (content resists)
        dent = lerp(dent, 1.0, 0.018);
        dentX = lerp(dentX, mx, 0.16); dentY = lerp(dentY, my, 0.16);
      } else {
        dent = lerp(dent, 0.0, 0.006);                                // grow back SLOWLY after release (~several seconds)
      }

      if (!gl) {                                                    // graceful fallback
        if (ctx2d && !fallbackPainted) {
          const g = ctx2d.createRadialGradient(W/2, H, 0, W/2, H, W);
          g.addColorStop(0, '#12060a'); g.addColorStop(1, '#06070a');
          ctx2d.fillStyle = g; ctx2d.fillRect(0, 0, W, H); fallbackPainted = true;
        }
        return;
      }
      gl.uniform2f(uRes, W, H);
      gl.uniform1f(uTime, state.t);
      gl.uniform2f(uMouse, mx, my);
      gl.uniform1f(uPress, press);
      gl.uniform1f(uScroll, (window.pageYOffset || 0) / innerHeight * 0.45);
      gl.uniform2f(uVelLoc, vmx, vmy);
      gl.uniform1f(uDentLoc, dent);
      gl.uniform2f(uDentPosLoc, dentX, dentY);
      gl.uniform4fv(uRectLoc, rbuf);
      gl.uniform1i(uRectNLoc, rcount);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    return {
      draw,
      setMouse: (cx, cy) => { const p = toP(cx, cy); tmx = p[0]; tmy = p[1]; },
      setPress: (v) => { pressTarget = v; },
      pulse:    () => { pvel += 6.5; },          // velocity kick → springy pop on press (taller ripples)
      setRects: (arr, n) => {
        rcount = Math.min(n, RN);
        for (let i = 0; i < rcount * 4; i++) rbuf[i] = arr[i];
        for (let i = rcount * 4; i < RN * 4; i++) rbuf[i] = 0;
      },
    };
  })();

  /* ════════ CUSTOM CURSOR (press lock-on) ══════════════════ */
  const cursor = $('#cursor'), cdot = $('.cursor__dot', cursor), cring = $('.cursor__ring', cursor), cpulse = $('.cursor__pulse', cursor);
  let curX = innerWidth / 2, curY = innerHeight / 2, cursorReady = false;
  let rScale = 1, dScale = 1, hot = false, down = false;
  const placeCursor = () => {
    cdot.style.transform  = `translate(${state.rawx}px, ${state.rawy}px) translate(-50%,-50%) scale(${dScale})`;
    cring.style.transform = `translate(${curX}px, ${curY}px) translate(-50%,-50%) scale(${rScale})`;
  };
  const hotSel = 'button, a, input, .magnetic, .chip, [tabindex], .work__media';
  if (!coarse) {
    addEventListener('pointermove', (e) => {
      state.rawx = e.clientX; state.rawy = e.clientY;
      if (!cursorReady) { cursorReady = true; curX = e.clientX; curY = e.clientY;
        cursor.classList.add('is-active'); document.body.dataset.cc = '1'; placeCursor(); }
    }, { passive: true });
    addEventListener('pointerdown', (e) => {
      down = true; cursor.classList.add('is-down');
      cpulse.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      cpulse.classList.remove('go'); void cpulse.offsetWidth; cpulse.classList.add('go');
    });
    addEventListener('pointerup', () => { down = false; cursor.classList.remove('is-down'); });
    document.addEventListener('pointerover', (e) => {
      if (e.target instanceof Element && e.target.closest(hotSel)) { hot = true; cursor.classList.add('is-hot'); }
    });
    document.addEventListener('pointerout', (e) => {
      if (e.target instanceof Element && e.target.closest(hotSel) && !e.relatedTarget?.closest?.(hotSel)) { hot = false; cursor.classList.remove('is-hot'); }
    });
  }

  /* ════════ POINTER → SCENE + HUD + AUDIO ══════════════════ */
  const SCALE = [0, 2, 4, 7, 9];
  const noteFreq = (x, y) => {
    const nx = clamp(x / innerWidth, 0, 1), ny = clamp(y / innerHeight, 0, 1);
    const note = SCALE[Math.floor(nx * SCALE.length) % SCALE.length];
    const octave = Math.round(lerp(coarse ? 3.6 : 2, 5, 1 - ny));   // phones: keep notes above speaker bass roll-off so lower-screen taps are audible
    return 440 * Math.pow(2, ((24 + octave * 12 + note) - 69) / 12);
  };
  const trackPointer = (x, y) => {
    state.rawx = x; state.rawy = y;
    const hc = $('#hud-coords'); if (hc) hc.textContent = `X${pad(Math.round(x), 3)} Y${pad(Math.round(y), 3)}`;
  };
  addEventListener('pointermove', (e) => { trackPointer(e.clientX, e.clientY); scene.setMouse(e.clientX, e.clientY); }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;                     // only primary click / touch — leave middle-click autoscroll, right-click menu, etc. alone
    scene.setPress(1); scene.pulse(); pointerHeld = true;
    const el = e.target;
    if (el instanceof Element && el.closest('button, a, input, .chip, #intro, .work__media')) return;
    e.preventDefault();
    audio.tap(noteFreq(e.clientX, e.clientY));
  });
  addEventListener('pointerup',     () => { scene.setPress(0); pointerHeld = false; });
  addEventListener('pointercancel', () => { scene.setPress(0); pointerHeld = false; });
  addEventListener('dragstart', (e) => e.preventDefault());   // no native drag-ghost square while click-dragging

  /* ════════ MAGNETIC BUTTONS + RIPPLE + BLIPS ══════════════ */
  if (!coarse) $$('.magnetic').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * 0.25}px, ${(e.clientY - (r.top + r.height / 2)) * 0.3}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
  $$('.btn').forEach((b) => {
    b.addEventListener('pointerenter', () => audio.tick(b.dataset.blip === 'hi' ? 740 : 560));
    b.addEventListener('click', (e) => {
      const r = b.getBoundingClientRect(), rip = document.createElement('span');
      rip.className = 'ripple';
      rip.style.width = rip.style.height = Math.max(r.width, r.height) * 2.2 + 'px';
      rip.style.left = (e.clientX - r.left) + 'px'; rip.style.top = (e.clientY - r.top) + 'px';
      b.appendChild(rip); setTimeout(() => rip.remove(), 600);
      audio.tock(b.dataset.blip === 'hi' ? 523 : 392);
    });
  });
  $$('.chip').forEach((c) => c.addEventListener('pointerenter', () => audio.tick(660)));

  /* ════════ TEXT SCRAMBLE ══════════════════════════════════ */
  class Scramble {
    constructor(el){ this.el = el; this.chars = '!<>-_\\/[]{}=+*#0アキ▓▒░ΞΣ'; }
    to(text){
      const old = this.el.textContent, len = Math.max(old.length, text.length);
      this.q = [];
      for (let i = 0; i < len; i++){
        const start = Math.floor(Math.random() * 18), end = start + 12 + Math.floor(Math.random() * 22);
        this.q.push({ from: old[i] || '', to: text[i] || '', start, end, ch: '' });
      }
      cancelAnimationFrame(this.raf); this.frame = 0;
      return new Promise(res => { this.res = res; this.tick(); });
    }
    tick(){
      let out = '', done = 0;
      for (const q of this.q){
        if (this.frame >= q.end){ done++; out += q.to; }
        else if (this.frame >= q.start){
          if (!q.ch || Math.random() < .28) q.ch = this.chars[Math.floor(Math.random() * this.chars.length)];
          out += `<span style="color:var(--red);opacity:.85">${q.ch}</span>`;
        } else out += q.from;
      }
      this.el.innerHTML = out;
      if (done === this.q.length){ this.res?.(); return; }
      this.frame++; this.raf = requestAnimationFrame(() => this.tick());
    }
  }
  const heroTitle = $('#heroTitle'), heroScr = new Scramble(heroTitle);
  const reHero = () => heroScr.to('BrAtUkA').then(() => { heroTitle.textContent = 'BrAtUkA'; });
  const kick = (el) => { el.classList.add('is-glitching'); setTimeout(() => el.classList.remove('is-glitching'), 420); };
  const reglitch = () => { reHero(); kick(heroTitle); };
  $('#reglitch')?.addEventListener('click', reglitch);
  heroTitle.addEventListener('click', reglitch);                 // click the name → replay the scramble
  heroTitle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reglitch(); } });
  if (!reduceMotion) setInterval(() => { if (!document.hidden && Math.random() < .5) kick(heroTitle); }, 7000);

  /* ════════ AUDIO TOGGLE ═══════════════════════════════════ */
  const at = $('#audioToggle');
  at?.addEventListener('click', () => {
    const on = !at.classList.contains('is-on');
    at.classList.toggle('is-on', on);
    at.querySelector('b').textContent = on ? 'ON' : 'OFF';
    document.body.dataset.audio = on ? 'on' : 'off';
    audio.set(on);
  });

  /* ════════ HUD CLOCK + FPS ════════════════════════════════ */
  const elClock = $('#hud-clock'), elFps = $('#hud-fps');
  setInterval(() => {
    const d = new Date();
    elClock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }, 1000);

  /* ════════ SCROLL FX (progress · reveals · parallax · counters) ══ */
  (() => {
    const prog = $('#scrollProg'), secLabel = $('#hud-section');
    const sections = $$('.hero, .sec');

    let ticking = false;
    const onScroll = () => {
      ticking = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (prog) prog.style.width = (max > 0 ? clamp(scrollY / max, 0, 1) * 100 : 0).toFixed(2) + '%';
      let cur = sections[0];
      for (const s of sections) if (s.getBoundingClientRect().top <= innerHeight * 0.42) cur = s;
      if (secLabel && cur) secLabel.textContent = '// ' + (cur.dataset.label || '');
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();

    // smooth-scroll for in-page buttons
    $$('[data-scroll]').forEach(b => b.addEventListener('click', () => {
      const t = $(b.dataset.scroll); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

    // count-up
    const runCount = (el) => {
      el.dataset.counted = '1';
      const target = parseFloat(el.dataset.count) || 0, dur = 1500, t0 = performance.now();
      const step = (now) => {
        const k = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(target * e).toLocaleString() + (k >= 1 && el.dataset.plus ? '+' : '');
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    // work-card 3D tilt + hue variety
    if (!coarse) $$('[data-tilt]').forEach(card => {
      const media = $('.work__media', card);
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
        if (media) media.style.transform = `rotateY(${px * 13}deg) rotateX(${-py * 13}deg)`;
      });
      card.addEventListener('pointerleave', () => { if (media) media.style.transform = ''; });
    });
    // hover ticks across the interactive bits
    $$('.contact__mail, .socials a, .work').forEach(el => el.addEventListener('pointerenter', () => audio.tick(620)));
    // clicking a card's image opens its primary link (same as the link under it)
    $$('.work').forEach(w => { const m = $('.work__media', w), a = $('.work__link', w);
      if (m && a) m.addEventListener('click', () => window.open(a.href, '_blank', 'noopener')); });

    // reveals / parallax — GSAP if present, else IntersectionObserver
    const reveals = $$('.reveal'), counters = $$('[data-count]'), steps = $$('.step');
    const g = window.gsap, ST = window.ScrollTrigger;
    if (g && ST) {
      g.registerPlugin(ST);
      reveals.forEach(el => g.fromTo(el, { y: 36, opacity: 0 }, {
        y: 0, opacity: 1, duration: .9, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 87%', onEnter: () => el.classList.add('is-in') } }));
      $$('.work__num').forEach(n => g.to(n, { yPercent: -28, ease: 'none',
        scrollTrigger: { trigger: n.closest('.work'), start: 'top bottom', end: 'bottom top', scrub: true } }));
      counters.forEach(c => ST.create({ trigger: c, start: 'top 88%', once: true, onEnter: () => runCount(c) }));
      steps.forEach(s => ST.create({ trigger: s, start: 'top 85%', once: true, onEnter: () => s.classList.add('is-in') }));
      addEventListener('load', () => ST.refresh());                       // re-measure after fonts settle
    } else {
      const io = new IntersectionObserver((ents) => ents.forEach(en => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        if (en.target.dataset && en.target.dataset.count) runCount(en.target);
        io.unobserve(en.target);
      }), { threshold: .18 });
      [...reveals, ...steps, ...counters].forEach(el => io.observe(el));
    }

    /* live GitHub stats + top repos (cached 1h) — same source as bratuka.dev */
    const ghMap = { 'gh-repos': 'reposCount', 'gh-stars': 'starsCount', 'gh-followers': 'followersCount' };
    const renderGH = (d) => {
      for (const id in ghMap) {
        const el = $('#' + id), v = d[ghMap[id]];
        if (el && v != null) { el.dataset.count = v; if (el.dataset.counted) runCount(el); }
      }
      if (d.starMap) {                                  // live star counts onto the project cards
        $$('.work[data-repo]').forEach(w => {
          const s = d.starMap[(w.dataset.repo || '').toLowerCase()], b = w.querySelector('.work__stars b');
          if (b && s != null) b.textContent = s;
        });
      }
    };
    (async () => {
      const user = 'BrAtUkA', CK = 'gh_cache_v3', TK = 'gh_cache_t', TTL = 3600e3;
      try {
        const ct = +localStorage.getItem(TK), cc = localStorage.getItem(CK);
        if (ct && cc && Date.now() - ct < TTL) { renderGH(JSON.parse(cc)); return; }
        const [u, r] = await Promise.all([
          fetch(`https://api.github.com/users/${user}`),
          fetch(`https://api.github.com/users/${user}/repos?per_page=100`),
        ]);
        if (!u.ok || !r.ok) throw 0;
        const us = await u.json(), repos = await r.json();
        const stars = repos.reduce((a, x) => a + (x.stargazers_count || 0), 0);
        const starMap = {}; repos.forEach(r => { starMap[r.name.toLowerCase()] = r.stargazers_count || 0; });
        const data = { reposCount: us.public_repos, followersCount: us.followers, starsCount: stars, starMap };
        try { localStorage.setItem(CK, JSON.stringify(data)); localStorage.setItem(TK, String(Date.now())); } catch (e) {}
        renderGH(data);
      } catch (e) { /* keep the static fallback */ }
    })();
  })();

  /* ════════ CONTENT-AWARE VEIL — feed live element rects to the shader ══ */
  const veilEls = $$('.hero__title, .hero__tagline, .hero__lede, .hero__cta, .about__text, .about__facts, .sec__head, .stats, .work__media, .work__body, .contact__big, .contact__sub, .contact__mail, .socials, .foot');
  const veilTmp = new Float32Array(56);   // 14 blocks × 4
  const veilRange = document.createRange();
  const tightRect = (el) => {                 // hug the actual text glyphs, not the (wider) div box
    try { veilRange.selectNodeContents(el); const r = veilRange.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) return r; } catch (e) {}
    return el.getBoundingClientRect();
  };
  const buildVeil = () => {
    const ih = innerHeight, iw = innerWidth, pad = 7, vis = [];
    for (const el of veilEls) {
      const r = el.classList.contains('work__media') ? el.getBoundingClientRect() : tightRect(el);  // cards use full box, not text glyphs
      if (r.width < 2 || r.bottom < -80 || r.top > ih + 80) continue;
      vis.push(r);
    }
    vis.sort((a, b) => Math.abs((a.top + a.bottom) * .5 - ih * .5) - Math.abs((b.top + b.bottom) * .5 - ih * .5));
    const n = Math.min(vis.length, 14);
    for (let i = 0; i < n; i++) {
      const r = vis[i];
      veilTmp[i * 4]     = (r.left + r.width  * .5 - iw * .5) / ih;
      veilTmp[i * 4 + 1] = (ih * .5 - (r.top + r.height * .5)) / ih;
      veilTmp[i * 4 + 2] = (r.width  * .5 + pad) / ih;
      veilTmp[i * 4 + 3] = (r.height * .5 + pad) / ih;
    }
    scene.setRects(veilTmp, n);
  };

  /* ════════ MAIN LOOP ══════════════════════════════════════ */
  let prev = performance.now(), fAcc = 0, fCnt = 0, prubX = state.rawx, prubY = state.rawy, rubLevel = 0;
  const frame = (now) => {
    const dt = Math.min((now - prev) / 1000, .05); prev = now;
    if (cursorReady && !coarse) {
      curX = lerp(curX, state.rawx, .3); curY = lerp(curY, state.rawy, .3);
      rScale = lerp(rScale, down ? 0.5 : (hot ? 1.6 : 1), .25);
      dScale = lerp(dScale, down ? 2.0 : 1, .25);
      placeCursor();
    }
    // cursor-rub friction sound, driven by pointer speed (rises moving, fades when still)
    const sp = Math.hypot(state.rawx - prubX, state.rawy - prubY); prubX = state.rawx; prubY = state.rawy;
    rubLevel = lerp(rubLevel, clamp(sp / 16, 0, 1), 0.25);
    audio.rub(rubLevel);
    if (!coarse) { buildVeil(); scene.draw(dt); }              // phones skip the fluid + per-frame reflow entirely
    fAcc += dt; fCnt++;
    if (fAcc >= .5) { elFps.textContent = `FPS ${pad(Math.round(fCnt / fAcc))}`; fCnt = 0; fAcc = 0; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  /* ════════ MOBILE BACKDROP — subtle dark field + interactive red contour ripples (echoes desktop) ═══ */
  if (coarse) {
    const cnv = $('#bg'); if (cnv) cnv.style.display = 'none';    // hide the unused WebGL canvas
    let mbg = $('.mbg');
    if (mbg) mbg.innerHTML = ''; else { mbg = document.createElement('div'); mbg.className = 'mbg'; mbg.setAttribute('aria-hidden', 'true'); document.body.insertBefore(mbg, document.body.firstChild); }
    Object.assign(mbg.style, { display:'block', position:'fixed', inset:'0', zIndex:'0', overflow:'hidden',
      isolation:'isolate', pointerEvents:'none', background:'radial-gradient(125% 95% at 50% 0%, #130a0f, #050507 66%)' });

    // ambient aurora — DIM + slow, just enough life (no red wash, so text stays readable without boxy calm)
    const defs = [
      { s:{ width:'120vw', height:'120vw', left:'-30vw', top:'-26vh', background:'radial-gradient(circle at 50% 50%, rgba(255,58,78,.28), transparent 60%)' },
        k:[{transform:'translate(0,0) scale(1)'},   {transform:'translate(16vw,12vh) scale(1.25)'}], d:19000 },
      { s:{ width:'105vw', height:'105vw', right:'-30vw', top:'14vh', background:'radial-gradient(circle at 50% 50%, rgba(80,110,180,.16), transparent 62%)' },
        k:[{transform:'translate(0,0) scale(1.05)'},{transform:'translate(-14vw,-9vh) scale(1.3)'}], d:24000 },
      { s:{ width:'130vw', height:'130vw', left:'-28vw', bottom:'-30vh', background:'radial-gradient(circle at 50% 50%, rgba(210,52,72,.20), transparent 64%)' },
        k:[{transform:'translate(0,0) scale(1.1)'}, {transform:'translate(12vw,-11vh) scale(.9)'}],  d:28000 },
    ];
    const blobs = defs.map((def) => {
      const b = document.createElement('div');
      Object.assign(b.style, { position:'absolute', mixBlendMode:'screen', willChange:'transform' }, def.s);
      mbg.appendChild(b);
      try { b.animate(def.k, { duration: def.d, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }); } catch (e) {}
      return b;
    });

    // ── interactive finger field: soft glow + a SET of red rings that emanate with stagger (each its own timing) ──
    const field = document.createElement('div');               // positions to finger; each child animates on its own
    Object.assign(field.style, { position:'absolute', top:'0', left:'0', width:'0', height:'0', willChange:'transform' });
    const glow = document.createElement('div');
    Object.assign(glow.style, { position:'absolute', top:'0', left:'0', width:'66vw', height:'66vw', margin:'-33vw 0 0 -33vw',
      mixBlendMode:'screen', background:'radial-gradient(circle at 50% 50%, rgba(255,82,102,.42), transparent 60%)',
      opacity:'0', transform:'scale(.4)', willChange:'transform,opacity' });
    field.appendChild(glow);
    const ringEls = [];
    for (let i = 0; i < 6; i++) {
      const rad = 26 + i * 18 + i * i * 7;                      // growing radii + widening gaps → organic ripple set
      const ring = document.createElement('div');
      Object.assign(ring.style, { position:'absolute', top:'0', left:'0', width:(rad*2)+'px', height:(rad*2)+'px',
        margin:(-rad)+'px 0 0 '+(-rad)+'px', borderRadius:'50%', border:'1.5px solid rgba(255,74,94,'+(0.52 - i*0.06).toFixed(2)+')',
        mixBlendMode:'screen', opacity:'0', transform:'scale(.3)', willChange:'transform,opacity' });
      field.appendChild(ring); ringEls.push(ring);
    }
    mbg.appendChild(field);

    let held = false;
    const place = (x, y) => { field.style.transform = `translate(${x}px, ${y}px)`; };
    const showField = () => {
      glow.style.transition = 'transform .5s cubic-bezier(.34,1.5,.5,1), opacity .25s ease-out';
      glow.style.transform = 'scale(1)'; glow.style.opacity = '1';
      ringEls.forEach((ring, i) => {                            // staggered springy bloom, inner → outer, each slightly different
        ring.style.transition = `transform ${(.5 + i*0.04).toFixed(2)}s cubic-bezier(.34,1.56,.5,1) ${i*45}ms, opacity .3s ease-out ${i*45}ms`;
        ring.style.transform = 'scale(1)'; ring.style.opacity = '1';
      });
    };
    const hideField = () => {
      glow.style.transition = 'transform .45s cubic-bezier(.32,0,.3,1), opacity .4s ease-in';
      glow.style.transform = 'scale(.5)'; glow.style.opacity = '0';
      ringEls.forEach((ring, i) => {
        ring.style.transition = `transform .4s cubic-bezier(.4,0,.3,1) ${i*28}ms, opacity .4s ease-in ${i*28}ms`;
        ring.style.transform = 'scale(.55)'; ring.style.opacity = '0';
      });
    };

    addEventListener('pointerdown', (e) => { held = true; place(e.clientX, e.clientY); showField(); }, { passive: true });
    addEventListener('pointermove', (e) => { if (held) place(e.clientX, e.clientY); }, { passive: true });
    const release = () => { if (!held) return; held = false; hideField(); };
    addEventListener('pointerup', release, { passive: true });
    addEventListener('pointercancel', () => { held = false; hideField(); }, { passive: true });

    let ticking = false;                                         // gentle parallax — blobs slide over the dark bg, no edge gaps
    addEventListener('scroll', () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => { const y = window.pageYOffset || 0;
        blobs.forEach((b, i) => { b.style.translate = '0 ' + (-y * (0.03 + i * 0.025)).toFixed(1) + 'px'; });
        ticking = false;
      });
    }, { passive: true });
  }

  /* ════════ INTRO ══════════════════════════════════════════ */
  (() => {
    const intro = $('#intro'), fill = $('#introFill'), introName = $('#introName');
    new Scramble(introName).to('BrAtUkA');
    let p = 0;
    const grow = () => { p = Math.min(100, p + 2 + Math.random() * 5); fill.style.width = p + '%'; if (p < 100) setTimeout(grow, 40); };
    setTimeout(grow, 200);
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      intro.classList.add('is-done');
      const stage = $('#stage'); stage.style.opacity = ''; stage.classList.add('is-live');
      setTimeout(() => { reHero(); kick(heroTitle); }, 200);
      removeEventListener('keydown', finish);
    };
    addEventListener('keydown', finish);
    intro.addEventListener('click', finish);
    setTimeout(finish, 2200);
  })();

})();
