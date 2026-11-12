# bratuka.dev

The portfolio at [bratuka.dev](https://bratuka.dev), served by Cloudflare Workers (static assets with a small Worker in front).

- `public/`: the site exactly as it is served. `public/index.html` and the renders in `public/a/` are built from the design prototype with `prototype/scripts/build_site.py` in the `fix-bratuka` repo.
- `src/worker.js`: runs before every request.
  - **410 Gone:** the removed machine-translated tool pages, Jobbly, `/temp/` and the old privacy page.
  - **Permanent redirects** (rest of the path kept) for the tools that now live on GitHub Pages:
    - `/pdf-dark-mode-converter/` → https://bratuka.github.io/pdf-dark-mode-converter/
    - `/ColorView/` → https://bratuka.github.io/ColorView/
    - `/claude-widgets-viewer/` → https://bratuka.github.io/claude-widgets-viewer/
  - **Headers:** security headers on everything; renders cached for a week; the page always revalidates.
- `wrangler.jsonc`: Worker `bratuka-site`, assets from `public/`, unknown paths get `public/404.html`.

## Deploying

Cloudflare Workers Builds is connected to this repository. Every push to the production branch runs `npx wrangler deploy`; pushes to other branches get preview URLs.

Run locally:

```bash
npx wrangler dev
```

## Adding pages later

Each page is a folder with an `index.html` under `public/` (for example `public/work/rdr2/index.html` serves `/work/rdr2/`). Add it to `public/sitemap.xml` so search engines find it.
