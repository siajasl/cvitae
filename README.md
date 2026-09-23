# cvitae

Single-page CV website for Mark A. Conway-Greenslade — https://markconwaygreenslade.com/

Everything ships from one hand-crafted `index.html`: light/dark theming, four languages (English, French, German, Chinese), JSON-LD structured data for search engines and AI agents, and a canvas background animation. No build step, no framework.

## Structure

- `index.html` — the whole site: styles, markup, i18n strings (the `#i18n` JSON block) and JavaScript
- `assets/` — headshot (AVIF/WebP/JPEG), favicons, per-language CV PDFs and `cv.json` (machine-readable CV)
- `fonts/` — Lato in woff2 with woff fallback
- `scripts/generate-cv-pdfs.mjs` — renders the four CV PDFs from the `#i18n` block via headless Chrome, and bumps the JSON-LD `dateModified` and sitemap `lastmod`
- `scripts/generate-identicon.mjs` — regenerates the favicon mosaic from the headshot
- `inputs/` — source material for site generation
- `llms.txt`, `robots.txt`, `sitemap.xml` — crawler and AI-agent affordances

## Editing content

All copy lives in the `#i18n` JSON block in `index.html`, one subtree per language, with the JSON-LD block carrying the structured-data mirror. Keep `assets/cv.json` in sync. After any content change, regenerate the PDFs:

```bash
node scripts/generate-cv-pdfs.mjs
```

Requires Node.js and Google Chrome (used headlessly for rendering).

## Local preview

```bash
python3 -m http.server 8123
```

Then open http://localhost:8123.
