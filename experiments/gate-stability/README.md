# Experiment: reliability of the gate

English · [Castellano](README.es.md) · [Català](README.ca.md)

Measures how often the gate of the workshop gets each branch right, depending on how many runs a side it takes and what it does when a change beats its threshold and the statistics cannot tell it from the noise.

## Why

The gate measures the baseline and the branch with `--runs 5`, and the WebPerf Snippets CLI only accepts a regression when it beats its threshold and the Mann-Whitney U test gives p < 0.05. With 5 runs a side, a single slow run of the baseline leaves p at 0.0754, and a regression of 50 % passes the gate. This table is the p-value of the CLI when every run of the branch is slower than the runs of the baseline, except for some runs of the baseline that are slower than all of them:

| Runs a side | No slow run | One slow run | Two slow runs |
|---|---|---|---|
| 5 | 0.004 | 0.0754 | 0.3452 |
| 7 | 0.0003 | 0.0131 | 0.1043 |
| 9 | < 0.0001 | 0.002 | 0.0252 |

Five runs tolerate none; 6, 7 and 8 tolerate one, and 9, the maximum of the CLI, two.

## What it does

1. `collect.mjs` measures single runs (`--runs 1`, with the throttling of the gate) of the shop of `main` and of each `pr/*` branch, inside the lab of the repo and with one Chromium at a time. In each round it measures each scenario in two orders:
   - `adjacent`: every run of `main` and then every run of one branch, as the gate does.
   - `interleaved`: `main`, each branch, and over again.
2. It saves each run in `results/<label>.json`, with the `benchmarkIndex` of the machine at that moment. With `--load`, the `ollama` service of the lab generates text while it measures.
3. `policies.mjs` decides over those runs with the code of the CLI itself (`summarizeRuns` and `compareRun`), so each policy gives what the gate would have said with them: 5, 7 or 9 fixed runs, or 5 and up to 9 only when the result is inconclusive.
4. `report.mjs` prints, for each branch, scenario and order, how many rounds each policy fails, how many stay inconclusive and how many runs a side it spends.

`home` measures the four branches; `add-to-cart`, the two that change it: `pr/loaf-cart-handler` and `pr/noop-refactor`.

## The rule to choose

Written before measuring. The cheapest policy that meets the four conditions stays:

1. With the machine idle, it fails in every round of each branch with a regression.
2. With `ollama` generating next to it, it fails in at least 90 % of those rounds.
3. It fails in no round of `pr/noop-refactor`, idle or loaded.
4. Step 5 of the workshop, with the gate on the branches that run live, fits in its slot of the agenda.

## Requirements

- Node 22.18 or later, and Docker with the images of the workshop already pulled (`scripts/preflight.sh`).
- The lab with no measurement in progress: `collect.mjs` refuses to start when a `ci` or `agents` container is working.
- The machine on its own while it measures.

## Usage

```bash
npm install
npm test                                              # the policies, the plan of a round and the table
node collect.mjs --label idle --rounds 25             # about 18 minutes a round
node collect.mjs --label loaded --rounds 20 --load    # with ollama generating while it measures
node report.mjs idle                                  # the table of each policy
```

An interrupted measurement keeps its rounds: the same command with `--resume` continues where it stopped.

## What the tests check

- The policies decide as the CLI does: a clear regression fails with 5 runs, a slow run of the baseline hides it with 5 and not with 7, and a significant difference under its threshold passes.
- The tolerance table above.
- The order of the measurements of a round, what it keeps of each run, how it resumes and the table of the report.

## Versions

`webperf-snippets` 1.15.0, pinned in [`package.json`](package.json). The conditions and the scenarios are those of the gate, from [`agents/src/judge/gate.ts`](../../agents/src/judge/gate.ts).
