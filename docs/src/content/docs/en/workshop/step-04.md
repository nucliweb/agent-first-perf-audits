---
title: "Step 4: the Judge"
description: The rules decide the verdict, the local LLM explains the cause and the findings of the subagents back it up.
sidebar:
  order: 14
---

## Goal

Bring everything together into a verdict that can be defended. The Judge runs the same gate as `ci`: the WebPerf Snippets CLI decides whether the branch regresses (Mann-Whitney U, thresholds and exit code), trace-engine-cli attributes and the local LLM explains the cause of each metric that regresses. The findings of the subagents, the facts the rules pick from what they measured, go into the report next to the explanation. In this step you go from the evidence to the cause and to a proposed fix, with the `pr/lcp-hero-lazy` branch.

## Before you start

You are still on your `taller` branch, with the lab running. If you did not finish the previous steps, that is fine: the solution of this step also brings the previous ones.

## Step by step

1. Run the tests of the step:

   ```bash
   docker compose run --rm agents node --test test/judge/findings.test.ts
   ```

   The 5 tests fail (`fail 5`) with messages like this one:

   ```text
   Step 4 of the workshop: the facts of the LCP subagent for a regressed LCP. Its tests: test/judge/findings.test.ts
   ```

   It is the starting point, not an error: `lcpFacts`, `clsFacts` and `inpFacts`, in `agents/src/judge/findings.ts`, are still a `throw`.

2. Apply the solution of the step:

   ```bash
   git checkout step-04-solution -- agents/src
   ```

3. Run the tests again:

   ```bash
   docker compose run --rm agents node --test test/judge/findings.test.ts
   ```

   All 5 pass (`pass 5`) in a few seconds.

4. Switch the candidate shop to the hero branch:

   ```bash
   CANDIDATE=pr-lcp-hero-lazy docker compose up -d
   ```

5. Measure the LCP and run the Judge:

   ```bash
   CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp judge
   ```

   It takes about 7 minutes. After the two LCP lines, the Judge prints each phase; these are the ones that matter:

   ```text
   [orchestrator] judge: pr/lcp-hero-lazy against main, llm profile
   [orchestrator] judge: gate: fail
   [orchestrator] judge: explanation: 1 call(s) to llama3.2:3b
   [orchestrator] judge: fail: report in report.md, report.html and report.json
   [orchestrator] judge: findings of the subagents: LCP in home (4 facts)
   ```

6. Read the report, `out/agents/judge/report.md`. It is where the full diagnosis shows:

   - **The verdict** belongs to the rules: the gate fails on the LCP of the home.
   - **The cause** is explained by the LLM: it names the `loading="lazy"` of the hero.
   - **The findings**, at the end, add what the LLM does not say: the preload and the `fetchpriority` the image loses. With the test fixtures they are these four sentences:

     ```text
     LCP of the home: 760 ms in the baseline, 1168 ms in the branch (median of 3 runs)
     The phase that grows the most is resourceLoadDelay: 188 ms to 741 ms
     The LCP image changes: loading (not set) to lazy, fetchpriority high to (not set), preload removed
     New warnings of the LCP image: lcp-no-fetchpriority, lcp-lazy, lcp-not-preloaded
     ```

   The proposed fix comes from there: give the hero back its preload and `fetchpriority="high"`, and remove its `loading="lazy"`. With the `lite` profile there is no LLM explanation: the report points to `handoff.md`, which carries the same input for an agent of your choice, and the findings are the same.

7. Run the check of the step:

   ```bash
   docker compose run --rm agents npm run check -- step-04
   ```

   ```text
   step-04: The Judge

     OK  tests: test/judge/findings.test.ts
     OK  out/agents/judge/report.json

   step-04 is done.
   ```

## What the code you applied does

To see it:

```bash
git diff workshop-start -- agents/src/judge/findings.ts
```

It is three functions:

| Function | For a metric that regresses | With what it measured |
|---|---|---|
| `lcpFacts` | LCP, only on the home, which is what the subagent measures | The LCP subagent |
| `clsFacts` | CLS, on the journey named like the gate scenario | The CLS subagent |
| `inpFacts` | INP, on the journey named like the gate scenario | The LoAF/INP subagent |

Each one returns a list of sentences, empty if the subagent did not run on both sides. `findingsFor` calls them in the order of the metrics the rules decide. There is no MCP here: they are rules over the JSON of the subagents.

The LLM does not see these facts: it gets the same prompt as in `ci`, the one checked in the model benchmark. Why it is kept apart is in [Learnings](../../learnings/), in "The LLM explains, the rules decide".

## If you want to write it yourself (optional)

Instead of point 2, write the three functions in `agents/src/judge/findings.ts`, each between its `// workshop: step 4` markers. Then carry on from point 3: the exact sentences are in `agents/test/judge/findings.test.ts`. If you get stuck, point 2 overwrites what you wrote with the solution.

The file already has what you need:

- `bothSides(found, name)`: the result of a subagent on the baseline and on the branch, or `null` if one is missing.
- `grownPhase(baseline, candidate, unit)`: the sentence of the phase that grows the most.
- `scriptKey`: a script of the long frames without the origin or the bundle hash, which change from one side to the other.
- `suspectsFor` from `suspects.ts`: the functions that grow in the trace of the branch, the same rules the Judge uses for its prompt.

Hints:

- A sentence only goes in if it says something: if the image does not change, there is no sentence of changes; if there are no new warnings, neither.
- In CLS, the nodes that count are the ones that move on the branch and not on the baseline, three at most.
- In INP, the new scripts are the ones of the branch whose key is not in the baseline, and the function comes from the trace of the click on each side.
