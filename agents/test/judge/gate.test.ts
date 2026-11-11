// The gate as the Judge reads it: the scenarios and conditions of the workshop, and the verdict
// built from what the WebPerf Snippets CLI reports for each scenario.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONDITIONS, gateOf, SCENARIOS } from "../../src/judge/gate.ts";

test("measures with 4x CPU, fast-4g and 5 runs", () => {
  assert.deepEqual(CONDITIONS, ["--cpu", "4", "--network", "fast-4g", "--runs", "5"]);
});

test("measures add to cart with the interaction workflow and the journey, and clicks what the journey clicks", () => {
  const scenario = SCENARIOS.find((s) => s.id === "add-to-cart")!;
  assert.equal(scenario.cli[0], "--workflow");
  assert.equal(scenario.cli[1], "interaction");
  assert.equal(scenario.cli[2], "--interact-script");
  assert.match(scenario.cli[3], /journeys\/add-to-cart\.json$/);
  const click = scenario.traces.find((t) => t.click)!;
  assert.equal(click.click, 'button:has-text("Add to cart")');
  assert.deepEqual(Object.keys(click.summaries), ["interactions", "tasks"]);
});

// The CLI measures the CLS of add to cart over the whole journey, load included, and the promo banner
// shifts the page while it loads. The tasks of the load would hide the handler of the click, so the
// layout shifts come from a trace of the load and the tasks from a trace of the click.
test("records the load of every scenario for its layout shifts, apart from the click", () => {
  for (const scenario of SCENARIOS) {
    const load = scenario.traces.find((t) => !t.click);
    assert.ok(load?.summaries.shifts, `${scenario.id} has no layout shifts of its load`);
  }
  const addToCart = SCENARIOS.find((s) => s.id === "add-to-cart")!;
  assert.deepEqual(Object.keys(addToCart.traces.find((t) => !t.click)!.summaries), ["shifts"]);
});

test("names each trace of a scenario differently, so their files do not overwrite each other", () => {
  for (const scenario of SCENARIOS) {
    const names = scenario.traces.map((t) => t.name);
    assert.equal(new Set(names).size, names.length, scenario.id);
  }
});

const cliMetric = (baseline: number, current: number, verdict: string, p: number) => ({
  baseline,
  current,
  delta: current - baseline,
  deltaPercent: 61,
  threshold: 100,
  verdict,
  stats: { p, shift: 0, ci: [0, 0], method: "normal" },
});

test("fails when a scenario exits with 1, with the metrics of each scenario", () => {
  const gate = gateOf([
    { scenario: "home", exitCode: 1, metrics: { LCP: cliMetric(656, 1056, "regressed", 0.0055) } },
    { scenario: "add-to-cart", exitCode: 0, metrics: { INP: cliMetric(48, 40, "unchanged", 0.04) } },
  ]);
  assert.equal(gate.verdict, "fail");
  assert.deepEqual(gate.scenarios[0], {
    scenario: "home",
    exitCode: 1,
    metrics: { LCP: { baseline: 656, candidate: 1056, deltaPercent: 61, threshold: 100, p: 0.0055, verdict: "regressed" } },
  });
});

test("passes when every scenario exits with 0", () => {
  const gate = gateOf([{ scenario: "home", exitCode: 0, metrics: { LCP: cliMetric(656, 648, "unchanged", 0.09) } }]);
  assert.equal(gate.verdict, "pass");
});
