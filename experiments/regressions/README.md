# Experiment: regression branches

English · [Castellano](README.es.md) · [Català](README.ca.md)

Reproduces the figures of the four regression branches of the workshop: the WebPerf Snippets gate on each `pr/*` branch, with `main` as the baseline.

## What it does

1. Extracts `apps/` from `main` and from each branch with `git archive`, without touching your working tree, and builds the shop of each one.
2. Serves the five versions at once, each on its own port, with the third-party mocks of `main`.
3. Measures two scenarios, one after the other so that two Chromium instances do not share the CPU:
   - `home`: the load of `/`, with LCP and CLS.
   - `add-to-cart`: the load of `/product/kenya-aa` and a click on "Add to cart" ([`agents/journeys/add-to-cart.json`](../../agents/journeys/add-to-cart.json)), with `--workflow interaction` to get the INP.
4. It runs the gate on each branch and scenario with a single CLI call: `--baseline` with the URL of the shop of `main`, `--cpu 4 --network fast-4g --runs 5 --max-runs 7` and `--fail-on-regression`. The CLI measures both shops in that call, alternating one run of each, 5 a side, and up to 7 if a metric is left inconclusive. `main` is measured again with each branch.
5. Writes `out/results.json` and prints a table.

## Requirements

- Node 22.18 or later.
- The shop dependencies installed: `npm ci` in `apps/shop`. The script reuses them for each branch and stops if a branch has a different `package-lock.json`.
- The `pr/*` branches, local or in `origin`.
- The Chromium of Playwright 1.63.0: `npx playwright install chromium`.

## Usage

```bash
npm install
npm run measure     # measures main and the four branches, about 7 minutes (one run took 7 min 16 s)
npm test            # measures again and checks the verdicts
```

## What the test checks

| Branch | Expected verdict |
|---|---|
| `pr/lcp-hero-lazy` | The gate fails on `home` with the LCP `regressed` |
| `pr/cls-promo-banner` | The gate fails on `home` with the CLS `regressed` |
| `pr/loaf-cart-handler` | The gate fails on `add-to-cart` with the INP `regressed` |
| `pr/noop-refactor` | The gate passes in both scenarios and no metric regresses |

The test checks the verdict, not the figures: the milliseconds change from one machine to another.

## Results on the reference Mac

One run of `npm test` on a 16 GB Apple Silicon, with the full Chromium of Playwright (`"build": "chromium"` in the conditions):

| Branch | Scenario | Metric | `main` | Branch | Change | p | Exit |
|---|---|---|---|---|---|---|---|
| `pr/lcp-hero-lazy` | home | LCP | 648 ms | 1064 ms | +64.2 % | 0.004 | 1 |
| `pr/cls-promo-banner` | home | CLS | 0 | 0.070 | | 0.002 | 1 |
| `pr/cls-promo-banner` | add-to-cart | CLS | 0 | 0.055 | | 0.002 | 1 |
| `pr/loaf-cart-handler` | add-to-cart | INP | 40 ms | 120 ms | +200 % | 0.0028 | 1 |
| `pr/loaf-cart-handler` | home | LCP | 648 ms | 960 ms | +48.1 % | 0.006 | 1 |
| `pr/noop-refactor` | home | LCP | 648 ms | 644 ms | -0.6 % | 0.3691 | 0 |
| `pr/noop-refactor` | add-to-cart | INP | 40 ms | 40 ms | 0 % | 0.5596 | 0 |

On `pr/cls-promo-banner`, the LCP of the home grows 1.9 % with p = 0.0063: the difference is significant, but it does not exceed the threshold, so the verdict is `unchanged`. The gate combines both conditions so that a noise difference is counted neither as good nor as bad. In the eight measurements of this run the CLI measured 5 runs a side, and none reached 7.

Two branches regress more than one metric, as happens in a real PR:

- **The synchronous A/B testing script of `pr/loaf-cart-handler`** is in the shared `index.html`, so it also delays the LCP of the home.
- **The gap of the banner without reserved height of `pr/cls-promo-banner`** is on every page, so it also shifts the product page.

The Judge has to attribute each metric to its cause, not only give the verdict.

## Versions

`webperf-snippets` 1.17.0 and `playwright` 1.63.0, pinned in [`package.json`](package.json). The CLI uses the full Chromium when it is installed, the same binary as Chrome DevTools MCP; with only the headless shell (`npx playwright install --only-shell chromium`), the figures can be somewhat different.
