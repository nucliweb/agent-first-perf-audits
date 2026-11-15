import { test } from "node:test";
import assert from "node:assert/strict";
import { inconclusiveMetrics, regressedMetrics } from "../../src/judge/rules.ts";

const scenario = (id: string, metrics: Record<string, any>) => ({ scenario: id, exitCode: 1, metrics });

test("lists every regressed metric, the one furthest beyond its threshold first", () => {
  const scenarios = [
    scenario("home", { LCP: { baseline: 656, candidate: 972, threshold: 100, verdict: "regressed" } }),
    scenario("add-to-cart", { INP: { baseline: 48, candidate: 120, threshold: 50, verdict: "regressed" } }),
  ];
  // LCP: 316 / 100 = 3.16 thresholds; INP: 72 / 50 = 1.44
  assert.deepEqual(regressedMetrics(scenarios), [
    { metric: "LCP", scenario: "home", ratio: 3.16 },
    { metric: "INP", scenario: "add-to-cart", ratio: 1.44 },
  ]);
});

test("compares CLS, whose baseline of 0 has no percentage, by its threshold too", () => {
  const scenarios = [
    scenario("home", {
      LCP: { baseline: 656, candidate: 660, threshold: 100, verdict: "unchanged" },
      CLS: { baseline: 0, candidate: 0.0696, threshold: 0.05, verdict: "regressed" },
    }),
  ];
  assert.deepEqual(regressedMetrics(scenarios), [{ metric: "CLS", scenario: "home", ratio: 1.39 }]);
});

test("lists a metric once, in the scenario where it regressed the most", () => {
  const scenarios = [
    scenario("home", { CLS: { baseline: 0, candidate: 0.0696, threshold: 0.05, verdict: "regressed" } }),
    scenario("add-to-cart", { CLS: { baseline: 0, candidate: 0.0547, threshold: 0.05, verdict: "regressed" } }),
  ];
  assert.deepEqual(regressedMetrics(scenarios), [{ metric: "CLS", scenario: "home", ratio: 1.39 }]);
});

test("ignores the metrics that did not regress, however much they moved", () => {
  const scenarios = [scenario("add-to-cart", { INP: { baseline: 48, candidate: 40, threshold: 50, verdict: "unchanged" } })];
  assert.deepEqual(regressedMetrics(scenarios), []);
});

// Over its threshold without the evidence of the runs: the CLI calls it inconclusive, and the gate does
// not fail on it. The Judge does not explain it as a regression; the report says it and what to do.
test("does not list an inconclusive metric as regressed", () => {
  const scenarios = [scenario("home", { LCP: { baseline: 784, candidate: 1200, threshold: 100, p: 0.0754, verdict: "inconclusive" } })];
  assert.deepEqual(regressedMetrics(scenarios), []);
});

test("lists the inconclusive metrics, with their values and whether they got worse", () => {
  const scenarios = [
    scenario("home", {
      LCP: { baseline: 784, candidate: 1200, deltaPercent: 53.1, threshold: 100, p: 0.0754, verdict: "inconclusive" },
      CLS: { baseline: 0, candidate: 0, deltaPercent: null, threshold: 0.05, p: 1, verdict: "unchanged" },
    }),
    scenario("add-to-cart", { INP: { baseline: 120, candidate: 48, deltaPercent: -60, threshold: 50, p: 0.0754, verdict: "inconclusive" } }),
  ];
  assert.deepEqual(inconclusiveMetrics(scenarios), [
    { metric: "LCP", scenario: "home", baseline: 784, candidate: 1200, deltaPercent: 53.1, threshold: 100, p: 0.0754, verdict: "inconclusive", worse: true },
    { metric: "INP", scenario: "add-to-cart", baseline: 120, candidate: 48, deltaPercent: -60, threshold: 50, p: 0.0754, verdict: "inconclusive", worse: false },
  ]);
});
