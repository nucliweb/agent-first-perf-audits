// The report of a night: what each policy gives each branch, scenario and order over the rounds, on
// a small results object written by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedOf, formatTable, policiesOf, reportRows } from "./report.mjs";

const run = (values) => ({
  timestamp: "2026-11-14T01:00:00.000Z",
  url: "http://shop/",
  navMs: 4000,
  results: Object.entries(values).map(([metric, value]) => ({ id: metric, metric, status: "ok", value, unit: metric === "CLS" ? "score" : "ms" })),
  conditions: { machine: { benchmarkIndex: 2000 } },
});
const runs = (metric, values) => values.map((value) => run({ [metric]: value }));

const MAIN = [676, 688, 700, 684, 692, 680, 696, 672, 690];
const HERO = [1056, 1064, 1080, 1048, 1072, 1060, 1068, 1052, 1076];
const SLOW_FIRST = [1210, ...MAIN.slice(1)];
const NOOP = [...MAIN].reverse();

const BRANCHES = [
  { ref: "pr/lcp-hero-lazy", expect: { scenario: "home", metric: "LCP" } },
  { ref: "pr/loaf-cart-handler", expect: { scenario: "add-to-cart", metric: "INP" } },
  { ref: "pr/noop-refactor", expect: null },
];

const record = (round, branch, order, baseline, candidate) => ({ round, scenario: "home", branch, order, baseline: runs("LCP", baseline), candidate: runs("LCP", candidate) });
const RESULTS = {
  label: "test",
  runs: 9,
  load: false,
  conditions: null,
  records: [
    record(1, "pr/lcp-hero-lazy", "adjacent", MAIN, HERO),
    record(2, "pr/lcp-hero-lazy", "adjacent", SLOW_FIRST, HERO),
    record(1, "pr/lcp-hero-lazy", "interleaved", MAIN, HERO),
    record(1, "pr/noop-refactor", "adjacent", MAIN, NOOP),
    record(2, "pr/noop-refactor", "adjacent", MAIN, HERO),
    record(1, "pr/loaf-cart-handler", "adjacent", MAIN, NOOP),
  ],
};

test("the policies of the report: a number is that many runs, a range escalates", () => {
  assert.deepEqual(
    policiesOf("5,7,9,5-9").map((p) => p.name),
    ["5 runs", "7 runs", "9 runs", "5 runs, 9 when inconclusive"],
  );
  assert.throws(() => policiesOf("5,x"), /x/);
});

test("the expected verdict of a branch in a scenario comes from BRANCHES", () => {
  assert.deepEqual(expectedOf("pr/lcp-hero-lazy", "home", BRANCHES), { verdict: "fail", metric: "LCP" });
  assert.deepEqual(expectedOf("pr/noop-refactor", "add-to-cart", BRANCHES), { verdict: "pass" });
  assert.equal(expectedOf("pr/loaf-cart-handler", "home", BRANCHES), null);
});

test("each policy over the rounds of a branch, a scenario and an order", () => {
  const rows = reportRows(RESULTS, { branches: BRANCHES, policies: policiesOf("5,9,5-9") });
  const of = (branch, order) => rows.filter((r) => r.branch === branch && r.order === order).map(({ policy, rounds, fail, inconclusive, right, runs }) => ({ policy, rounds, fail, inconclusive, right, runs }));
  assert.deepEqual(of("pr/lcp-hero-lazy", "adjacent"), [
    { policy: "5 runs", rounds: 2, fail: 1, inconclusive: 1, right: 1, runs: 5 },
    { policy: "9 runs", rounds: 2, fail: 2, inconclusive: 0, right: 2, runs: 9 },
    { policy: "5 runs, 9 when inconclusive", rounds: 2, fail: 2, inconclusive: 0, right: 2, runs: 7 },
  ]);
  assert.deepEqual(of("pr/lcp-hero-lazy", "interleaved")[0], { policy: "5 runs", rounds: 1, fail: 1, inconclusive: 0, right: 1, runs: 5 });
  // The refactor passes in one round and, with the runs of a regression, fails in the other: one right
  assert.deepEqual(of("pr/noop-refactor", "adjacent")[0], { policy: "5 runs", rounds: 2, fail: 1, inconclusive: 0, right: 1, runs: 5 });
  // Without an expected verdict there is nothing to get right
  assert.equal(of("pr/loaf-cart-handler", "adjacent")[0].right, null);
  assert.deepEqual(
    [...new Set(rows.map((r) => `${r.branch} ${r.scenario} ${r.order}`))],
    ["pr/lcp-hero-lazy home adjacent", "pr/lcp-hero-lazy home interleaved", "pr/loaf-cart-handler home adjacent", "pr/noop-refactor home adjacent"],
  );
});

test("a policy that needs more runs than were measured gives no figures, instead of deciding with fewer", () => {
  const rows = reportRows({ ...RESULTS, records: [record(1, "pr/lcp-hero-lazy", "adjacent", MAIN.slice(0, 2), HERO.slice(0, 2))] }, { branches: BRANCHES, policies: policiesOf("2,5") });
  assert.deepEqual(
    rows.map(({ policy, fail, right, runs }) => ({ policy, fail, right, runs })),
    [
      { policy: "2 runs", fail: 1, right: 1, runs: 2 },
      { policy: "5 runs", fail: null, right: null, runs: null },
    ],
  );
});

test("the table of the report, in Markdown", () => {
  const rows = reportRows({ ...RESULTS, records: RESULTS.records.slice(0, 2) }, { branches: BRANCHES, policies: policiesOf("5,9") });
  assert.equal(
    formatTable(rows),
    [
      "| Branch | Scenario | Order | Expected | Policy | Rounds | Fail | Inconclusive | Right | Runs a side |",
      "|---|---|---|---|---|---|---|---|---|---|",
      "| `pr/lcp-hero-lazy` | home | adjacent | fail (LCP) | 5 runs | 2 | 1 | 1 | 1 | 5.0 |",
      "| `pr/lcp-hero-lazy` | home | adjacent | fail (LCP) | 9 runs | 2 | 2 | 0 | 2 | 9.0 |",
    ].join("\n"),
  );
  const missing = reportRows({ ...RESULTS, records: [RESULTS.records[5]] }, { branches: BRANCHES, policies: policiesOf("10") });
  assert.equal(formatTable(missing).split("\n")[2], "| `pr/loaf-cart-handler` | home | adjacent | not set | 10 runs | 1 | - | - | - | - |");
});
