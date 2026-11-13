# Experiment: discarded alternatives

English · [Castellano](README.es.md) · [Català](README.ca.md)

Reproduces the data of three rows of the map page ("Why this stack"). In each one, it measures the discarded alternative next to what the workshop uses, with the same tools as the gate and the Judge.

| Workshop decision | Discarded alternative | What is measured |
|---|---|---|
| The gate measures with fast-4g network | Measuring without network throttling | The gate on `pr/lcp-hero-lazy` with `--cpu 4 --runs 5`, without `--network fast-4g` |
| The shop server preloads the LCP image | A baseline without preload | The gate on `pr/lcp-hero-lazy` against a `main` without the preload of the hero |
| The build keeps function names (`keepNames`) | The default minification | The INP suspects of `pr/loaf-cart-handler` and the line of the diff the Judge relates them to, with a build of `main` and of the branch without `keepNames` |

## What it does

1. Builds six versions of the shop with the `build` of [`experiments/regressions`](../regressions): `main`, `pr/lcp-hero-lazy` and `pr/loaf-cart-handler` as they are; `main` without the `<!-- lcp-preload -->` marker of `index.html`, where `server.mjs` puts the preload of the LCP image of each route; and `main` and `pr/loaf-cart-handler` with `keepNames: false` in `vite.config.ts`.
2. Serves them at once, each on its own port, with the third-party mocks of `main`.
3. Runs the home gate on `pr/lcp-hero-lazy` three times: with the gate conditions, without network throttling and against the `main` without preload. It is the same CLI call as [`agents/src/judge/gate.ts`](../../agents/src/judge/gate.ts), with the conditions of each case.
4. Records the trace of the click on "Add to cart" on each side with [`record`](../../agents/src/judge/traces.ts), summarizes it with trace-engine-cli and applies the Judge rules: [`suspectsFor`](../../agents/src/judge/suspects.ts) and [`matchSuspects`](../../agents/src/judge/match.ts) with the diff of `pr/loaf-cart-handler`.
5. Writes `out/results.json` and prints a summary.

The measurements run one after the other, so that two Chromium instances do not share the CPU.

## Requirements

The same as `experiments/regressions`: Node 22.18 or later, `npm ci` in `apps/shop`, the `pr/*` branches local or in `origin` and the Chromium of Playwright 1.63.0 (`npx playwright install chromium`).

## Usage

```bash
npm install
npm run measure     # builds and measures the six versions, about 3 minutes
npm test            # measures again and checks each claim
```

## What the test checks

| Claim | How |
|---|---|
| With the gate conditions, the LCP of `pr/lcp-hero-lazy` regresses | The LCP comes out `regressed` and the CLI exits with 1 |
| Without network throttling, the gate does not see the regression | The LCP does not come out `regressed` and the CLI exits with 0 |
| Without the preload of the hero in `main`, the gate does not see the regression | The LCP does not come out `regressed` and the CLI exits with 0 |
| With `keepNames`, the Judge relates the INP to the diff | The suspect is `recommendFor` and the rule relates it to the line that calls it |
| Without `keepNames`, the Judge cannot | There is still a suspect, but it is not named `recommendFor` and no related line names it |

The test checks the verdicts, not the figures: the milliseconds change from one machine to another.

## Results on the reference Mac

Two consecutive runs on a 16 GB Apple Silicon, with the full Chromium of Playwright. The LCP of `pr/lcp-hero-lazy` on the home:

| Case | Baseline | Branch | Change | p | Threshold | Verdict |
|---|---|---|---|---|---|---|
| Gate conditions | 652 and 648 ms | 1060 ms | +62.6 and +63.6 % | 0.0056 and 0.0058 | 100 ms | `regressed` |
| Without network throttling | 484 ms | 500 and 504 ms | +3.3 and +4.1 % | 0.0058 and 0.0688 | 100 ms | `unchanged` |
| Without preload in `main` | 1028 and 1032 ms | 1068 ms | +3.9 and +3.5 % | 0.006 and 0.0055 | 102.8 and 103.2 ms | `unchanged` |

The LCP threshold in the CLI is the larger of 100 ms and 10 % of the baseline.

- **Without network throttling**, the hero image arrives almost instantly even when it is requested late: the LCP grows between 16 and 20 ms, far below the threshold. Sometimes the difference is significant (p below 0.05), but the gate only fails if it also exceeds the threshold.
- **Without preload**, the image is already discovered late in `main`, when the JavaScript renders the page, and its LCP goes from about 650 ms to about 1030. Removing `fetchpriority` and adding `loading="lazy"` only adds between 36 and 40 ms more.

The INP of `pr/loaf-cart-handler`, with the Judge rules:

| Build | Suspect | Self time | Related line of the diff |
|---|---|---|---|
| With `keepNames` | `recommendFor` | 78 and 78 ms | `setRecommended(recommendFor(product.slug));` in `apps/shop/src/pages.tsx` |
| Without `keepNames` | `Ae` | 80 and 80 ms | None |

Without `keepNames`, the Judge still sees that a new function takes about 80 ms on the click, but the profiler calls it `Ae`, a name that is not in the diff. trace-engine-cli does not read source maps, so the Judge has no way to know that it is `recommendFor`.

## Versions

`webperf-snippets` 1.15.0, `trace-engine-cli` 0.2.0 and `playwright` 1.63.0, pinned in [`package.json`](package.json), the same as in `experiments/regressions` and `experiments/models`.
