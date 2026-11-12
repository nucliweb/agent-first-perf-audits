---
title: The branches in the browser
description: The shop of main and the four regression branches deployed on Vercel, to see each regression without Docker.
sidebar:
  order: 70
---

The Perf Coffee shop is deployed on Vercel: `main` in production and each `pr/*` branch as a preview. They let you see each regression in the browser, without Docker, for example if your environment does not start or to show them on a screen. The workshop gate still measures locally, with both shops on the same machine.

## The URLs

| Branch | Preview | What changes |
|---|---|---|
| `main` | [perf-coffee.vercel.app](https://perf-coffee.vercel.app/) | The baseline |
| `pr/lcp-hero-lazy` | [preview](https://perf-coffee-git-pr-lcp-hero-lazy-nucliweb-projects.vercel.app/) | The hero image loses its preload and its `fetchpriority`, and becomes `loading="lazy"` |
| `pr/cls-promo-banner` | [preview](https://perf-coffee-git-pr-cls-promo-banner-nucliweb-projects.vercel.app/) | A third-party banner without reserved space and a font swap without preload |
| `pr/loaf-cart-handler` | [preview](https://perf-coffee-git-pr-loaf-cart-handler-nucliweb-projects.vercel.app/) | A synchronous A/B testing script and recommendations computed in the add to cart handler |
| `pr/noop-refactor` | [preview](https://perf-coffee-git-pr-noop-refactor-nucliweb-projects.vercel.app/) | Extracts the hero into a component: nothing changes |

On Vercel, the third-party scripts are served by the shop itself, under `/thirdparty/`, with the same latency and CPU cost as the mocks of the lab.

## How to see each regression

Open both versions in Chrome with the Performance panel of DevTools, in a mobile viewport, with **4x CPU** and the network at **Fast 4G**, the conditions of the gate:

- **LCP on `pr/lcp-hero-lazy`:** record the load of the home page. The hero image is requested late, and the resource load delay is the phase that grows.
- **CLS on `pr/cls-promo-banner`:** record the load of the home page. The promo banner pushes the page down.
- **INP on `pr/loaf-cart-handler`:** on a product page, record the click on "Add to cart". The handler takes much longer, and the LCP of the home page gets worse too because of the synchronous script.

Without network throttling, the LCP regression does not show: on a fast connection, the `lazy` image arrives in time anyway. The CLS and INP regressions show without network throttling too.

## What you see

### LCP: the hero arrives late

<img src="/evidence/lcp-filmstrip-en.jpg" alt="The load of the home page of main and of pr/lcp-hero-lazy, frame by frame: on the branch, the page has its text before the hero image" width="2800" height="1608" loading="lazy" decoding="async">

The load of the home page in the median run of five: the LCP of `main` lands at 0.98 s and the one of `pr/lcp-hero-lazy` at 1.46 s. On the branch, the page already has its text and buttons, but the slot of the hero stays empty for several frames: with `loading="lazy"` and no preload, the browser does not request the image until it knows it is on screen.

### CLS: the banner pushes the page

<img src="/evidence/cls-shift-en.jpg" alt="The home page of main, with the space of the banner reserved, next to the one of pr/cls-promo-banner, where the content moves down when the banner arrives" width="2264" height="1870" loading="lazy" decoding="async">

On `main`, the promo banner has its space reserved. On `pr/cls-promo-banner` it arrives once the page is painted, takes the place of the hero and all the content moves down 48 px at once. The dashed line marks where the hero started and the solid one where it ends.

### INP: the cart handler

<img src="/evidence/inp-phases-en.png" alt="The three phases of the Add to cart click on main and on pr/loaf-cart-handler: processing is the one that grows" width="2800" height="480" loading="lazy" decoding="async">

The "Add to cart" click, with the median of each phase: processing goes from 9 ms to 168 ms, and the input delay and the presentation delay barely change. The extra time is in the handler, which computes the recommendations before painting.

## The figures

Medians of five runs per site, each in a fresh Chromium context with a mobile viewport: the LCP and the CLS of the home page, and the duration of the click on "Add to cart" on the `kenya-aa` product page. Measured on 12 November 2026 from a laptop against Vercel; each run goes over the network, so your figures will be similar, not the same.

With 4x CPU and `fast-4g`, the conditions of the gate:

| Branch | LCP | CLS | Click |
|---|---|---|---|
| `main` | 1028 ms | 0 | 56 ms |
| `pr/lcp-hero-lazy` | 1488 ms | 0 | 64 ms |
| `pr/cls-promo-banner` | 1016 ms | 0.0524 | 64 ms |
| `pr/loaf-cart-handler` | 1340 ms | 0 | 224 ms |
| `pr/noop-refactor` | 1072 ms | 0 | 64 ms |

With 4x CPU, without network throttling:

| Branch | LCP | CLS | Click |
|---|---|---|---|
| `main` | 988 ms | 0 | 80 ms |
| `pr/lcp-hero-lazy` | 908 ms | 0 | 64 ms |
| `pr/cls-promo-banner` | 884 ms | 0.0524 | 64 ms |
| `pr/loaf-cart-handler` | 1232 ms | 0 | 224 ms |
| `pr/noop-refactor` | 864 ms | 0 | 64 ms |

The LCP and CLS regressions stay within "good" in absolute terms: they show when compared with `main`, as the gate does.

## Check it

The [`experiments/previews`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/previews) experiment measures the five sites in both conditions and checks these conclusions:

```bash
cd experiments/previews
npm install
npx playwright install chromium
npm run measure     # measures again and rewrites results.json
npm test            # checks the conclusions and the figures of this page
```

## What they are not

The previews do not replace the gate. Each measurement goes over the network to Vercel and depends on your connection, and the baseline and the branch are not measured on the same machine or in the same run. The workshop gate compares both shops locally, under the same conditions, and decides with statistics.
