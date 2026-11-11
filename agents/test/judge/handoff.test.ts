// The handoff of the Judge: the same input that the local LLM gets, for an external agent, in JSON
// for a script and in Markdown to paste into a chat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handoffOf, handoffMarkdown } from "../../src/judge/handoff.ts";
import { requestsFor, SCHEMA, SYSTEM } from "../../src/judge/prompt.ts";
import type { JudgeInput } from "../../src/judge/types.ts";

const tasks = (...rows: string[]) =>
  ["mode: bottom-up", `tasks[${rows.length}]{durationMs,selfTimeMs,functionName,url,lineNumber,columnNumber}:`, ...rows.map((r) => `  ${r}`)].join("\n");

const REGRESSED: JudgeInput = {
  branch: "pr/loaf-cart-handler",
  gate: {
    verdict: "fail",
    scenarios: [
      { scenario: "home", metrics: { LCP: { baseline: 656, candidate: 972, deltaPercent: 48.2, threshold: 100, verdict: "regressed" } } },
      { scenario: "add-to-cart", metrics: { INP: { baseline: 48, candidate: 120, deltaPercent: 150, threshold: 50, verdict: "regressed" } } },
    ],
  },
  diff: "+++ b/apps/shop/src/pages.tsx\n+    setRecommended(recommendFor(product.slug));",
  traces: {
    "add-to-cart": {
      baseline: { tasks: tasks() },
      candidate: { tasks: tasks('83.86,79.99,recommendFor,"http://shop-candidate:3000/assets/index-BsVNkX21.js",8,69676') },
    },
  },
};

const PASSING: JudgeInput = {
  branch: "pr/noop-refactor",
  gate: { verdict: "pass", scenarios: [{ scenario: "home", metrics: { LCP: { baseline: 656, candidate: 648, deltaPercent: -1.2, threshold: 100, verdict: "unchanged" } } }] },
  diff: "",
  traces: {},
};

test("carries the same system prompt, requests and schema as the local LLM", () => {
  const handoff = handoffOf(REGRESSED);
  assert.equal(handoff.verdict, "fail");
  assert.equal(handoff.system, SYSTEM);
  assert.deepEqual(handoff.schema, SCHEMA);
  assert.deepEqual(
    handoff.requests,
    requestsFor(REGRESSED).map(({ target, messages }) => ({ metric: target.metric, scenario: target.scenario, prompt: messages[1].content })),
  );
  assert.deepEqual(handoff.requests.map((r) => r.metric), ["LCP", "INP"]);
});

test("says that sending the diff out is a decision of each team", () => {
  assert.match(handoffOf(REGRESSED).privacy, /diff/);
  assert.match(handoffMarkdown(handoffOf(REGRESSED)), /decision of each team/);
});

test("has no requests and gives the answer of the rules when nothing regressed", () => {
  const handoff = handoffOf(PASSING);
  assert.deepEqual(handoff.requests, []);
  assert.equal(handoff.rulesAnswer?.metric, "none");
  assert.match(handoffMarkdown(handoff), /Nothing to explain/);
});

test("the Markdown has the system prompt, each request and the schema, in that order", () => {
  const md = handoffMarkdown(handoffOf(REGRESSED));
  const system = md.indexOf(SYSTEM);
  const lcp = md.indexOf("## Request 1: LCP in home");
  const inp = md.indexOf("## Request 2: INP in add-to-cart");
  const schema = md.indexOf('"title": "Judge explanation"');
  assert.ok(system > 0 && system < lcp && lcp < inp && inp < schema, `${system} ${lcp} ${inp} ${schema}`);
  assert.ok(md.includes(handoffOf(REGRESSED).requests[1].prompt));
});

test("is the same file for the same input", () => {
  assert.equal(handoffMarkdown(handoffOf(REGRESSED)), handoffMarkdown(handoffOf(REGRESSED)));
});
