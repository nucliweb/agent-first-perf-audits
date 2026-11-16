---
title: "Step 5: the gate in ci against the four branches"
description: The performance gate of a pull request, against the three regressions and the refactor that changes nothing.
sidebar:
  order: 15
---

## What you will learn

- How to use the gate the way a team would, in the CI of every pull request, and read its three exit codes.
- Why the gate compares with `main` and not with Google's thresholds.
- What to do when the gate cannot decide.

## Time

This step has 20 minutes in the agenda. The machine time is measured on the reference Mac, with the [timed rehearsal](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.md):

| | `llm` | `lite` |
|---|---|---|
| Machine time of the step | 11.2 min | 9.3 min |
| Point 1, the gate on the four branches | 11.2 min | 9.3 min |

## The idea in a minute

Everything so far fits in one service: `ci` compares the shop of a branch with the one of `main` and exits with 0 if it passes, 1 if any metric regresses and 2 if it could not measure. A pipeline does not need to know more: the exit code for the pull request, and the report says why.

The measurements are those of a lab, so the gate does not claim what it cannot support. When a change goes beyond its threshold and the measurements are not enough to tell it from noise, the metric is left as inconclusive: the gate does not fail on it, and the report asks to run it again.

The repo uses this same gate in GitHub Actions: each pull request of a `pr/*` branch goes through `ci` and gets the report in a comment, like the one of [`pr/lcp-hero-lazy`](https://github.com/nucliweb/agent-first-perf-audits/pull/1). Against the four branches of the workshop it has to give three failures and one pass.

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

   `docker compose run` starts the shop of each branch before measuring it. Each branch takes a few minutes, because the gate measures each scenario five times on each side, alternating the two shops. When each one finishes, it prints its exit code:

   ```text
   pr-lcp-hero-lazy: exit 1
   pr-cls-promo-banner: exit 1
   pr-loaf-cart-handler: exit 1
   pr-noop-refactor: exit 0
   ```

2. Run the check of the step:

   ```bash
   docker compose run --rm agents npm run check -- step-05
   ```

   It gives one `OK` per branch when its report has the expected verdict, and ends with `step-05 is done.`

   When a branch that should fail passes with a metric inconclusive for the worse, the check says to run that branch again.

## While you wait

Each branch takes a few minutes. While the next one runs, read the `report.md` of the previous one, in `out/ci/<branch>/`. Look at five things:

- `pr/loaf-cart-handler` regresses two metrics for two different causes, and the Judge asks for one explanation for each.
- `pr/noop-refactor` passes and the LLM is never consulted: without a regression, the rules answer on their own, and there is no chance to make one up.
- On `pr/lcp-hero-lazy`, the LLM explanation names `loading="lazy"`, and the facts of the rules, at the end of the report, add what it does not say: the `fetchPriority` and the preload the hero loses.
- If a metric goes beyond its threshold and p is not under 0.05, the report says so at the top, in an "Inconclusive: run the gate again." block with the metric, its change and its p, and how many runs a side the CLI measured. The gate does not fail on that metric.
- With the `lite` profile, each folder has a `handoff.md` instead of the explanation. Sending it to an external service is a decision of each team for its own code.

## Checkpoint

On screen, the four exit codes, `1`, `1`, `1` and `0`, and `step-05 is done.`

## If something fails

| What you see | Why | What to do |
|---|---|---|
| A branch with a regression exits with 0 | Its metric was left as inconclusive | Run that branch again. The check of point 2 prints the command |
| A branch exits with 2 | The gate could not measure: the image of the shop of that branch is missing, or a variable | The message says what is missing. The preflight of [Setup](../../setup/) downloads the shop of each branch |
| `pr-noop-refactor` exits with 1 | A false positive, almost always with the machine busy with something else | Close whatever uses CPU and run that branch again. Why it happens is in [Concepts](../../concepts/#why-the-order-matters) |
| The loop takes much longer than in the Time table | Another load on the machine, or a slower computer than the reference one | Let it finish: the measurements go one after another so they do not share the CPU |

## What you take away

- Classic CI saw none of the three regressions: the app tests pass on the four branches.
- The gate sees them because it compares with the base version on the same machine and in the same run, not with an absolute threshold.
- Three exits, 0, 1 and 2, and an inconclusive result that is said out loud instead of passing as good.

To think about: which pull request of the last few months would this gate have stopped in your product?
