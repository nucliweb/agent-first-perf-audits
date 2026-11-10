import { test } from "node:test";
import assert from "node:assert/strict";
import { regressedMetrics } from "../../src/judge/rules.ts";

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
