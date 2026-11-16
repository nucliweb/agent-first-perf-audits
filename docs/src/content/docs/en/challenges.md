---
title: Challenges
description: Four challenges for after step 5. Fix a regression and watch the gate pass, ask another model for the explanation, remove the throttling and create a regression of your own.
sidebar:
  order: 17
---

The workshop teaches how to detect a regression and explain it. These challenges answer four questions the guides leave open, for anyone who finishes early in the guided workshop or wants to keep going on their own afterwards.

| Challenge | The question | What it needs |
|---|---|---|
| [1. Fix a regression](#challenge-1-fix-a-regression-and-watch-the-gate-pass) | How do I know the fix is complete? | Internet, to build a shop |
| [2. Ask another model for the explanation](#challenge-2-ask-another-model-for-the-explanation) | What changes with a larger model? | An agent or a chat with an LLM |
| [3. Remove the throttling](#challenge-3-remove-the-throttling-and-see-what-stops-showing) | Why does the gate not measure at full speed? | Nothing else |
| [4. Create your own regression](#challenge-4-create-your-own-regression) | What does the gate see, and what does it not? | Internet, to build a shop |

## Before you start

The challenges start from the end of [step 5](../workshop/step-05/): the lab running, your `taller` branch and the solution of step 4 applied. They have no check with `npm run check`. The result of each one is the exit code of the gate and its report.

To do them without having followed the steps, these commands leave the repo at that same point:

```bash
git fetch origin workshop --tags
git switch -c taller workshop-start
git checkout step-04-solution -- agents/src
docker compose up -d
```

Challenges 2 and 3 compare with the reports of step 5. If you do not have them, run point 1 of its guide first.

Challenges 1 and 4 change the shop. The gate compares two images of the shop, and each one is built from a git ref, so trying a change takes three things:

1. **A branch with the change in a commit.** It is created in another folder, with `git worktree`. Your working folder stays on `taller`, because the lab runs the code in `agents/src` that is in it: switching branches there would change the gate too.
2. **The image of that branch.** `scripts/build-shop.sh` builds it, with the name of the branch as the tag. It uses `docker build`, which downloads the Node base image and the dependencies of the shop: it needs internet.
3. **The gate**, with that tag in `CANDIDATE`.

## Challenge 1: fix a regression and watch the gate pass

Step 4 ends with a proposed fix for `pr/lcp-hero-lazy`, and nobody tests it. A fix is done when the gate passes.

1. Create a branch from the regression one, in a folder next to the repo:

   ```bash
   git worktree add -b fix-lcp-hero ../fix-lcp-hero origin/pr/lcp-hero-lazy
   ```

2. Fix what the LLM explanation names. In `../fix-lcp-hero/apps/shop/src/pages.tsx`, the hero image has `loading="lazy"`: change it to `fetchPriority="high"` and save the change in a commit:

   ```bash
   git -C ../fix-lcp-hero commit -am "Load the hero image with high priority"
   ```

3. Build the shop of your branch and run the gate on it:

   ```bash
   scripts/build-shop.sh fix-lcp-hero
   CANDIDATE=fix-lcp-hero docker compose run --rm -e OUT=/out/ci/fix-lcp-hero ci
   echo "exit $?"
   ```

   ```text
   exit 1
   ```

   It still fails. Open `out/ci/fix-lcp-hero/report.md`: the LCP is still above its threshold, and at the end, in the facts of the rules, is the cause that remains. The branch removes from `lcpImageFor`, in `apps/shop/src/products.ts`, the line that preloaded the hero image.

4. Put that line back. It is the first one in the `lcpImageFor` function:

   ```ts
   if (pathname === "/") return { href: "/images/hero-1200.webp", srcset: heroSrcSet(), sizes: HERO_SIZES };
   ```

   Another commit, the shop again and the gate again:

   ```bash
   git -C ../fix-lcp-hero commit -am "Preload the hero image on the home page"
   scripts/build-shop.sh fix-lcp-hero
   CANDIDATE=fix-lcp-hero docker compose run --rm -e OUT=/out/ci/fix-lcp-hero ci
   echo "exit $?"
   ```

   ```text
   exit 0
   ```

   The report says nothing got worse, and the rules sign it: with no regression, the LLM is never consulted.

**What you take away.** The regression had two causes and the LLM explanation named one. The other was in the facts of the rules, and what says the fix is complete is the green gate, not the explanation.

## Challenge 2: ask another model for the explanation

Each run of the gate leaves a `handoff.md` next to the report: the same input the local model gets, with the system prompt, one request for each metric that gets worse and the schema of the answer. With the `lite` profile it is how you get the explanation; with `llm` it is useful for comparing.

1. Open `out/ci/pr-loaf-cart-handler/handoff.md`, the one for the branch that makes two metrics worse for two different causes.
2. Give the whole file to an agent or to a chat with the model you want. The handoff carries the instructions: one JSON answer per request.
3. Compare its answers with the "Explanation" section of `out/ci/pr-loaf-cart-handler/report.md`:
   - Does it name the file and the change in the diff, or does it speak in general terms?
   - Does it give a different cause for each metric, or the same one for both?
   - Is its evidence in the input, or did it make it up?

**What you take away.** The verdict does not change, whoever answers: the handoff says it is already decided, and the model only writes up the cause. A larger model relates more changes in the diff to the regression, and [Learnings](../learnings/#the-same-input-to-a-larger-model) measures it with the same input.

The handoff carries the diff of the branch and the summaries of the traces. Here they are those of a sample shop; with your own code, sending them to an external service is a decision for your team.

## Challenge 3: remove the throttling and see what stops showing

The gate measures with the CPU four times slower and with the `fast-4g` network. Those conditions decide which regressions show.

1. The conditions are in `agents/src/judge/gate.ts`:

   ```ts
   export const CONDITIONS = ["--cpu", "4", "--network", "fast-4g", "--runs", "5"];
   ```

   Leave only the runs:

   ```ts
   export const CONDITIONS = ["--runs", "5"];
   ```

2. Run the gate on the three regression branches, into another folder of `out/` to keep the reports of step 5:

   ```bash
   for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler; do
     CANDIDATE=$branch docker compose run --rm -e OUT=/out/unthrottled/$branch ci
     echo "$branch: exit $?"
   done
   ```

   On the reference Mac:

   ```text
   pr-lcp-hero-lazy: exit 0
   pr-cls-promo-banner: exit 1
   pr-loaf-cart-handler: exit 1
   ```

3. Compare each `out/unthrottled/<branch>/report.md` with the one in `out/ci/<branch>/`:

   - `pr/lcp-hero-lazy` passes. The change in LCP no longer goes beyond its threshold.
   - `pr/cls-promo-banner` fails all the same. A shift does not depend on the speed of the machine or the network.
   - `pr/loaf-cart-handler` still fails because of the LCP. Its INP is also worse and the statistics see it, but the change lands close to its threshold: below it on a fast computer, above it on a slower one.

4. Put the workshop conditions back:

   ```bash
   git checkout step-04-solution -- agents/src/judge/gate.ts
   ```

Your result may differ: without throttling, what you see depends on how fast your computer is.

**What you take away.** The conditions are part of the gate. A development laptop, with its CPU and its network, lets regressions through that you would see with the CPU and the network of a phone. It is the conditions row of the table in [step 6](../workshop/step-06/#what-you-change).

## Challenge 4: create your own regression

The gate detects the three regressions of the workshop, which are prepared for it. Does it detect yours?

1. Create a branch from `main`, in another folder:

   ```bash
   git worktree add -b my-regression ../my-regression origin/main
   ```

2. Make something worse in `../my-regression/apps/shop`. To start, a classic. In `index.html`, the chat script is loaded with `defer`:

   ```html
   <script defer src="__THIRDPARTY_ORIGIN__/chat.js?delay=300&cpu=60"></script>
   ```

   Remove the `defer`, so that it blocks the parser, and save the change in a commit:

   ```bash
   git -C ../my-regression commit -am "Load the chat widget without defer"
   ```

3. The shop and the gate:

   ```bash
   scripts/build-shop.sh my-regression
   CANDIDATE=my-regression docker compose run --rm -e OUT=/out/ci/my-regression ci
   echo "exit $?"
   ```

   ```text
   exit 0
   ```

   It passes, and in the report the LCP does not move. This is not a failure of the gate: on this page, removing the `defer` does not change when the hero is painted. The app is a module script, and a module waits for the `defer` scripts that come before it in the document. The chat was already ahead of the app with `defer`, and it stays ahead without it.

4. Now make it show. The third parties of the lab are mocks, and how long they take goes in the URL: `delay` is the milliseconds the server takes to respond and `cpu`, the milliseconds the script keeps the main thread busy. Put the `defer` back and raise the `delay` to 1500, as if the chat provider were having a bad day:

   ```html
   <script defer src="__THIRDPARTY_ORIGIN__/chat.js?delay=1500&cpu=60"></script>
   ```

   Another commit, the shop and the gate:

   ```bash
   git -C ../my-regression commit -am "Simulate a slow day of the chat provider"
   scripts/build-shop.sh my-regression
   CANDIDATE=my-regression docker compose run --rm -e OUT=/out/ci/my-regression ci
   echo "exit $?"
   ```

   ```text
   exit 1
   ```

   It fails because of the LCP, with the `defer` in place: the app waits for the chat.

5. Fix it without touching the `delay`, which in real life is not yours: change `defer` to `async`, so the chat does not hold a place in line ahead of the app:

   ```html
   <script async src="__THIRDPARTY_ORIGIN__/chat.js?delay=1500&cpu=60"></script>
   ```

   Another commit, the shop and the gate:

   ```bash
   git -C ../my-regression commit -am "Load the chat widget with async"
   scripts/build-shop.sh my-regression
   CANDIDATE=my-regression docker compose run --rm -e OUT=/out/ci/my-regression ci
   echo "exit $?"
   ```

   ```text
   exit 0
   ```

   It passes, and in the report the LCP of your branch comes out somewhat better than the one of `main`: the workshop shop also waits for the chat.

**What you take away.** The gate measures what changes for the person using the page, not whether the code follows good practices: a change that sounds bad may move nothing, and one that looks harmless may delay the whole app. And a limit: in production, the provider's bad day arrives with no diff of yours. A pull request gate does not see it; field measurements do, and [Concepts](../concepts/#lab-and-field) explains the difference.

To go further, three more ideas. Not all of them trip the gate, and finding out why one does not teaches as much as watching it fail:

- An image with no `width` or `height` above the content of the home page.
- A long calculation in the handler of a button, for example in the quantity selector of the product page.
- A higher `cpu` in one of the third-party scripts.

## Putting it back as it was

Start the lab again with the default candidate shop, and delete the folders, branches and images of the challenges:

```bash
docker compose up -d
git worktree remove ../fix-lcp-hero
git worktree remove ../my-regression
git branch -D fix-lcp-hero my-regression
docker image rm ghcr.io/nucliweb/agent-first-perf-audits/shop:fix-lcp-hero ghcr.io/nucliweb/agent-first-perf-audits/shop:my-regression
```
