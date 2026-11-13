---
title: "Step 3: Navigator, CLS and LoAF/INP"
description: Walk through the shop like a person and measure the layout shifts and what blocks the main thread in each journey.
sidebar:
  order: 13
---

## Goal

Three subagents that work on journeys, not on a page load: the Navigator walks through the shop step by step and checks that each journey finishes; CLS and LoAF/INP measure those same journeys. In this step you see the evidence of the second regression, the `pr/loaf-cart-handler` branch, which makes the add to cart click heavy.

## Before you start

You are still on your `taller` branch, with the lab running. If you did not finish the previous steps, that is fine: the solution of this step also brings the previous ones.

## Step by step

1. Run the tests of the step:

   ```bash
   docker compose run --rm agents node --test test/subagents/navigator.test.ts test/subagents/cls.test.ts test/subagents/loaf.test.ts
   ```

   Of 19 tests, 14 fail (`fail 14`) with messages like this one:

   ```text
   Step 3 of the workshop: run the steps of a journey with open_page, interact and read_results. Its tests: test/subagents/navigator.test.ts
   ```

   It is the starting point, not an error: the five functions of the step are still a `throw`. The 5 that pass do not depend on them.

2. Apply the solution of the step:

   ```bash
   git checkout step-03-solution -- agents/src
   ```

3. Run the tests again:

   ```bash
   docker compose run --rm agents node --test test/subagents/navigator.test.ts test/subagents/cls.test.ts test/subagents/loaf.test.ts
   ```

   All 19 pass (`pass 19`). They take a little over half a minute: the Navigator tests open a local page with the real server, and one waits for a step to fail.

4. Switch the candidate shop to the branch with the heavy handler:

   ```bash
   CANDIDATE=pr-loaf-cart-handler docker compose up -d
   ```

5. Walk through and measure both shops:

   ```bash
   CANDIDATE=pr-loaf-cart-handler docker compose run --rm agents node src/orchestrator.ts cls loaf
   ```

   It takes about 6 minutes: the Navigator goes first, because CLS and LoAF/INP measure its journeys, and each subagent measures four journeys per side, three times each. It prints one line per subagent and shop, among them these (the figures change on every run):

   ```text
   [orchestrator] navigator, baseline: home 5 steps, shop 3 steps, product 3 steps, add-to-cart 3 steps; no page errors
   [orchestrator] loaf, baseline: home no click, shop INP … ms, product INP … ms, add-to-cart INP … ms; slowest add-to-cart: processing … ms, top script MessagePort.onmessage (…)
   [orchestrator] loaf, candidate: home no click, shop INP … ms, product INP … ms, add-to-cart INP … ms; slowest add-to-cart: processing … ms, top script DIV#root.onclick (…)
   ```

   This is the evidence of the regression: on the branch, the add to cart click spends almost all its time processing, and the script that blocks the most is the click handler, `DIV#root.onclick`. In the test fixtures, the INP of adding to the cart goes from 32 to 192 ms, processing from 10 to 169 ms, and the handler blocks for 166 ms. In the journeys with a click, the subagent also records a trace of the click, and trace-engine-cli names the function: `recommendFor`. The CLS of this branch does not change: its regression is a different one. The details are in `out/agents/navigator-*.json`, `cls-*.json` and `loaf-*.json`.

6. Run the check of the step:

   ```bash
   docker compose run --rm agents npm run check -- step-03
   ```

   ```text
   step-03: The Navigator, CLS and LoAF/INP

     OK  tests: test/subagents/cls.test.ts test/subagents/loaf.test.ts test/subagents/navigator.test.ts
     OK  out/agents/navigator-baseline.json
     OK  out/agents/cls-baseline.json
     OK  out/agents/loaf-baseline.json
     OK  out/agents/navigator-candidate.json
     OK  out/agents/cls-candidate.json
     OK  out/agents/loaf-candidate.json

   step-03 is done.
   ```

7. Optional: the CLS regression, with the banner branch:

   ```bash
   CANDIDATE=pr-cls-promo-banner docker compose up -d
   CANDIDATE=pr-cls-promo-banner docker compose run --rm agents node src/orchestrator.ts cls
   ```

   In the `cls, candidate` line, the CLS is no longer 0 in the four journeys. In `out/agents/cls-candidate.json`, the node that moves the most is `main.main`: the banner pushes the page down.

## What the code you applied does

To see it:

```bash
git diff workshop-start -- agents/src/subagents/navigator.ts agents/src/subagents/cls.ts agents/src/subagents/loaf.ts
```

It is five functions:

| File | Function | What it does |
|---|---|---|
| `agents/src/subagents/navigator.ts` | `runJourney` | Opens the page of a journey, runs its steps one by one and returns a `JourneyRun` |
| `agents/src/subagents/cls.ts` | `measure` | Measures the layout shifts of a journey |
| | `clsJourneyOf` | Turns the answer into the `ClsJourney` of the journey |
| `agents/src/subagents/loaf.ts` | `measure` | Measures what blocks the main thread in a journey |
| | `loafJourneyOf` | Turns the answer into the `LoafJourney` of the journey, without the trace |

The journeys are the JSON files in `agents/journeys/`: `home`, `shop`, `product` and `add-to-cart`, each with its page (`path`) and its steps (`click`, `type`, `hover`, `scroll` and `wait`). It is the `--interact-script` format of the WebPerf Snippets CLI, and the gate measures adding to the cart with the same file.

Everything with WebPerf Snippets MCP and the throttling of the gate (`CONDITIONS`), calling each tool with `callTool`:

| Subagent | Tools | Arguments |
|---|---|---|
| Navigator | `open_page`, `interact`, `read_results` and `close_page` | `open_page` with `url`, `cpu`, `network` and `track: ["INP"]`; `interact` with the `sessionId` and `steps` |
| CLS | `run_snippet` | `snippet: "Layout-Shift-Loading-and-Interaction"`, `interactions` with the steps of the journey, `runs` and `detail: "full"` |
| LoAF/INP | `run_workflow` | `workflow: "interaction"`, `interactions`, `runs` and `detail: "full"` |

## If you want to write it yourself (optional)

Instead of point 2, write the five functions, each between its `// workshop: step 3` markers. Then carry on from point 3: the tests tell you whether you have it. If you get stuck, point 2 overwrites what you wrote with the solution.

**Navigator.** One step per call to `interact`: that way you know the URL each step leaves the page on and, if one fails, which one it was. An element that does not show up within 5 seconds stops `interact` with an error. Turn it into one that names the journey, the step number and the step, for example `journey add-to-cart, step 2 (click button:has-text("Add to cart")): ...`; the `described` function in the same file writes the step. At the end, `read_results` gives the `pageErrors`, and `close_page` closes the page even if something failed. `open_page` needs at least one snippet in `track`; INP records nothing until a click.

**CLS and LoAF/INP.** The steps they measure are the ones the Navigator ran, in `journey.steps`, not the ones in the JSON. The result of each one:

| Field | From |
|---|---|
| `cls.value`, `cls.rating` | `result` of the snippet; `cls.runs` from `runs.summary.CLS`, with `agreement: null` when every run gives 0 |
| `shifts` | `result.details.countedShifts` and `excludedShifts`: the shifts after an interaction do not count |
| `elements` | `result.details.topElements`: `selector`, `shiftCount` and `totalImpact` |
| `inp` | The result with `id: "INP"`: `value`, `rating`, `details.worstEvent` and `details.phases`; `runs` from `runs.summary.INP`. `null` when the journey has no click and the result arrives `skipped` |
| `longFrames` | The `long-frames` result: `totalLoAFs`, `withBlockingTime`, `totalBlockingTimeMs`, `worstBlockingMs` and `topScripts` |
| `longTasks` | The `long-tasks` result: `totalBlockingTimeMs` and `worstTaskMs` |

A result with any other `status` stops the subagent with the journey, the id or the snippet and the message. The fixtures in `agents/test/fixtures/cls/` and `loaf/` are real answers on `pr/cls-promo-banner` and `pr/loaf-cart-handler`.
