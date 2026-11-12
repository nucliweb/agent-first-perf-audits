---
title: "Step 5: the gate in ci against the four branches"
description: The performance gate of a pull request, against the three regressions and the refactor that changes nothing.
sidebar:
  order: 15
---

## Goal

Use what you built the way a team would: a gate in the CI of each pull request. The `ci` service compares the shop of a branch with the one of `main` and exits with 0 if it passes, 1 if any metric regresses and 2 if it could not measure. Against the four branches of the workshop it has to give three failures and one pass.

## What you will write

Nothing. `ci` is the Judge of step 4 without the subagents: the CLI gate, the traces, the rules and the explanation. In this step you run it and read its reports.

## The branches

| Branch | Change | What regresses |
|---|---|---|
| `pr/lcp-hero-lazy` | The hero image loses its preload and its `fetchpriority`, and becomes `loading="lazy"` | LCP |
| `pr/cls-promo-banner` | A third-party banner without reserved space and a font swap without preload | CLS |
| `pr/loaf-cart-handler` | A synchronous A/B testing script and recommendations computed in the add to cart handler | INP and LCP |
| `pr/noop-refactor` | Extracts the hero into a component | Nothing: the false positive control |

The app tests pass on all four: classic CI sees no regression. The three stay within "good" in absolute value; the gate catches them because it compares with `main`, not with Google's thresholds.

The four branches are also deployed on Vercel, to see them in the browser without Docker: [The branches in the browser](../../previews/).

## Check it

Each branch in its own folder in `out/ci/`, so the reports do not overwrite each other:

```bash
for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler pr-noop-refactor; do
  CANDIDATE=$branch docker compose run --rm -e OUT=/out/ci/$branch ci
  echo "$branch: exit $?"
done
```

`docker compose run` starts the shop of each branch before measuring it. Each branch takes a few minutes, because the gate measures each scenario five times on each side; while the next one runs, read the `report.md` of the previous one. Look at three things:

- `pr/loaf-cart-handler` regresses two metrics for two different causes, and the Judge asks for one explanation for each.
- `pr/noop-refactor` passes and the LLM is never asked: with no regression, the rules answer on their own, and there is no chance to make one up.
- With the `lite` profile, each folder has a `handoff.md` instead of the explanation. Sending it to an external service is a decision each team makes for its own code.

```bash
docker compose run --rm agents npm run check -- step-05
```
