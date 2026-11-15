// The requests of the Judge. A small model that copies loading="lazy" from the diff into the JSON
// constrained by the schema closes the string at the first quote, and the sentence ends in
// "loading=". With the quotes escaped in the input, it copies a form that is valid inside a string.
import { test } from "node:test";
import assert from "node:assert/strict";
import { requestsFor, rulesAnswer } from "../../src/judge/prompt.ts";
import type { JudgeInput } from "../../src/judge/types.ts";

const tasks = (...rows: string[]) =>
  ["mode: bottom-up", `tasks[${rows.length}]{durationMs,selfTimeMs,functionName,url,lineNumber,columnNumber}:`, ...rows.map((r) => `  ${r}`)].join("\n");

const input = (diff: string, candidateTasks = tasks()): JudgeInput => ({
  branch: "pr/branch",
  gate: { verdict: "fail", scenarios: [{ scenario: "home", metrics: { LCP: { baseline: 656, candidate: 1056, deltaPercent: 61, threshold: 100, verdict: "regressed" } } }] },
  diff,
  traces: { home: { baseline: { tasks: tasks() }, candidate: { tasks: candidateTasks } } },
});

test("escapes the double quotes of the diff", () => {
  const [{ messages }] = requestsFor(input('+++ b/apps/shop/src/pages.tsx\n-          fetchPriority="high"\n+          loading="lazy"'));
  assert.ok(messages[1].content.includes('+          loading=\\"lazy\\"'), messages[1].content);
  assert.ok(!messages[1].content.includes('loading="lazy"'));
});

test("escapes the double quotes of the line of the diff that the rules matched", () => {
  const diff = '+++ b/apps/shop/index.html\n+<script src="__THIRDPARTY_ORIGIN__/ab.js?cpu=150"></script>';
  const [{ messages }] = requestsFor(input(diff, tasks('151.2,151.0,ProfileCall,"http://thirdparty:4000/ab.js?cpu=150",0,1')));
  assert.match(messages[1].content, /^Cause found by the rules: .* by the line: <script src=\\"__THIRDPARTY_ORIGIN__\/ab\.js\?cpu=150\\"><\/script>$/m);
});

// An inconclusive metric is over its threshold without the evidence of the runs: the gate does not fail
// on it, so the Judge asks for no explanation of it, and the metric keeps its verdict in the prompt of
// the others
const gateWith = (metrics: JudgeInput["gate"]["scenarios"][number]["metrics"]): JudgeInput => ({
  ...input(""),
  gate: { verdict: "pass", scenarios: [{ scenario: "home", metrics }] },
});

test("asks for no explanation of an inconclusive metric", () => {
  assert.deepEqual(requestsFor(gateWith({ LCP: { baseline: 784, candidate: 1200, deltaPercent: 53.1, threshold: 100, p: 0.0754, verdict: "inconclusive" } })), []);
});

test("an inconclusive metric goes into the prompt of a regressed one as inconclusive, not as a regression", () => {
  const both = gateWith({
    LCP: { baseline: 784, candidate: 1200, deltaPercent: 53.1, threshold: 100, p: 0.0754, verdict: "inconclusive" },
    CLS: { baseline: 0, candidate: 0.0696, deltaPercent: null, threshold: 0.05, p: 0.004, verdict: "regressed" },
  });
  const requests = requestsFor(both);
  assert.deepEqual(requests.map((r) => r.target.metric), ["CLS"]);
  assert.match(requests[0].messages[1].content, /^- home: LCP 784 ms -> 1200 ms \(inconclusive, \+53\.1%\); CLS 0 -> 0\.0696 \(regressed\)$/m);
});

// The answer of the rules when nothing regressed
test("without a regression, the rules say that no metric went beyond its threshold", () => {
  const answer = rulesAnswer(gateWith({ LCP: { baseline: 784, candidate: 790, deltaPercent: 0.8, threshold: 100, p: 0.5, verdict: "unchanged" } }));
  assert.equal(answer.suspected_cause, "Nothing regressed: no metric of the gate went beyond its threshold.");
  assert.deepEqual(answer.evidence, ["home: LCP unchanged"]);
});

test("with an inconclusive metric, the rules do not say that nothing went beyond its threshold, and say to run the gate again", () => {
  const answer = rulesAnswer(gateWith({ LCP: { baseline: 784, candidate: 1200, deltaPercent: 53.1, threshold: 100, p: 0.0754, verdict: "inconclusive" } }));
  assert.doesNotMatch(answer.suspected_cause, /no metric of the gate went beyond its threshold/);
  assert.match(answer.suspected_cause, /LCP in home/);
  assert.match(answer.suspected_cause, /inconclusive/);
  assert.match(answer.suspected_cause, /run the gate again/i);
  assert.ok(answer.suspected_cause.length <= 300);
  assert.deepEqual(answer.evidence, ["home: LCP inconclusive"]);
});
