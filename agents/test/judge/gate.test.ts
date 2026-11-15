// The gate as the Judge reads it: the scenarios and conditions of the workshop, and the verdict
// built from what the WebPerf Snippets CLI reports for each scenario.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONDITIONS, gateArgs, gateOf, MAX_RUNS, resultOf, runsOf, SCENARIOS } from "../../src/judge/gate.ts";

// Real outputs of the CLI with a live baseline, cut to what the gate reads (url, runs, conditions and
// baseline): pr-lcp-hero-lazy against main in the lab, and a page whose response waits 350 ms in some
// loads against one that answers at once, inconclusive after 5 runs a side and regressed after 7
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/gate/${name}.json`, import.meta.url), "utf8"));

test("measures with 4x CPU, fast-4g and 5 runs", () => {
  assert.deepEqual(CONDITIONS, ["--cpu", "4", "--network", "fast-4g", "--runs", "5"]);
});

// The policy of experiments/gate-stability: 5 runs a side, and 7 when a metric is inconclusive
test("measures up to 7 runs a side when a metric is inconclusive for the worse", () => {
  assert.deepEqual(MAX_RUNS, ["--max-runs", "7"]);
});

test("measures the candidate against the page of the baseline in one call of the CLI, and fails on a regression", () => {
  const home = SCENARIOS.find((s) => s.id === "home")!;
  assert.deepEqual(gateArgs({ baseline: "http://shop-baseline:3000/", candidate: "http://shop-candidate:3000/" }, home), [
    "http://shop-candidate:3000/",
    "--cpu",
    "4",
    "--network",
    "fast-4g",
    "--runs",
    "5",
    "--max-runs",
    "7",
    "--baseline",
    "http://shop-baseline:3000/",
    "--fail-on-regression",
    "--json",
  ]);
});

test("takes other conditions, as the experiments do, with the same baseline and the same extension", () => {
  const addToCart = SCENARIOS.find((s) => s.id === "add-to-cart")!;
  const args = gateArgs({ baseline: "http://a/product/x", candidate: "http://b/product/x" }, addToCart, ["--cpu", "4", "--runs", "5"]);
  assert.deepEqual(args.slice(0, 5), ["http://b/product/x", ...addToCart.cli]);
  assert.deepEqual(args.slice(5), ["--cpu", "4", "--runs", "5", "--max-runs", "7", "--baseline", "http://a/product/x", "--fail-on-regression", "--json"]);
});

test("reads the metrics and the runs a side of one call of the CLI", () => {
  const result = resultOf("home", 1, fixture("home-regressed"));
  assert.equal(result.scenario, "home");
  assert.equal(result.exitCode, 1);
  assert.equal(result.runs, 5);
  assert.equal(result.extended, undefined);
  assert.equal(result.metrics.LCP.verdict, "regressed");
  assert.equal(result.metrics.LCP.baseline, 652);
  assert.equal(result.metrics.LCP.current, 1064);
});

test("reads when the CLI measured more runs, and for which metrics", () => {
  const result = resultOf("home", 1, fixture("home-extended"));
  assert.equal(result.runs, 7);
  assert.deepEqual(result.extended, { after: 5, metrics: ["LCP"] });
  assert.deepEqual(runsOf([resultOf("home", 1, fixture("home-regressed")), result]), [
    { scenario: "home", runs: 5 },
    { scenario: "home", runs: 7, extended: { after: 5, metrics: ["LCP"] } },
  ]);
});

test("keeps an inconclusive verdict as the CLI gives it, and passes", () => {
  const result = resultOf("home", 0, fixture("home-inconclusive-better"));
  assert.equal(result.runs, 5);
  assert.equal(result.extended, undefined);
  const gate = gateOf([result]);
  assert.equal(gate.verdict, "pass");
  assert.equal(gate.scenarios[0].metrics.LCP.verdict, "inconclusive");
});

// The benchmark of the model ran on the prompt built from this gate: the runs stay out of it
test("the gate that the Judge gets has the same shape as before the live baseline", () => {
  const gate = gateOf([resultOf("home", 1, fixture("home-extended"))]);
  assert.deepEqual(Object.keys(gate.scenarios[0]), ["scenario", "exitCode", "metrics"]);
  assert.deepEqual(Object.keys(gate.scenarios[0].metrics.LCP), ["baseline", "candidate", "deltaPercent", "threshold", "p", "verdict"]);
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

// An inconclusive metric does not fail the gate: the report says it, and what to do
test("passes with an inconclusive metric, and keeps its verdict", () => {
  const gate = gateOf([{ scenario: "home", exitCode: 0, metrics: { LCP: cliMetric(784, 1200, "inconclusive", 0.0754) } }]);
  assert.equal(gate.verdict, "pass");
  assert.equal(gate.scenarios[0].metrics.LCP.verdict, "inconclusive");
});
