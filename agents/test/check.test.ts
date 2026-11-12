// The check of each step of the workshop: the tests of the step, found by the workshop markers of
// the code, and the files the step leaves in out/. The tests write those files by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { outputsOf, STEPS, testsOf } from "../src/check.ts";

function out(files: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), "check-"));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), typeof content === "string" ? content : JSON.stringify(content));
  }
  return dir;
}

const failing = (results: Array<{ ok: boolean; what: string }>) => results.filter((r) => !r.ok).map((r) => r.what);

test("the workshop has five steps to check, each with what to run", () => {
  assert.deepEqual(Object.keys(STEPS), ["step-01", "step-02", "step-03", "step-04", "step-05"]);
  for (const step of Object.values(STEPS)) assert.ok(step.run.length > 0);
});

test("the tests of each step come from the workshop markers of the code", () => {
  assert.deepEqual(testsOf(1), ["test/mcp/trace.test.ts"]);
  assert.deepEqual(testsOf(2), ["test/subagents/lcp.test.ts"]);
  assert.deepEqual(testsOf(3), ["test/subagents/navigator.test.ts", "test/subagents/cls.test.ts", "test/subagents/loaf.test.ts"].sort());
  assert.deepEqual(testsOf(4), ["test/judge/findings.test.ts"]);
  assert.deepEqual(testsOf(5), []);
});

test("step 1 needs the trace of the first call, with an LCP", () => {
  const trace = { traceEvents: [...Array(200)].map(() => ({ name: "x" })).concat({ name: "largestContentfulPaint::Candidate" }) };
  assert.deepEqual(failing(outputsOf("step-01", out({ "first-trace.json": trace }))), []);
  assert.deepEqual(failing(outputsOf("step-01", out({}))), ["out/first-trace.json"]);
  assert.deepEqual(failing(outputsOf("step-01", out({ "first-trace.json": { traceEvents: [] } }))), ["out/first-trace.json"]);
});

const lcpReport = { lcp: { value: 760 }, subparts: { ttfb: 3, resourceLoadDelay: 188, resourceLoadTime: 309, elementRenderDelay: 260 }, trace: "traces/lcp-baseline.json" };

test("step 2 needs the LCP of both sides with its breakdown", () => {
  assert.deepEqual(failing(outputsOf("step-02", out({ "agents/lcp-baseline.json": lcpReport, "agents/lcp-candidate.json": lcpReport }))), []);
  assert.deepEqual(failing(outputsOf("step-02", out({ "agents/lcp-baseline.json": lcpReport, "agents/lcp-candidate.json": { lcp: { value: 760 } } }))), ["out/agents/lcp-candidate.json"]);
});

test("step 3 needs the journeys of the Navigator, their CLS and their INP", () => {
  const journeys = (extra: object) => ({ journeys: ["home", "shop", "product", "add-to-cart"].map((name) => ({ name, ...extra })) });
  const files = {
    "agents/navigator-baseline.json": journeys({ steps: [{}] }),
    "agents/navigator-candidate.json": journeys({ steps: [{}] }),
    "agents/cls-baseline.json": journeys({ cls: { value: 0 } }),
    "agents/cls-candidate.json": journeys({ cls: { value: 0.05 } }),
    "agents/loaf-baseline.json": journeys({ inp: { value: 32 }, longFrames: {} }),
    "agents/loaf-candidate.json": journeys({ inp: null, longFrames: {} }),
  };
  assert.deepEqual(failing(outputsOf("step-03", out(files))), ["out/agents/loaf-candidate.json"]);
});

test("step 4 needs the report of the Judge on pr/lcp-hero-lazy: fail, with the findings of the LCP", () => {
  const report = { branch: "pr/lcp-hero-lazy", verdict: "fail", findings: [{ metric: "LCP", facts: ["a fact"] }] };
  assert.deepEqual(failing(outputsOf("step-04", out({ "agents/judge/report.json": report }))), []);
  assert.deepEqual(failing(outputsOf("step-04", out({ "agents/judge/report.json": { ...report, verdict: "pass" } }))), ["out/agents/judge/report.json"]);
  assert.deepEqual(failing(outputsOf("step-04", out({ "agents/judge/report.json": { ...report, branch: "pr/noop-refactor" } }))), ["out/agents/judge/report.json"]);
});

test("step 5 needs the report of ci for each branch: three fail and one passes", () => {
  const report = (branch: string, verdict: string) => ({ [`ci/${branch.replace("/", "-")}/report.json`]: { branch, verdict } });
  const files = {
    ...report("pr/lcp-hero-lazy", "fail"),
    ...report("pr/cls-promo-banner", "fail"),
    ...report("pr/loaf-cart-handler", "fail"),
    ...report("pr/noop-refactor", "pass"),
  };
  assert.deepEqual(failing(outputsOf("step-05", out(files))), []);
  assert.deepEqual(failing(outputsOf("step-05", out({ ...files, ...report("pr/noop-refactor", "fail") }))), ["out/ci/pr-noop-refactor/report.json"]);
});

test("in a fresh clone the branches exist only on the remote, and the reports name them so", () => {
  const report = { branch: "origin/pr/lcp-hero-lazy", verdict: "fail", findings: [{ metric: "LCP", facts: ["a fact"] }] };
  assert.deepEqual(failing(outputsOf("step-04", out({ "agents/judge/report.json": report }))), []);
  const ci = { "ci/pr-noop-refactor/report.json": { branch: "origin/pr/noop-refactor", verdict: "pass" } };
  assert.ok(!failing(outputsOf("step-05", out(ci))).includes("out/ci/pr-noop-refactor/report.json"));
});
