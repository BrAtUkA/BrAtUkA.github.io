// bratuka.dev: everything is a static asset; this Worker only
//   1. answers 410 Gone for pages that were removed for good (Google drops them faster than 404s),
//   2. sends the tools that moved to bratuka.github.io there with a permanent redirect, keeping the rest of the path,
//   3. adds security and cache headers to what the assets return.

const GONE = [
  /^\/pdf-dark-mode-converter\/(de|es|fr|it|ja|ko|pt|ru|zh)(\/|$)/i,   // machine-translated copies, removed
  /^\/jobbly(\/|$)/i,                                                  // project no longer published
  /^\/temp(\/|$)/i,                                                    // old build leftovers
  /^\/privacy\/?$/i,                                                   // the old portfolio's privacy page (no analytics now)
];

const MOVED = [
  [/^\/pdf-dark-mode-converter(\/.*)?$/i, 'https://bratuka.github.io/pdf-dark-mode-converter'],
  [/^\/colorview(\/.*)?$/i, 'https://bratuka.github.io/ColorView'],
  [/^\/claude-widgets-viewer(\/.*)?$/i, 'https://bratuka.github.io/claude-widgets-viewer'],
];

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'X-Frame-Options': 'SAMEORIGIN',
};

function gone() {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Gone · BrAtUkA</title>
<style>html,body{margin:0;height:100%;background:#060405;color:#ece6e3;font:16px/1.5 system-ui,sans-serif}
main{min-height:100%;display:grid;place-content:center;gap:12px;padding:24px;text-align:center}h1{margin:0;font-weight:500;font-size:2rem}
p{margin:0;color:#8b8185}a{color:#ff3a4e}</style></head>
<body><main><h1>This page has been removed</h1><p>It isn't coming back. <a href="/">Go to bratuka.dev</a></p></main></body></html>`;
  return new Response(body, { status: 410, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600', ...SECURITY } });
}

// Static assets ignore Range. Video is small here (under 4 MB), so slice the body in the Worker.
async function ranged(request, res) {
  const h = new Headers(res.headers); h.set('accept-ranges', 'bytes');
  const range = request.headers.get('range');
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || request.method !== 'GET') return new Response(res.body, { status: 200, headers: h });
  const buf = await res.arrayBuffer(), size = buf.byteLength;
  let start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
  let end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (m[1] === '' && m[2] === '') return new Response(buf, { status: 200, headers: h });
  start = Math.max(0, start);
  if (start >= size || start > end) { h.set('content-range', `bytes */${size}`); h.delete('content-length'); return new Response(null, { status: 416, headers: h }); }
  h.set('content-range', `bytes ${start}-${end}/${size}`); h.set('content-length', String(end - start + 1));
  return new Response(buf.slice(start, end + 1), { status: 206, headers: h });
}

// /a/m/* comes from R2. URLs carry ?v=<content hash>, so a year of caching is safe. Range requests are answered
// with 206 (Safari plays video only that way); conditional requests with 304.
async function media(request, env, key) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  const obj = await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
  if (obj === null) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', ...SECURITY } });
  const h = new Headers(SECURITY);
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag); h.set('accept-ranges', 'bytes');
  h.set('cache-control', 'public, max-age=31536000, immutable');
  if (!('body' in obj) || obj.body === undefined) return new Response(null, { status: 304, headers: h });
  if (request.headers.has('range') && obj.range) {
    const off = obj.range.offset ?? (obj.size - obj.range.suffix), len = obj.range.length ?? (obj.size - off);
    h.set('content-range', `bytes ${off}-${off + len - 1}/${obj.size}`); h.set('content-length', String(len));
    return new Response(request.method === 'HEAD' ? null : obj.body, { status: 206, headers: h });
  }
  h.set('content-length', String(obj.size));
  return new Response(request.method === 'HEAD' ? null : obj.body, { status: 200, headers: h });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    for (const re of GONE) if (re.test(path)) return gone();
    for (const [re, to] of MOVED) {
      const m = path.match(re);
      if (m) return Response.redirect(to + (m[1] || '/') + url.search, 301);
    }

    if (path.startsWith('/a/m/')) return media(request, env, decodeURIComponent(path.slice(5)));
    const review = url.hostname.endsWith('.workers.dev') || url.hostname === 'preview.bratuka.dev';
    // the design labs are for review only: on the real site they don't exist (the 404 page, as for any missing path)
    if (!review && (path === '/lab' || path.startsWith('/lab/'))) {
      const nf = await env.ASSETS.fetch(new Request(new URL('/404.html', url), request));
      const out = new Response(nf.body, { status: 404, headers: nf.headers });
      for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
      out.headers.set('x-robots-tag', 'noindex'); out.headers.set('cache-control', 'public, max-age=0, must-revalidate');
      return out;
    }
    let res = await env.ASSETS.fetch(request);
    if (res.status === 200 && /\.(mp4|webm)$/.test(path)) res = await ranged(request, res);   // Safari plays video only with 206 replies
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
    if (review) out.headers.set('x-robots-tag', 'noindex, nofollow');   // review previews stay out of search
    const type = out.headers.get('content-type') || '';
    if (path.startsWith('/a/')) out.headers.set('cache-control', 'public, max-age=604800, stale-while-revalidate=86400');   // renders: a week
    else if (type.includes('text/html')) out.headers.set('cache-control', 'public, max-age=0, must-revalidate');
    // previews stay out of the visitor stats: the analytics token belongs to bratuka.dev (elsewhere it is refused, with console errors)
    if (review && type.includes('text/html'))
      return new HTMLRewriter().on('script[src*="cloudflareinsights.com"]', { element(e) { e.remove(); } }).transform(out);
    return out;
  },
};
