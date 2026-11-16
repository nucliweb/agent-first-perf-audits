---
title: "Step 4: the Judge"
description: The rules decide the verdict, the local LLM explains the cause and the findings of the subagents back it up.
sidebar:
  order: 14
---

## What you will learn

- Who decides in a performance gate, the rules and their statistics, and what role is left for the LLM.
- How to read a Judge report: the verdict, the cause and the findings that back it up.
- How to go from the evidence to a proposed fix.

## Time

This step has 20 minutes in the agenda. The machine time is measured on the reference Mac, with the [timed rehearsal](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.md):

| | `llm` | `lite` |
|---|---|---|
| Machine time of the step | 4.6 min | 4.0 min |
| Point 5, measure the LCP and run the Judge | 3.9 min | 3.3 min |

## The idea in a minute

A verdict that can be defended cannot come from a language model. The Judge runs the same gate as `ci`, and each part has an owner:

<img src="/diagrams/gate.svg" alt="The gate measures the baseline and the branch alternating their runs; if the change beats the threshold and p is under 0.05, it exits with 1, trace-engine-cli attributes the change and the LLM explains it; if it beats the threshold and p does not get there, it measures two more runs a side and decides once more; otherwise it exits with 0" width="1120" height="340" loading="lazy" decoding="async">

- **The rules decide.** The WebPerf Snippets CLI measures both shops and says whether the branch regresses, with a statistical test (Mann-Whitney U), a threshold per metric and an exit code.
- **trace-engine-cli attributes.** On the traces of both sides, it names the element, the script or the function that changes.
- **The local LLM explains.** It receives what was already measured and writes up the cause of each metric that regresses. If it contradicts the rules, the rules win.
- **The findings of the subagents back it up.** They are the facts the rules pick from what steps 2 and 3 measured, and they go into the report next to the explanation.

How the gate decides, and what p is, is in [Concepts](../../concepts/#how-the-gate-decides). In this step you go from the evidence to the cause and to a proposed fix, with the `pr/lcp-hero-lazy` branch.

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

   It is the wait of the step. After the two LCP lines, the Judge prints each phase; these are the ones that matter:

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

## While you wait

Point 5 measures the whole gate: five runs a side in each scenario, alternating the two shops. Meanwhile:

- Follow the `judge: gate`, `judge: trace` and `judge: explanation` lines: they are the three parts, in order. In which one is the verdict decided?
- Open `agents/schemas/verdict.schema.json`: it is the shape the answer of the LLM has to have. What would happen with an answer that does not meet it?
- If the LLM said the branch passes and the rules said it fails, what would show in the report?

## Checkpoint

On screen, `[orchestrator] judge: gate: fail` and `step-04 is done.`, and in `out/agents/judge/` a `report.md` with the verdict, the cause and the findings of the LCP.

## If something fails

| What you see | Why | What to do |
|---|---|---|
| `judge: gate: pass`, and the report carries the block "Inconclusive: run the gate again." at the top | The change beats the threshold, but the measurements are not enough to claim it | Repeat point 5. The check of point 7 says the same |
| With `lite`, the first line says `lite profile` and the `explanation` one does not show | It is expected: there is no local LLM | The report points to `handoff.md`, with the same input for an agent of your choice |
| The report has the verdict, and an error where the explanation would go | The local LLM did not answer, or answered something that does not meet the schema | The verdict does not depend on it. Check with `docker compose ps` that `ollama` is running and repeat point 5 |
| The explanation only names `loading="lazy"` | The local model is small and keeps one change | The findings, at the end of the report, give the other two |

## What you take away

- The rules decide and the LLM explains. If they contradict each other, the rules win and the report says so.
- A verdict is defended with the statistics, the attribution and the facts. The sentence of the LLM is the last thing to arrive, not the first.
- With the `lite` profile, the verdict and the findings are the same, and the explanation can be asked for elsewhere with the handoff.

To think about: in your team, who would read this report, and what do they need to see to trust it?

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
