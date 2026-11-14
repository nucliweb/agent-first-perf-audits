// The policies of the gate, as pure functions over runs already measured: how many runs a side the
// gate takes, and what it does when a change beats its threshold and the statistics cannot tell it
// from the noise. The decision is the one of the WebPerf Snippets CLI, with its own code: the runs
// become the measurement the CLI would print for them (summarizeRuns) and the comparison is its
// compareRun, so a policy says what the gate would have decided with those runs.
import { compareRun } from "webperf-snippets/src/baseline.js";
import { summarizeRuns } from "webperf-snippets/src/runs.js";
import { mannWhitneyGreater } from "webperf-snippets/src/stats.js";

const ALPHA = 0.05;

// The measurement the CLI prints for several runs: the median run, with the summary of all of them
function measurementOf(runs) {
  const { payload, runs: summary } = summarizeRuns(runs);
  return { ...payload, runs: summary };
}

// The decision of the gate for the runs of a baseline and of a candidate, each one a JSON of the CLI
// with --runs 1. Inconclusive is a metric that got worse beyond its threshold and is still unchanged
// for the CLI, because its p-value does not reach 0.05.
export function decide(baseline, candidate) {
  const { metrics } = compareRun(measurementOf(baseline), measurementOf(candidate), { file: "baseline" });
  const names = Object.keys(metrics);
  const regressed = names.filter((name) => metrics[name].verdict === "regressed");
  const inconclusive = names.filter((name) => metrics[name].verdict === "unchanged" && metrics[name].delta > metrics[name].threshold);
  return { verdict: regressed.length ? "fail" : "pass", regressed, inconclusive, metrics };
}

function first(runs, count, side) {
  if (runs.length < count) throw new Error(`The policy needs ${count} runs of the ${side} and there are ${runs.length}`);
  return runs.slice(0, count);
}

// Always the same number of runs a side
export function fixed(count) {
  return {
    name: `${count} runs`,
    decide: (baseline, candidate) => ({ ...decide(first(baseline, count, "baseline"), first(candidate, count, "candidate")), used: count }),
  };
}

// The first number of runs and, only when that leaves a metric inconclusive, up to the second
export function escalating(from, to) {
  return {
    name: `${from} runs, ${to} when inconclusive`,
    decide: (baseline, candidate) => {
      const result = fixed(from).decide(baseline, candidate);
      return result.verdict === "pass" && result.inconclusive.length ? fixed(to).decide(baseline, candidate) : result;
    },
  };
}

// The p-value the CLI gives a regression where every run of the candidate is slower than the
// baseline, except for some runs of the baseline that are slower than all of them
export function slowBaselineP(runs, slow) {
  const baseline = Array.from({ length: runs }, (_, i) => (i < slow ? 3000 + i : 1000 + i));
  const candidate = Array.from({ length: runs }, (_, i) => 2000 + i);
  return mannWhitneyGreater(candidate, baseline).p;
}

// How many slow runs of the baseline a number of runs a side tolerates before p reaches 0.05
export function tolerance(runs) {
  let slow = 0;
  while (slow < runs && slowBaselineP(runs, slow + 1) < ALPHA) slow++;
  return slow;
}

// A policy over rounds of { baseline, candidate }: how many fail, how many stay inconclusive and how
// many runs a side it spends on average
export function rateOf(policy, rounds) {
  const results = rounds.map((round) => policy.decide(round.baseline, round.candidate));
  return {
    rounds: rounds.length,
    fail: results.filter((r) => r.verdict === "fail").length,
    inconclusive: results.filter((r) => r.verdict === "pass" && r.inconclusive.length).length,
    runs: results.reduce((sum, r) => sum + r.used, 0) / results.length,
  };
}
