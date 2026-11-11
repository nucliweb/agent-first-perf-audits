// The requests of the Judge. A small model that copies loading="lazy" from the diff into the JSON
// constrained by the schema closes the string at the first quote, and the sentence ends in
// "loading=". With the quotes escaped in the input, it copies a form that is valid inside a string.
import { test } from "node:test";
import assert from "node:assert/strict";
import { requestsFor } from "../../src/judge/prompt.ts";
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
