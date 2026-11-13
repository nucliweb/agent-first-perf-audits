---
title: "Step 5: the gate in ci against the four branches"
description: The performance gate of a pull request, against the three regressions and the refactor that changes nothing.
sidebar:
  order: 15
---

## Goal

Use what we built the way a team would: a gate in the CI of every pull request. The `ci` service compares the shop of a branch with the one of `main` and exits with 0 if it passes, 1 if any metric regresses and 2 if it could not measure. Against the four branches of the workshop it has to give three failures and one pass.

## Before you start

You are still on your `taller` branch, with the lab running. This step has no code: `ci` works even if you did not apply any solution.

The branches you will compare with `main`:

| Branch | Change | What regresses |
|---|---|---|
| `pr/lcp-hero-lazy` | The hero image loses its preload and `fetchpriority`, and switches to `loading="lazy"` | LCP |
| `pr/cls-promo-banner` | A third-party banner without reserved space and a font swap without preload | CLS |
| `pr/loaf-cart-handler` | A synchronous A/B testing script and recommendations computed in the add to cart handler | INP and LCP |
| `pr/noop-refactor` | Extracts the hero into a component | Nothing: the false positive control |

The app tests pass on all four: classic CI sees no regression. The three stay within "good" in absolute value; the gate detects them because it compares with `main`, not with Google's thresholds.

The four branches are also deployed on Vercel, to see them in the browser without Docker: [The branches in the browser](../../previews/).

## Step by step

1. Run the gate on the four branches, each one in its folder of `out/ci/` so the reports do not overwrite each other:

   ```bash
   for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler pr-noop-refactor; do
     CANDIDATE=$branch docker compose run --rm -e OUT=/out/ci/$branch ci
     echo "$branch: exit $?"
   done
   ```

   `docker compose run` starts the shop of each branch before measuring it. Each branch takes a few minutes, because the gate measures each scenario five times on each side. When each one finishes, it prints its exit code:

   ```text
   pr-lcp-hero-lazy: exit 1
   pr-cls-promo-banner: exit 1
   pr-loaf-cart-handler: exit 1
   pr-noop-refactor: exit 0
   ```

2. While the next one runs, read the `report.md` of the previous one, in `out/ci/<branch>/`. Look at four things:

   - `pr/loaf-cart-handler` regresses two metrics for two different causes, and the Judge asks for one explanation for each.
   - `pr/noop-refactor` passes and the LLM is never consulted: without a regression, the rules answer on their own, and there is no chance to make one up.
   - On `pr/lcp-hero-lazy`, the LLM explanation names `loading="lazy"`, and the facts of the rules, at the end of the report, add what it does not say: the `fetchPriority` and the preload the hero loses.
   - With the `lite` profile, each folder has a `handoff.md` instead of the explanation. Sending it to an external service is a decision of each team for its own code.

3. Run the check of the step:

   ```bash
   docker compose run --rm agents npm run check -- step-05
   ```

   It gives one `OK` per branch when its report has the expected verdict, and ends with `step-05 is done.`
