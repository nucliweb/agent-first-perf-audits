---
title: "Step 2: the LCP subagent"
description: The LCP of the home with its breakdown and how the LCP image loads, with WebPerf Snippets MCP.
sidebar:
  order: 12
---

## What you will learn

- How to read the LCP by its four phases, and which one to look at first.
- How to ask WebPerf Snippets MCP for a metric with its context: the element, the phases and how the image loads.
- How to separate measuring from deciding: the subagent gives the evidence, and the verdict belongs to the gate, which arrives in step 4.

## Time

This step has 20 minutes in the agenda. The machine time is measured on the reference Mac, with the [timed rehearsal](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.md):

| | `llm` | `lite` |
|---|---|---|
| Machine time of the step | 2.9 min | 2.9 min |
| Point 5, measure the LCP of both shops | 1.2 min | 1.2 min |

## The idea in a minute

The LCP is the time it takes to paint the largest element on the screen. The number only says that something is slow; its four phases say where the time goes:

<img src="/diagrams/phases.svg" alt="The phases of the LCP, from the navigation to the paint of the largest element: ttfb, resourceLoadDelay, resourceLoadTime and elementRenderDelay. The phases of the INP, from a click to the next frame: inputDelay, processingTime and presentationDelay" width="1120" height="340" loading="lazy" decoding="async">

Each phase points to a different fix. If `resourceLoadDelay` grows, the browser discovers the image late; if `resourceLoadTime` grows, the image is heavy or the network is slow; if `elementRenderDelay` grows, something blocks the paint. [Concepts](../../concepts/#lcp-four-phases) goes into it.

The first subagent measures that on the home of each shop: the LCP, its phases and how the LCP image loads. Here you see the evidence of the first regression, the `pr/lcp-hero-lazy` branch, which removes the preload of the hero.

## Before you start

You are still on your `taller` branch, with the lab running. If you did not finish step 1, that is fine: the solution of this step also brings the previous one.

## Step by step

1. Run the tests of the step:

   ```bash
   docker compose run --rm agents node --test test/subagents/lcp.test.ts
   ```

   The 7 tests fail (`fail 7`) with messages like this one:

   ```text
   Step 2 of the workshop: shape the answers of WebPerf Snippets into the LCP report. Its tests: test/subagents/lcp.test.ts
   ```

   It is the starting point, not an error: `askWebPerf` and `lcpReportOf`, in `agents/src/subagents/lcp.ts`, are still a `throw`.

2. Apply the solution of the step:

   ```bash
   git checkout step-02-solution -- agents/src
   ```

3. Run the tests again:

   ```bash
   docker compose run --rm agents node --test test/subagents/lcp.test.ts
   ```

   All 7 pass (`pass 7`). The first six use saved server responses; the last one measures the real shop and takes about 40 seconds.

4. Switch the candidate shop to the hero branch:

   ```bash
   CANDIDATE=pr-lcp-hero-lazy docker compose up -d
   ```

5. Measure the LCP of both shops:

   ```bash
   CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp
   ```

   It is the wait of the step. For each shop it prints a line like these (the figures change in every run):

   ```text
   [orchestrator] lcp, baseline: LCP … ms (img.hero__image); slowest phase resourceLoadTime, … ms; image loading=(not set), fetchpriority=high, preloaded
   [orchestrator] lcp, candidate: LCP … ms (img.hero__image); slowest phase resourceLoadDelay, … ms; image loading=lazy, fetchpriority=(not set), not preloaded
   ```

   This is the evidence of the regression: the LCP grows, the heaviest phase becomes the resource load delay and the image switches to `loading="lazy"`, without preload or `fetchpriority`. In the test fixtures, the LCP goes from 760 to 1168 ms and the resource load delay from 188 to 741 ms. Your figures will be similar, not identical: each run measures again. The details are in `out/agents/lcp-baseline.json` and `lcp-candidate.json`.

6. Run the check of the step:

   ```bash
   docker compose run --rm agents npm run check -- step-02
   ```

   ```text
   step-02: The LCP subagent

     OK  tests: test/subagents/lcp.test.ts
     OK  out/agents/lcp-baseline.json
     OK  out/agents/lcp-candidate.json

   step-02 is done.
   ```

## While you wait

Point 5 measures each shop three times. Meanwhile:

- Open both shops in the browser, from [The branches in the browser](../../previews/). Can you see the difference at a glance?
- When the baseline line appears, open `out/agents/lcp-baseline.json`. Which phase weighs the most? Which attributes does the LCP image have?
- Why does the subagent keep the median of three measurements and not a single one?

## Checkpoint

On screen, the two `[orchestrator] lcp` lines, with a different slowest phase on each side (`resourceLoadTime` on the baseline and `resourceLoadDelay` on the branch), and `step-02 is done.`

## If something fails

| What you see | Why | What to do |
|---|---|---|
| Your figures are not the ones in the guide | Each run measures again, and each machine is different | Compare the two sides with each other: the difference and the phase that changes |
| Both lines say the same, with `preloaded` on both sides | The candidate shop is not the hero one: without `CANDIDATE`, the lab uses `pr-noop-refactor` | Repeat points 4 and 5, with `CANDIDATE=pr-lcp-hero-lazy` in front of both commands |
| `KO` on a file of `out/agents/` in the check | Point 5 is missing | The check prints the command below "To make the files of out/, run:" |
| The tests of point 1 pass instead of failing | `agents/src` already has the solution of this step | Carry on from point 4 |

## What you take away

- The LCP is fixed by phases. On this branch the image is not heavier: it is discovered later, and `resourceLoadDelay` says so.
- A subagent is code that asks a tool for data and leaves it in a JSON with a fixed shape. There is no LLM here.
- Three measurements and their median: a single one cannot tell a change from noise.

To think about: on the page that matters most in your product, which element is the LCP and what decides when the browser discovers it?

## What the code you applied does

To see it:

```bash
git diff workshop-start -- agents/src/subagents/lcp.ts
```

It is two functions:

- `askWebPerf(url)`: the two calls to WebPerf Snippets MCP. It returns `{ workflow, subparts }`, the `structuredContent` of each response.
- `lcpReportOf(workflow, subparts)`: turns those two responses into the `LcpReport` defined in the same file.

The rest of the subagent was already in place: `lcp.run` calls both and records the trace with the `recordTrace` from step 1, with the gate throttling.

`connect("webperf")` starts WebPerf Snippets MCP and, as in step 1, each tool is called with `callTool(client, name, args)`. Both calls use `CONDITIONS` from `agents/src/subagents/subagent.ts`, which are the throttling of the gate (4x CPU and `fast-4g`) and the median of 3 runs, plus `detail: "full"` to receive the full objects:

| Tool (`name`) | Arguments (`args`) | What it gives |
|---|---|---|
| `run_workflow` | `url`, `workflow: "core-web-vitals"` | The LCP and its element and, when the LCP is an image, the image audit, which the workflow adds on its own |
| `run_snippet` | `url`, `snippet: "LCP-Subparts"` | The LCP breakdown of the median run |

This is how the breakdown of the `pr/lcp-hero-lazy` candidate arrives (from `agents/test/fixtures/lcp/subparts-candidate.json`, trimmed):

```json
"subParts": {
  "ttfb": { "value": 3, "percent": 0, "overTarget": false },
  "resourceLoadDelay": { "value": 741, "percent": 63, "overTarget": true },
  "resourceLoadTime": { "value": 412, "percent": 35, "overTarget": false, "waiting": 3, "download": 409 },
  "elementRenderDelay": { "value": 13, "percent": 1, "overTarget": false }
}
```

## If you want to write it yourself (optional)

Instead of point 2, write the two functions in `agents/src/subagents/lcp.ts`, between their `// workshop: step 2` markers. Then carry on from point 3: the tests in `agents/test/subagents/lcp.test.ts` say exactly what has to come out. If you get stuck, point 2 overwrites what you wrote with the solution.

Where each field of the `LcpReport` comes from:

| Field | From |
|---|---|
| `url` and `conditions` | `subparts.url`, `subparts.throttling` (`cpu`, `network`) and `subparts.runs.count` |
| `lcp` | `subparts.result`: `value`, `unit` and `rating`; `runs` comes from `subparts.runs.summary.LCP` |
| `element` | The result with `script: "LCP"` in `workflow.results`: its `details.element`, `details.elementType` and `details.url` |
| `subparts` and `slowestPhase` | `subparts.result.details.subParts`, keeping the `value` of each phase, and `details.slowestPhase` |
| `image` | The `Image-Element-Audit` result in `workflow.results`: the element in `items` with `isLCP`, and `preloaded` from `details.lcpCandidate`. `null` if the LCP is not an image |

- A snippet that does not finish well arrives with a `status` other than `ok` and an `error`. The subagent stops with the snippet name and that message, for example `LCP-Subparts: No LCP entry`.
- The fixtures are real server responses on `main` and on `pr/lcp-hero-lazy`.
