// The policies of the gate over runs written by hand: how many runs a side it takes, and what it
// does when a change beats its threshold and the statistics cannot tell it from the noise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, escalating, fixed, rateOf, slowBaselineP, tolerance } from "./policies.mjs";

// A run as the CLI prints it with --runs 1 --json, with only what the comparison reads
const run = (values) => ({
  url: "http://shop/",
  results: Object.entries(values).map(([metric, value]) => ({ id: metric, metric, status: "ok", value, unit: metric === "CLS" ? "score" : "ms" })),
});
const runs = (metric, values) => values.map((value) => run({ [metric]: value }));

const MAIN = [676, 688, 700, 684, 692, 680, 696, 672, 690];
const HERO = [1056, 1064, 1080, 1048, 1072, 1060, 1068, 1052, 1076];
// The baseline of 13 November: one of its runs is slower than every run of the branch
const SLOW_FIRST = [1210, ...MAIN.slice(1)];

test("a clear regression fails with 5 runs a side", () => {
  const result = decide(runs("LCP", MAIN.slice(0, 5)), runs("LCP", HERO.slice(0, 5)));
  assert.equal(result.verdict, "fail");
  assert.deepEqual(result.regressed, ["LCP"]);
  assert.deepEqual(result.inconclusive, []);
});

test("with 5 runs a side, one slow run of the baseline hides a regression of 50 %", () => {
  const result = decide(runs("LCP", SLOW_FIRST.slice(0, 5)), runs("LCP", HERO.slice(0, 5)));
  assert.equal(result.verdict, "pass");
  assert.deepEqual(result.inconclusive, ["LCP"]);
  assert.equal(result.metrics.LCP.stats.p.toFixed(4), "0.0754");
  assert.ok(result.metrics.LCP.deltaPercent > 50);
});

test("with 7 runs a side, the same slow run does not hide it", () => {
  const result = fixed(7).decide(runs("LCP", SLOW_FIRST), runs("LCP", HERO));
  assert.equal(result.verdict, "fail");
  assert.equal(result.used, 7);
});

test("the p-value of the CLI with slow runs in the baseline, for each number of runs", () => {
  const p = (n, slow) => Number(slowBaselineP(n, slow).toFixed(4));
  assert.deepEqual([p(5, 0), p(5, 1), p(5, 2)], [0.004, 0.0754, 0.3452]);
  assert.deepEqual([p(7, 0), p(7, 1), p(7, 2)], [0.0003, 0.0131, 0.1043]);
  assert.deepEqual([p(9, 0), p(9, 1), p(9, 2)], [0, 0.002, 0.0252]);
});

test("how many slow runs of the baseline each number of runs tolerates", () => {
  assert.deepEqual([5, 6, 7, 8, 9].map(tolerance), [0, 1, 1, 1, 2]);
});

test("a difference under its threshold passes and is not inconclusive, however significant", () => {
  // An INP of 16 ms against 48 ms: every run of the branch is slower, 32 ms under the 50 ms threshold
  const result = decide(runs("INP", [16, 16, 16, 24, 16]), runs("INP", [48, 48, 40, 48, 56]));
  assert.equal(result.verdict, "pass");
  assert.deepEqual(result.inconclusive, []);
  assert.ok(result.metrics.INP.stats.p < 0.05);
});

test("the escalating policy stops at its first number of runs when the verdict is clear", () => {
  const policy = escalating(5, 9);
  const clear = policy.decide(runs("LCP", MAIN), runs("LCP", HERO));
  assert.deepEqual([clear.verdict, clear.used], ["fail", 5]);
  const same = policy.decide(runs("LCP", MAIN), runs("LCP", [...MAIN].reverse()));
  assert.deepEqual([same.verdict, same.used], ["pass", 5]);
});

test("the escalating policy measures up to its second number when the first is inconclusive", () => {
  const result = escalating(5, 9).decide(runs("LCP", SLOW_FIRST), runs("LCP", HERO));
  assert.deepEqual([result.verdict, result.used], ["fail", 9]);
});

test("a policy without enough runs says so instead of deciding with fewer", () => {
  assert.throws(() => fixed(7).decide(runs("LCP", MAIN.slice(0, 5)), runs("LCP", HERO)), /7 runs/);
});

test("the rate of a policy over rounds: how many fail, and how many runs a side it spends", () => {
  const rounds = [
    { baseline: runs("LCP", MAIN), candidate: runs("LCP", HERO) },
    { baseline: runs("LCP", SLOW_FIRST), candidate: runs("LCP", HERO) },
  ];
  assert.deepEqual(rateOf(fixed(5), rounds), { rounds: 2, fail: 1, inconclusive: 1, runs: 5 });
  assert.deepEqual(rateOf(escalating(5, 9), rounds), { rounds: 2, fail: 2, inconclusive: 0, runs: 7 });
});
