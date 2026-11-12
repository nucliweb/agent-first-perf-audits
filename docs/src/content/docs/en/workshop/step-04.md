---
title: "Step 4: the Judge"
description: The rules decide the verdict, the local LLM explains the cause and the subagent findings back it up.
sidebar:
  order: 14
---

## Goal

Bring everything together into a verdict you can defend. The Judge runs the same gate as `ci`: the WebPerf Snippets CLI decides whether the branch regresses (Mann-Whitney U, thresholds and exit code), trace-engine-cli attributes and the local LLM explains the cause of each metric that regresses. In this step you write the part that connects the subagents with the Judge: the facts that the rules pick from what they measured, and that go into the report next to the explanation.

## What you will write

Three functions in `agents/src/judge/findings.ts`, each between its `// workshop: step 4` markers:

| Function | For a metric that regresses | With what it measured |
|---|---|---|
| `lcpFacts` | LCP, only on the home, which is what the subagent measures | The LCP subagent |
| `clsFacts` | CLS, in the journey named like the gate scenario | The CLS subagent |
| `inpFacts` | INP, in the journey named like the gate scenario | The LoAF/INP subagent |

Each one returns a list of sentences, empty if the subagent did not run on both sides. `findingsFor`, which is already in place, calls them in the order of the metrics that the rules decide.

## The tools

There is no MCP here: these are rules over the subagent JSON files. The file already includes what you need:

- `bothSides(found, name)`: the result of a subagent on the baseline and on the branch, or `null` if one is missing.
- `grownPhase(baseline, candidate, unit)`: the sentence for the phase that grows the most.
- `scriptKey`: a long frame script without the origin or the bundle hash, which change from one side to the other.
- `suspectsFor` from `suspects.ts`: the functions that grow in the branch trace, the same rules the Judge uses for its prompt.

## Hints

The exact sentences are in `agents/test/judge/findings.test.ts`, with real subagent results. For example, for the LCP of `pr/lcp-hero-lazy`:

```text
LCP of the home: 760 ms in the baseline, 1168 ms in the branch (median of 3 runs)
The phase that grows the most is resourceLoadDelay: 188 ms to 741 ms
The LCP image changes: loading (not set) to lazy, fetchpriority high to (not set), preload removed
New warnings of the LCP image: lcp-no-fetchpriority, lcp-lazy, lcp-not-preloaded
```

- A sentence is only included if it says something: if the image does not change, there is no changes sentence; if there are no new warnings, there is no warnings sentence either.
- In CLS, the nodes that count are the ones that move on the branch and not on the baseline, three at most.
- In INP, the new scripts are the branch scripts whose key is not in the baseline, and the function comes from the click trace of each side.

The LLM does not see these facts: it receives the same prompt as in `ci`, the one checked in the model benchmark. Why it is kept separate is explained in [Learnings](../../learnings/), in "The LLM explains, the rules decide".

## Check it

```bash
docker compose run --rm agents node --test test/judge/findings.test.ts
```

Then, the LCP and the Judge against the hero branch:

```bash
CANDIDATE=pr-lcp-hero-lazy docker compose up -d
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp judge
```

The Judge writes the report to `out/agents/judge/` in `report.md`, `report.html` and `report.json`, plus the handoff. The gate has to fail on the LCP, the LLM explanation has to name the `loading="lazy"` of the hero and your findings have to add what it does not say: the preload and the `fetchpriority` that the image loses. With the `lite` profile there is no LLM explanation: the report points to `handoff.md`, which carries the same input for an agent of your choice, and the findings are the same.

```bash
docker compose run --rm agents npm run check -- step-04
```

## If you fall behind

```bash
git checkout step-04-solution -- agents/src
```
