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

## The figures

Medians of five runs per site, each in a fresh Chromium context with a mobile viewport: the LCP and the CLS of the home page, and the duration of the click on "Add to cart" on the `kenya-aa` product page. Measured on 12 November 2026 from a laptop against Vercel; each run goes over the network, so your figures will be similar, not the same.

With 4x CPU and `fast-4g`, the conditions of the gate:

| Branch | LCP | CLS | Click |
|---|---|---|---|
| `main` | 1000 ms | 0 | 64 ms |
| `pr/lcp-hero-lazy` | 1488 ms | 0 | 56 ms |
| `pr/cls-promo-banner` | 1100 ms | 0.0524 | 64 ms |
| `pr/loaf-cart-handler` | 1296 ms | 0 | 216 ms |
| `pr/noop-refactor` | 1024 ms | 0 | 64 ms |

With 4x CPU, without network throttling:

| Branch | LCP | CLS | Click |
|---|---|---|---|
| `main` | 940 ms | 0 | 64 ms |
| `pr/lcp-hero-lazy` | 940 ms | 0 | 64 ms |
| `pr/cls-promo-banner` | 964 ms | 0.0524 | 56 ms |
| `pr/loaf-cart-handler` | 1236 ms | 0 | 216 ms |
| `pr/noop-refactor` | 852 ms | 0 | 64 ms |

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
