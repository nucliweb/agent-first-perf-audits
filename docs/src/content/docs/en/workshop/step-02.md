---
title: "Step 2: the LCP subagent"
description: The LCP of the home with its breakdown and how the LCP image loads, with WebPerf Snippets MCP.
sidebar:
  order: 12
---

## Goal

The first subagent: it measures the LCP of the home of each shop, broken down into its four phases, and how the LCP image loads. In this step you see the evidence of the first regression, the `pr/lcp-hero-lazy` branch, which removes the preload of the hero. The subagent measures, it does not decide: the verdict belongs to the gate, which arrives in step 4.

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

   It takes a minute and a half. For each shop it prints a line like these, here with the figures of the test fixtures:

   ```text
   [orchestrator] lcp, baseline: LCP 760 ms (img.hero__image); slowest phase resourceLoadTime, 309 ms; image loading=(not set), fetchpriority=high, preloaded
   [orchestrator] lcp, candidate: LCP 1168 ms (img.hero__image); slowest phase resourceLoadDelay, 741 ms; image loading=lazy, fetchpriority=(not set), not preloaded
   ```

   This is the evidence of the regression: the LCP grows, the heaviest phase becomes the resource load delay (188 to 741 ms in the fixtures) and the image switches to `loading="lazy"`, without preload or `fetchpriority`. Your figures will be similar, not identical: each run measures again. The details are in `out/agents/lcp-baseline.json` and `lcp-candidate.json`.

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

## What the code you applied does

To see it:

```bash
git diff workshop-start -- agents/src/subagents/lcp.ts
```

It is two functions:

- `askWebPerf(url)`: the two calls to WebPerf Snippets MCP. It returns `{ workflow, subparts }`, the `structuredContent` of each response.
- `lcpReportOf(workflow, subparts)`: turns those two responses into the `LcpReport` defined in the same file.

The rest of the subagent was already in place: `lcp.run` calls both and records the trace with the `recordTrace` from step 1, with the gate throttling.

`connect("webperf")` starts WebPerf Snippets MCP and, as in step 1, each tool is called with `callTool(client, name, args)`. Both calls use the gate conditions, `CONDITIONS` from `agents/src/subagents/subagent.ts` (4x CPU, `fast-4g` and the median of 3 runs), plus `detail: "full"` to receive the full objects:

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
