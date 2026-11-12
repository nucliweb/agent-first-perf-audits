---
title: "Step 2: the LCP subagent"
description: The LCP of the home with its breakdown and how the LCP image loads, with WebPerf Snippets MCP.
sidebar:
  order: 12
---

## Goal

The first subagent: measure the LCP of the home of each shop, broken down into its four phases, and find out how the LCP image loads. It measures, it does not decide: the verdict belongs to the gate, which arrives in step 4.

## What you will write

Two functions in `agents/src/subagents/lcp.ts`, between their `// workshop: step 2` markers:

- `askWebPerf(url)`: the two calls to WebPerf Snippets MCP. It returns `{ workflow, subparts }`, the `structuredContent` of each response.
- `lcpReportOf(workflow, subparts)`: turns those two responses into the `LcpReport` defined in the same file.

The rest of the subagent is already in place: `lcp.run` calls both and records the trace with your `recordTrace` from step 1, with the gate throttling.

## The tools

`connect("webperf")` starts WebPerf Snippets MCP. Both calls use the gate conditions, `CONDITIONS` from `agents/src/subagents/subagent.ts` (4x CPU, `fast-4g` and the median of 3 runs), plus `detail: "full"` to receive the full objects:

| Tool | Arguments | What it gives |
|---|---|---|
| `run_workflow` | `url`, `workflow: "core-web-vitals"` | The LCP and its element and, when the LCP is an image, the image audit, which the workflow adds on its own |
| `run_snippet` | `url`, `snippet: "LCP-Subparts"` | The LCP breakdown of the median run |

## Hints

Where each field of the `LcpReport` comes from:

| Field | From |
|---|---|
| `url` and `conditions` | `subparts.url`, `subparts.throttling` (`cpu`, `network`) and `subparts.runs.count` |
| `lcp` | `subparts.result`: `value`, `unit` and `rating`; `runs` comes from `subparts.runs.summary.LCP` |
| `element` | The result with `script: "LCP"` in `workflow.results`: its `details.element`, `details.elementType` and `details.url` |
| `subparts` and `slowestPhase` | `subparts.result.details.subParts`, keeping the `value` of each phase, and `details.slowestPhase` |
| `image` | The `Image-Element-Audit` result in `workflow.results`: the element in `items` with `isLCP`, and `preloaded` from `details.lcpCandidate`. `null` if the LCP is not an image |

This is how the breakdown of the `pr/lcp-hero-lazy` candidate arrives (from `agents/test/fixtures/lcp/subparts-candidate.json`, trimmed):

```json
"subParts": {
  "ttfb": { "value": 3, "percent": 0, "overTarget": false },
  "resourceLoadDelay": { "value": 741, "percent": 63, "overTarget": true },
  "resourceLoadTime": { "value": 412, "percent": 35, "overTarget": false, "waiting": 3, "download": 409 },
  "elementRenderDelay": { "value": 13, "percent": 1, "overTarget": false }
}
```

- A snippet that does not finish well arrives with a `status` other than `ok` and an `error`. The subagent stops with the snippet name and that message, for example `LCP-Subparts: No LCP entry`.
- The fixtures are real server responses on `main` and on `pr/lcp-hero-lazy`. The tests in `agents/test/subagents/lcp.test.ts` say exactly what has to come out of them.

## Check it

The tests with the fixtures do not need the lab; the last one measures the shop and only runs inside Compose:

```bash
docker compose run --rm agents node --test test/subagents/lcp.test.ts
```

Then, the subagent against the branch that removes the hero preload:

```bash
CANDIDATE=pr-lcp-hero-lazy docker compose up -d
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp
```

In `out/agents/lcp-baseline.json` and `lcp-candidate.json` you have both shops. In the fixtures, the LCP goes from 760 to 1168 ms, the phase that grows the most is the resource load delay (from 188 to 741 ms) and the image switches to `loading="lazy"`, with no preload or `fetchpriority`. Your figures will be similar, not identical: each run measures again.

```bash
docker compose run --rm agents npm run check -- step-02
```

## If you fall behind

```bash
git checkout step-02-solution -- agents/src
```
