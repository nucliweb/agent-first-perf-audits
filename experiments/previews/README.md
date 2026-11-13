# Experiment: the branches in the browser

English · [Castellano](README.es.md) · [Català](README.ca.md)

Reproduces the figures of "The branches in the browser" page: the `main` shop in production and the previews of the four regression branches on Vercel, measured the way a person would see them in their browser.

## What it does

1. Opens the home of each site in [`sites.mjs`](sites.mjs) in a new Chromium context, with a mobile viewport, and measures the LCP, the CLS and the attributes of the hero image.
2. Opens the `kenya-aa` product page, clicks "Add to cart" and measures that interaction with Event Timing: its duration and its three phases, computed over all its events (`pointerdown`, `pointerup` and `click`) the way web-vitals computes them for INP.
3. Repeats it five times per site under two conditions: 4x CPU without network throttling, and 4x CPU with `fast-4g`, the WebPerf Snippets 1.15.0 preset that the workshop gate uses.
4. Saves each run and the medians in [`results.json`](results.json), with the date.
5. `evidence.mjs` generates the images of the page and the slides in `docs/public/evidence/`, in the three languages: the filmstrip of the load of `main` and `pr/lcp-hero-lazy` (out of five loads, the one with the median LCP), the home of `pr/cls-promo-banner` right after its shift, next to the one of `main`, and the phases of the click of `pr/loaf-cart-handler` against `main`, with the medians of `results.json`. It saves in [`evidence.json`](evidence.json) the figures that the image captions quote.

The tests do not measure: they check the conclusions of the page against `results.json` and `evidence.json`, that the figures of the page and the slides in the three languages are the ones in those files, and that the images exist and are shown.

## Requirements

- Node 22 or later and an internet connection.
- The Chromium of Playwright 1.63.0: `npx playwright install chromium`.

## Usage

```bash
npm install
npm run measure     # measures the five sites and rewrites results.json, about 7 minutes
npm run evidence    # generates the images and evidence.json, about 2 minutes
npm test            # checks the conclusions and the figures of the page
```

Each measurement goes over the network to Vercel, so the figures change from one run to another and from one connection to another. The conclusions are what holds: with `fast-4g`, each branch regresses its metric against `main`; without network throttling, the LCP regression is not visible, and the CLS and INP ones are. If the figures of the page no longer match after measuring again, `npm test` says so: update the page in the three languages.
