---
title: Glossary
description: The terms the workshop guides use, each in one or two lines.
sidebar:
  order: 92
---

The terms that appear in the guides, in alphabetical order. The metrics are explained more calmly in [Concepts](../concepts/).

## Metrics

| Term | What it is |
|---|---|
| CLS | Cumulative Layout Shift. How much the content moves without the person causing it. A score with no unit; "good" up to 0.1 |
| Core Web Vitals | The three metrics Google uses to sum up the experience of a page: LCP, CLS and INP |
| INP | Interaction to Next Paint. How long the page takes to paint the response to an interaction; "good" up to 200 ms |
| LCP | Largest Contentful Paint. When the largest element on the screen is painted; "good" up to 2.5 s |
| LCP phases | The four times that add up to the LCP: TTFB, resource load delay, resource load time and render delay. In the code, `subparts` |
| LoAF | Long Animation Frame. A frame that takes longer than 50 ms to paint, with the scripts that occupy it and who invokes them |
| TTFB | Time to First Byte. How long the first byte of the HTML takes to arrive |

## Measure

| Term | What it is |
|---|---|
| Baseline | The version it is compared with: in the workshop, the shop of `main` |
| Candidate | The version being evaluated: the shop of the pull request branch |
| Field | Measurements from real people, with their devices and their networks |
| `fast-4g` | The simulated network of the workshop, the DevTools Fast 4G |
| Journey | A page and the interaction steps done on it (`click`, `type`, `scroll`), written in a JSON in `agents/journeys/` |
| Lab | A measurement under fixed, repeatable conditions. Also, the Docker Compose services of the workshop |
| Scenario | What the gate measures on a page: `home` is the load of the front page and `add-to-cart`, the page of a product with a click |
| Throttling | Deliberately slowing the CPU and the network so the measurement looks like a mid-range phone and not your laptop |
| Trace | The recording of everything the browser does during a load or a click. It is the file the Performance panel of DevTools opens |

## Decide

| Term | What it is |
|---|---|
| Exit code | The number a command ends with. The gate's is the verdict: 0 if it passes, 1 if it fails and 2 if it could not measure |
| Gate | The check that decides whether a pull request can go on. The workshop's compares the branch with `main` and fails if any metric gets worse |
| Mann-Whitney U | The statistical test of the gate. It looks at the order of the runs of both sides, not their milliseconds, and says whether the difference can be noise |
| p | The probability of seeing a difference like this if the two versions were equally fast. Below 0.05, the gate takes it as real |
| Regression | A change that makes a metric worse by more than its threshold and that is not noise |
| Threshold | The minimum a metric has to get worse to count. It is not Google's "good" threshold, but the gate's against the baseline |
| Verdict | The result of the gate: `pass` or `fail` |

## Agents

| Term | What it is |
|---|---|
| Attribution | Going from "the INP gets worse" to "this function, in this file and this line" |
| Fixture | A real response saved in a file, so the tests do not have to measure every time |
| Handoff | The file with the full input for the model, which the gate writes to pass it to another agent |
| Judge | The subagent that puts together the verdict of the rules, the attribution and the explanation of the model |
| MCP | Model Context Protocol. The standard way for a program, or a model, to call the tools of another |
| MCP tool | A function an MCP server offers, with a name and some arguments, such as `performance_start_trace` |
| Navigator | The subagent that goes through the shop and checks that each step of each journey works |
| Orchestrator | The program that passes each subagent through the two shops, one after another |
| Schema | The shape a JSON has to have. The answer of the model is validated against one |
| stdio | The way the workshop talks to the MCP servers: it starts them as processes and writes to their standard input |
| Subagent | In the workshop, code that calls MCP tools with fixed arguments and returns a JSON. It is not a model |
| TOON | Token-Oriented Object Notation. A format more compact than JSON to pass data to a model |
