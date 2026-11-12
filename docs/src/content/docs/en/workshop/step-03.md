---
title: "Step 3: Navigator, CLS and LoAF/INP"
description: Walk through the shop like a person and measure the layout shifts and what blocks the main thread in each journey.
sidebar:
  order: 13
---

## Goal

Three subagents that work on journeys, not on a page load: the Navigator walks through the shop step by step and checks that each journey finishes; CLS and LoAF/INP measure those same journeys. The orchestrator runs the Navigator first and hands what it found to the others.

## What you will write

Five functions, each between its `// workshop: step 3` markers:

| File | Function | What it does |
|---|---|---|
| `agents/src/subagents/navigator.ts` | `runJourney` | Opens the page of a journey, runs its steps one by one and returns a `JourneyRun` |
| `agents/src/subagents/cls.ts` | `measure` | Measures the layout shifts of a journey |
| | `clsJourneyOf` | Turns the answer into the `ClsJourney` of the journey |
| `agents/src/subagents/loaf.ts` | `measure` | Measures what blocks the main thread in a journey |
| | `loafJourneyOf` | Turns the answer into the `LoafJourney` of the journey, without the trace |

The journeys are the JSON files in `agents/journeys/`: `home`, `shop`, `product` and `add-to-cart`, each with its page (`path`) and its steps (`click`, `type`, `hover`, `scroll` and `wait`). It is the `--interact-script` format of the WebPerf Snippets CLI, and the gate measures adding to the cart with the same file.

## The tools

Everything with WebPerf Snippets MCP and the throttling of the gate (`CONDITIONS`):

| Subagent | Tools | Arguments |
|---|---|---|
| Navigator | `open_page`, `interact`, `read_results` and `close_page` | `open_page` with `url`, `cpu`, `network` and `track: ["INP"]`; `interact` with the `sessionId` and `steps` |
| CLS | `run_snippet` | `snippet: "Layout-Shift-Loading-and-Interaction"`, `interactions` with the steps of the journey, `runs` and `detail: "full"` |
| LoAF/INP | `run_workflow` | `workflow: "interaction"`, `interactions`, `runs` and `detail: "full"` |

## Hints

**Navigator.** One step per call to `interact`: that way you know the URL each step leaves the page on and, if one fails, which one it was. An element that does not show up within 5 seconds stops `interact` with an error. Turn it into one that names the journey, the step number and the step, for example `journey add-to-cart, step 2 (click button:has-text("Add to cart")): ...`; the `described` function in the same file writes the step. At the end, `read_results` gives the `pageErrors`, and `close_page` closes the page even if something failed. `open_page` needs at least one snippet in `track`; INP records nothing until a click.

**CLS and LoAF/INP.** The steps they measure are the ones the Navigator ran, in `journey.steps`, not the ones in the JSON. The result of each one:

| Field | From |
|---|---|
| `cls.value`, `cls.rating` | `result` of the snippet; `cls.runs` from `runs.summary.CLS`, with `agreement: null` when every run gives 0 |
| `shifts` | `result.details.countedShifts` and `excludedShifts`: the shifts after an interaction do not count |
| `elements` | `result.details.topElements`: `selector`, `shiftCount` and `totalImpact` |
| `inp` | The result with `id: "INP"`: `value`, `rating`, `details.worstEvent` and `details.phases`; `runs` from `runs.summary.INP`. `null` when the journey has no click and the result comes back `skipped` |
| `longFrames` | The `long-frames` result: `totalLoAFs`, `withBlockingTime`, `totalBlockingTimeMs`, `worstBlockingMs` and `topScripts` |
| `longTasks` | The `long-tasks` result: `totalBlockingTimeMs` and `worstTaskMs` |

A result with any other `status` stops the subagent with the journey, the id or the snippet and the message. The fixtures in `agents/test/fixtures/cls/` and `loaf/` are real answers on `pr/cls-promo-banner` and `pr/loaf-cart-handler`.

## Check it

```bash
docker compose run --rm agents node --test test/subagents/navigator.test.ts test/subagents/cls.test.ts test/subagents/loaf.test.ts
```

The Navigator tests open a local page with the real server; one waits for a step to fail, so they take a few seconds. Then, the three subagents against the branch with the heavy handler (the Navigator runs on its own, because CLS and LoAF need it):

```bash
CANDIDATE=pr-loaf-cart-handler docker compose up -d
CANDIDATE=pr-loaf-cart-handler docker compose run --rm agents node src/orchestrator.ts cls loaf
```

It takes a few minutes: four journeys per side and three runs of each one. In the fixtures, the INP of adding to the cart goes from 32 to 192 ms, almost all of it processing (from 10 to 169 ms), and the first script of the long animation frames is the click handler, `DIV#root.onclick`, with 166 ms. In the journeys with a click, the subagent also records a trace of the click, and trace-engine-cli names the function: `recommendFor`. Try CLS too with `CANDIDATE=pr-cls-promo-banner`: the node that moves the most is `main.main`, because the banner pushes the page down.

```bash
docker compose run --rm agents npm run check -- step-03
```

## If you fall behind

```bash
git checkout step-03-solution -- agents/src
```
