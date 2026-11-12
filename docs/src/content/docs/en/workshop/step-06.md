---
title: "Step 6: take it to your platform"
description: What to change to bring the gate and the subagents to your application, and which workshop decisions are worth keeping.
sidebar:
  order: 16
---

## Goal

Leave the workshop with a plan for your platform: which pieces stay as they are, which ones you change and which design decisions are worth keeping.

## What you change

| Workshop piece | On your platform |
|---|---|
| `shop-baseline` and `shop-candidate`, built from two git refs | Your application built from the main branch and from the pull request branch, on the same machine and in the same run |
| `thirdparty`, the third-party mocks | Your real third parties, or mocks with their latency and their CPU cost if you want a gate without network access |
| The journeys in `agents/journeys/` | The journeys that matter in your product, with stable selectors |
| The gate scenarios in `agents/src/judge/gate.ts` | The pages and journeys your gate has to protect |
| The conditions (4x CPU, `fast-4g`, five runs) | Those of your users: throttling is part of what the gate can see |

## What you keep

- **The rules decide, the LLM explains.** The verdict is the CLI statistics and its exit code; the LLM writes up the cause from data that is already measured, with output validated by a schema, and if it contradicts the rules, the rules win.
- **Not everything has to be an MCP.** The orchestrator already knows which command to run and when, and trace-engine-cli already gives compact output designed for LLMs: an MCP on top would add no information, only one more layer.
- **Compare with the baseline, not with absolute thresholds.** The three workshop regressions stay within "good".
- **Measure one at a time.** Two Chromium instances at once share the CPU and contaminate the metrics.
- **Function names in the build.** Fully minified, the profiler names each function with a single letter and the Judge cannot relate it to the diff; trace-engine-cli does not read source maps.
- **The handoff.** Whoever cannot run a local LLM has the same input for an agent of their choice, and each team decides whether its code leaves its machine.

The context and the data behind these decisions are in [Learnings](../../learnings/) and in [Why this stack](../../stack/), which explains each piece of the stack, what was discarded and the data that decided it.
