# Experiment: the workshop challenges

English · [Castellano](README.es.md) · [Català](README.ca.md)

Runs the workshop [challenges](../../docs/src/content/docs/en/challenges.md) exactly as their page writes them and records what the gate gives in each one.

## Why

The challenges page says what comes out after each change: "it still fails", "it passes", "it fails only because of the LCP". These are verdicts, and a verdict written by hand in a guide stops being true the day the shop, the gate or the CLI changes. This experiment ties them to a saved run.

## What it does

1. Clones the repo clean and runs, in order, the `bash` blocks of the challenges page in Spanish, with the [harness of the rehearsal](../rehearsal/README.md).
2. Makes the changes the page asks to make by hand, each one right before the command that follows it. They are in `EDITS`, in [`run.mjs`](run.mjs), with their file, the text it looks for and the one it leaves. If the file does not have that text exactly once, the experiment stops: the shop has changed, and the page has to change with it.
3. After each gate it reads its `report.json` and saves in `results.json` the verdict, the conditions, each metric with its p and its verdict, and the facts of the rules. The text of the model explanation is not saved: no claim on the page depends on it.
4. At the end, the last commands of the page delete the folders, branches and images of the challenges, and the experiment stops the lab of the clone.

Challenge 2, asking another model for the explanation, has no commands or verdict to check.

## The changes

| Change | Challenge | File | What changes |
|---|---|---|---|
| `fix-attribute` | 1 | `apps/shop/src/pages.tsx`, on the fix branch | `loading="lazy"` becomes `fetchPriority="high"` on the hero image |
| `fix-preload` | 1 | `apps/shop/src/products.ts`, on the fix branch | `lcpImageFor` gets the hero preload line back |
| `unthrottled` | 3 | `agents/src/judge/gate.ts` | The conditions of the gate are reduced to `--runs 5` |
| `no-defer` | 4 | `apps/shop/index.html`, on the regression branch | The chat script loses its `defer` |
| `slow-defer` | 4 | `apps/shop/index.html`, on the regression branch | The `defer` comes back, and the `delay` of the chat goes up to 1500 |
| `slow-async` | 4 | `apps/shop/index.html`, on the regression branch | `async` instead of `defer` |

## Requirements

Those of the workshop, which `scripts/preflight.sh` checks, and Node 22.18 or later, git and bash. It has no npm dependencies.

It builds images of the shop, so it needs internet. And it measures: on the reference machine nothing else runs at the same time, and the lab of the working repo has to be stopped, because the one of the clone has the same name.

## Usage

```bash
node run.mjs --dry-run     # lists the commands of the page, with the change that goes before each one
node run.mjs               # from a clone of this repo at main
npm test                   # the tests of the experiment and the checks on results.json
```

`--source` takes a path or a git URL, `--ref` a branch, a tag or a commit, `--dir` chooses the folder of the clone and `--timeout` gives the minutes to wait per command.

## What the tests check

`npm test` runs the tests of the experiment (which change goes before which command, how it is applied and where the reports are read from) and `claims.test.mjs`, which checks on `results.json` that:

1. The commands that ran are the ones the page writes today. If the page changes its commands, the run has to be repeated.
2. All the commands finish well, and the output of each one has the lines the page shows, among them the exit code of each gate.
3. Challenge 1: with the attribute fixed, the LCP of the home page still gets worse and a fact of the rules names `lcpImageFor`. With the preload back, the gate passes and the answer comes from the rules.
4. Challenge 3: without throttling, `pr/lcp-hero-lazy` passes, `pr/cls-promo-banner` fails because of the CLS and `pr/loaf-cart-handler` fails because of the LCP, with a worse and significant INP. Whether that INP exceeds its threshold depends on the speed of the machine, and it is not checked.
5. Challenge 4: without `defer` the gate passes and the LCP does not change; with the slow chat and `defer`, it fails because of the LCP; with `async`, it passes and the LCP of the branch is lower than the one of `main`.
6. The page shows, in the three languages, the lines the experiment changes.

Without `results.json`, the checks on the run are skipped and say so.

## Results on the reference Mac

One run on a 16 GB Apple Silicon, with the `llm` profile and the workshop images already downloaded:

| Challenge | Change | Branch | Gate | Metrics that get worse |
|---|---|---|---|---|
| 1 | `fix-attribute` | `fix-lcp-hero` | exit 1 | home: LCP |
| 1 | `fix-preload` | `fix-lcp-hero` | exit 0 | None |
| 3 | `unthrottled` | `pr/lcp-hero-lazy` | exit 0 | None |
| 3 | `unthrottled` | `pr/cls-promo-banner` | exit 1 | home: CLS, add-to-cart: CLS |
| 3 | `unthrottled` | `pr/loaf-cart-handler` | exit 1 | home: LCP |
| 4 | `no-defer` | `my-regression` | exit 0 | None |
| 4 | `slow-defer` | `my-regression` | exit 1 | home: LCP |
| 4 | `slow-async` | `my-regression` | exit 0 | None |

Each row is a gate. The changes of a single challenge accumulate: `fix-preload` goes on top of `fix-attribute`, and `slow-async` on top of the other two.

The figures of each report are in [`results.json`](results.json). They change from one run to another and from one machine to another; what the checks tie to the page are the verdicts.
