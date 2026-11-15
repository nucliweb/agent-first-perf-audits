// The pure part of the collector: what it measures in a round and in which order, what it keeps of
// each run, how it resumes an interrupted night, and how it reads its flags.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeRuns } from "webperf-snippets/src/runs.js";
import { decide } from "./policies.mjs";
import {
  busyContainers,
  cliArgs,
  conditionsOf,
  failedRun,
  formatDuration,
  keyOf,
  optionsOf,
  pendingBlocks,
  planRounds,
  progressLine,
  recordsOf,
  resultsFile,
  savedRun,
  shopOf,
  singleRun,
} from "./collect.mjs";

const ALL = ["pr/lcp-hero-lazy", "pr/cls-promo-banner", "pr/loaf-cart-handler", "pr/noop-refactor"];

// A run as the CLI prints it with --runs 1 --json, with the heavy details of its snippets
const cliRun = (lcp, { benchmarkIndex = 2156 } = {}) => ({
  url: "http://shop-main:3000/",
  navMs: 4129,
  results: [
    { id: "LCP", script: "...", status: "ok", metric: "LCP", value: lcp, unit: "ms", rating: "good", thresholds: {}, details: { element: "img" } },
    { id: "CLS", script: "...", status: "ok", metric: "CLS", value: 0, unit: "score", rating: "good", thresholds: {}, message: "", getDataFn: "" },
    { id: "image-audit", script: "...", status: "ok", count: 4, details: {}, items: [{ src: "/hero.jpg" }], issues: [], reason: "LCP" },
  ],
  pageErrors: [],
  throttling: { cpu: 4, network: "fast-4g" },
  runs: { count: 1, failed: 0, medianRun: 1, medianBy: "LCP", summary: { LCP: { median: lcp, min: lcp, max: lcp, values: [lcp], unit: "ms" } } },
  conditions: {
    viewport: "mobile",
    workflow: "core-web-vitals",
    waitMs: 3000,
    cpu: 4,
    network: "fast-4g",
    browser: { build: "chromium", mode: "headless", version: "153.0.8010.12" },
    cliVersion: "1.15.0",
    machine: { cpu: "unknown", cores: 10, arch: "arm64", memoryGB: 8, benchmarkIndex },
  },
});

test("a single run has the conditions of the gate with one run instead of five", () => {
  assert.deepEqual(singleRun(["--cpu", "4", "--network", "fast-4g", "--runs", "5"]), ["--cpu", "4", "--network", "fast-4g", "--runs", "1"]);
  assert.throws(() => singleRun(["--cpu", "4"]), /--runs/);
});

test("the CLI runs inside the agents container, with the journey where the container mounts it", () => {
  const scenario = { id: "add-to-cart", path: "/product/kenya-aa", cli: ["--workflow", "interaction", "--interact-script", "/work/repo/agents/journeys/add-to-cart.json"] };
  assert.deepEqual(cliArgs("http://shop-main:3000", scenario, "/work/repo"), [
    "http://shop-main:3000/product/kenya-aa",
    "--workflow",
    "interaction",
    "--interact-script",
    "/app/journeys/add-to-cart.json",
    "--cpu",
    "4",
    "--network",
    "fast-4g",
    "--runs",
    "1",
    "--json",
  ]);
  assert.equal(cliArgs("http://shop-main:3000", { id: "home", path: "/", cli: [] }, "/work/repo")[0], "http://shop-main:3000/");
});

test("each ref has its shop service in the lab, the one the override file defines", () => {
  assert.deepEqual(shopOf("pr/lcp-hero-lazy"), { service: "shop-pr-lcp-hero-lazy", tag: "pr-lcp-hero-lazy", url: "http://shop-pr-lcp-hero-lazy:3000" });
  const override = readFileSync(new URL("./compose.yaml", import.meta.url), "utf8");
  for (const ref of ["main", ...ALL]) {
    const { service, tag } = shopOf(ref);
    assert.match(override, new RegExp(`^  ${service}:$`, "m"), service);
    assert.match(override, new RegExp(`shop:${tag}$`, "m"), tag);
  }
});

test("a round of home: main and each branch one after the other, then all of them interleaved", () => {
  const blocks = planRounds({ rounds: 1, runs: 2, branches: ALL, scenarios: ["home"] });
  assert.deepEqual(
    blocks.map((b) => [b.order, b.branches.join(" ")]),
    [...ALL.map((ref) => ["adjacent", ref]), ["interleaved", ALL.join(" ")]],
  );
  assert.deepEqual(blocks[0].sequence, ["main", "main", "pr/lcp-hero-lazy", "pr/lcp-hero-lazy"]);
  assert.deepEqual(blocks[4].sequence, ["main", ...ALL, "main", ...ALL]);
  assert.ok(blocks.every((b) => b.round === 1 && b.scenario === "home"));
});

test("add to cart measures only the branches that change it, and a full round is 180 runs", () => {
  const blocks = planRounds({ rounds: 1, runs: 9, branches: ALL, scenarios: ["home", "add-to-cart"] });
  const cart = blocks.filter((b) => b.scenario === "add-to-cart");
  assert.deepEqual(
    cart.map((b) => [b.order, b.branches.join(" ")]),
    [
      ["adjacent", "pr/loaf-cart-handler"],
      ["adjacent", "pr/noop-refactor"],
      ["interleaved", "pr/loaf-cart-handler pr/noop-refactor"],
    ],
  );
  assert.equal(
    blocks.reduce((sum, b) => sum + b.sequence.length, 0),
    180,
  );
});

test("the flags choose the rounds, the branches and the scenarios", () => {
  const blocks = planRounds({ rounds: 2, runs: 2, branches: ["pr/lcp-hero-lazy"], scenarios: ["home", "add-to-cart"] });
  assert.deepEqual(
    blocks.map((b) => `${b.round} ${b.scenario} ${b.order} ${b.sequence.join(",")}`),
    [
      "1 home adjacent main,main,pr/lcp-hero-lazy,pr/lcp-hero-lazy",
      "1 home interleaved main,pr/lcp-hero-lazy,main,pr/lcp-hero-lazy",
      "2 home adjacent main,main,pr/lcp-hero-lazy,pr/lcp-hero-lazy",
      "2 home interleaved main,pr/lcp-hero-lazy,main,pr/lcp-hero-lazy",
    ],
  );
});

test("a block becomes one record per branch, each with the runs of main and of the branch in the order measured", () => {
  const [block] = planRounds({ rounds: 1, runs: 2, branches: ["pr/lcp-hero-lazy", "pr/noop-refactor"], scenarios: ["home"] }).filter((b) => b.order === "interleaved");
  const runs = { main: ["m1", "m2"], "pr/lcp-hero-lazy": ["l1", "l2"], "pr/noop-refactor": ["n1", "n2"] };
  assert.deepEqual(recordsOf(block, runs), [
    { round: 1, scenario: "home", branch: "pr/lcp-hero-lazy", order: "interleaved", baseline: ["m1", "m2"], candidate: ["l1", "l2"] },
    { round: 1, scenario: "home", branch: "pr/noop-refactor", order: "interleaved", baseline: ["m1", "m2"], candidate: ["n1", "n2"] },
  ]);
});

test("a saved run keeps what the policies read, its benchmark index and its time, and drops the details", () => {
  const full = cliRun(720, { benchmarkIndex: 1980 });
  const saved = savedRun(full, "2026-11-14T01:00:00.000Z");
  assert.deepEqual(saved, {
    timestamp: "2026-11-14T01:00:00.000Z",
    url: "http://shop-main:3000/",
    navMs: 4129,
    results: [
      { id: "LCP", metric: "LCP", status: "ok", value: 720, unit: "ms" },
      { id: "CLS", metric: "CLS", status: "ok", value: 0, unit: "score" },
    ],
    conditions: { machine: { benchmarkIndex: 1980 } },
  });
  assert.deepEqual(summarizeRuns([saved, savedRun(cliRun(700), "t")]).runs, summarizeRuns([full, cliRun(700)]).runs);
  const lcps = [690, 700, 710, 720, 730];
  const slower = [1050, 1060, 1070, 1080, 1090];
  assert.deepEqual(
    decide(lcps.map((v) => savedRun(cliRun(v), "t")), slower.map((v) => savedRun(cliRun(v), "t"))).metrics,
    decide(lcps.map((v) => cliRun(v)), slower.map((v) => cliRun(v))).metrics,
  );
});

test("a run that failed is kept as its error, which the CLI leaves out of the median", () => {
  const failed = failedRun("The CLI exited with 2", "2026-11-14T01:00:00.000Z");
  assert.deepEqual(failed, { timestamp: "2026-11-14T01:00:00.000Z", error: "The CLI exited with 2" });
  const { runs } = summarizeRuns([savedRun(cliRun(700), "t"), failed]);
  assert.deepEqual([runs.count, runs.failed, runs.summary.LCP.median], [2, 1, 700]);
});

test("the conditions are saved once, without the benchmark index of one run", () => {
  assert.deepEqual(conditionsOf(cliRun(720)), {
    viewport: "mobile",
    waitMs: 3000,
    cpu: 4,
    network: "fast-4g",
    browser: { build: "chromium", mode: "headless", version: "153.0.8010.12" },
    cliVersion: "1.15.0",
    machine: { cpu: "unknown", cores: 10, arch: "arm64", memoryGB: 8 },
  });
});

test("resuming skips the blocks whose records are saved and redoes a block that was cut", () => {
  const blocks = planRounds({ rounds: 2, runs: 2, branches: ["pr/lcp-hero-lazy", "pr/noop-refactor"], scenarios: ["home"] });
  const saved = blocks.filter((b) => b.round === 1).flatMap((b) => recordsOf(b, { main: [], "pr/lcp-hero-lazy": [], "pr/noop-refactor": [] }));
  assert.deepEqual(pendingBlocks(blocks, saved), blocks.filter((b) => b.round === 2));
  // Only one of the two records of an interleaved block: it was not saved by the collector, so it is measured again
  const cut = saved.filter((r) => !(r.order === "interleaved" && r.branch === "pr/noop-refactor"));
  assert.deepEqual(
    pendingBlocks(blocks, cut).map((b) => `${b.round} ${b.order}`),
    ["1 interleaved", "2 adjacent", "2 adjacent", "2 interleaved"],
  );
  assert.equal(keyOf(saved[0]), "1 home adjacent pr/lcp-hero-lazy");
});

test("the results file of a label: a new one, or the saved one with --resume and the same settings", () => {
  const settings = { label: "idle", runs: 9, load: false };
  assert.deepEqual(resultsFile(null, settings, { resume: false }), { label: "idle", runs: 9, load: false, conditions: null, records: [] });
  const saved = { label: "idle", runs: 9, load: false, conditions: { cliVersion: "1.15.0" }, records: [{ round: 1 }] };
  assert.throws(() => resultsFile(saved, settings, { resume: false }), /--resume/);
  assert.equal(resultsFile(saved, settings, { resume: true }), saved);
  assert.throws(() => resultsFile(saved, { ...settings, runs: 5 }, { resume: true }), /9 runs a side/);
  assert.throws(() => resultsFile(saved, { ...settings, load: true }, { resume: true }), /load/);
  assert.deepEqual(resultsFile(null, settings, { resume: true }).records, []);
});

test("the flags, with their defaults and their limits", () => {
  assert.deepEqual(optionsOf(["--label", "idle"]), {
    label: "idle",
    rounds: 1,
    runs: 9,
    branches: ALL,
    scenarios: ["home", "add-to-cart"],
    resume: false,
    load: false,
  });
  assert.deepEqual(
    optionsOf(["--label", "smoke", "--rounds", "1", "--runs", "2", "--branches", "pr/lcp-hero-lazy", "--scenarios", "home", "--resume", "--load"]),
    { label: "smoke", rounds: 1, runs: 2, branches: ["pr/lcp-hero-lazy"], scenarios: ["home"], resume: true, load: true },
  );
  assert.throws(() => optionsOf([]), /--label/);
  assert.throws(() => optionsOf(["--label", "../x"]), /label/);
  assert.throws(() => optionsOf(["--label", "idle", "--runs", "10"]), /1 to 9/);
  assert.throws(() => optionsOf(["--label", "idle", "--rounds", "0"]), /--rounds/);
  assert.throws(() => optionsOf(["--label", "idle", "--branches", "pr/nope"]), /pr\/nope/);
  assert.throws(() => optionsOf(["--label", "idle", "--scenarios", "checkout"]), /checkout/);
});

test("the lab is busy with a gate, the agents or the Ollama of the benchmark running", () => {
  const lab = ["agent-first-perf-audits-shop-baseline-1", "agent-first-perf-audits-thirdparty-1", "agent-first-perf-audits-ollama-1", "wamiz-php"];
  assert.deepEqual(busyContainers(lab), []);
  assert.deepEqual(busyContainers([...lab, "agent-first-perf-audits-ci-run-1a2b", "ollama-bench", "agent-first-perf-audits-agents-run-3c4d"]), [
    "agent-first-perf-audits-ci-run-1a2b",
    "ollama-bench",
    "agent-first-perf-audits-agents-run-3c4d",
  ]);
});

test("the progress says where the night is, how long it took and how long is left", () => {
  assert.equal(formatDuration(59_000), "59s");
  assert.equal(formatDuration(3_725_000), "1h02m05s");
  assert.equal(
    progressLine({ done: 45, total: 180, elapsedMs: 270_000, round: 1, rounds: 2, scenario: "home", order: "adjacent", ref: "pr/lcp-hero-lazy", value: "LCP 1056" }),
    "[45/180] round 1/2, home adjacent, pr/lcp-hero-lazy: LCP 1056 | 4m30s elapsed, about 13m30s left",
  );
});
