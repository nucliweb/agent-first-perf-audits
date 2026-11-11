// The explanation step of the Judge: the rules decide the verdict and which metrics to explain,
// and the LLM only explains each one. A fake LLM with scripted answers checks what the Judge does
// with them; the last test asks the real model, when there is one, on the inputs of a real branch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { explain, ollama, type Chat } from "../../src/subagents/judge.ts";
import type { JudgeInput } from "../../src/judge/types.ts";

const tasks = (...rows: string[]) =>
  ["mode: bottom-up", `tasks[${rows.length}]{durationMs,selfTimeMs,functionName,url,lineNumber,columnNumber}:`, ...rows.map((r) => `  ${r}`)].join("\n");

const metric = (baseline: number, candidate: number, threshold: number, verdict: string) => ({
  baseline,
  candidate,
  threshold,
  verdict,
  deltaPercent: Math.round(((candidate - baseline) / baseline) * 1000) / 10,
});

// A branch that regresses the LCP of the home by a script and the INP of add to cart by a function
const REGRESSED: JudgeInput = {
  branch: "pr/two-regressions",
  gate: {
    verdict: "fail",
    scenarios: [
      { scenario: "home", metrics: { LCP: metric(656, 972, 100, "regressed") } },
      { scenario: "add-to-cart", metrics: { INP: metric(48, 120, 50, "regressed") } },
    ],
  },
  diff: [
    "+++ b/apps/shop/index.html",
    '+<script src="__THIRDPARTY_ORIGIN__/ab.js?cpu=150"></script>',
    "+++ b/apps/shop/src/pages.tsx",
    "+    setRecommended(recommendFor(product.slug));",
  ].join("\n"),
  traces: {
    home: {
      baseline: { tasks: tasks() },
      candidate: { tasks: tasks('151.2,151.0,ProfileCall,"http://thirdparty:4000/ab.js?cpu=150",0,1') },
    },
    "add-to-cart": {
      baseline: { tasks: tasks() },
      candidate: { tasks: tasks('83.86,79.99,recommendFor,"http://shop-candidate:3000/assets/index-BsVNkX21.js",8,69676') },
    },
  },
};

const PASSING: JudgeInput = {
  branch: "pr/refactor",
  gate: { verdict: "pass", scenarios: [{ scenario: "home", metrics: { LCP: metric(656, 660, 100, "unchanged") } }] },
  diff: "+++ b/apps/shop/src/hero.tsx\n+export function Hero() {}",
  traces: {},
};

const answer = (fields: Record<string, unknown>) =>
  JSON.stringify({ verdict: "fail", metric: "LCP", suspected_cause: "A cause.", evidence: ["A fact."], confidence: "high", ...fields });

// Answers each call with the next scripted answer, and keeps the messages it got
function scripted(...answers: string[]) {
  const calls: { system: string; user: string }[] = [];
  const chat: Chat = async (messages) => {
    calls.push({ system: messages[0].content, user: messages[1].content });
    return answers[calls.length - 1];
  };
  return { chat, calls };
}

test("answers from the rules, without asking the LLM, when nothing regressed", async () => {
  const { chat, calls } = scripted();
  const report = await explain(PASSING, chat);
  assert.equal(calls.length, 0);
  assert.equal(report.verdict, "pass");
  assert.equal(report.explanations.length, 1);
  assert.equal(report.explanations[0].source, "rules");
  assert.equal(report.explanations[0].answer?.metric, "none");
});

test("asks the LLM once per regressed metric, the one furthest beyond its threshold first", async () => {
  const { chat, calls } = scripted(
    answer({ metric: "LCP", suspected_cause: "The script ab.js blocks the render." }),
    answer({ metric: "INP", suspected_cause: "recommendFor runs in the click handler." }),
  );
  const report = await explain(REGRESSED, chat);
  assert.deepEqual(
    report.explanations.map((e) => [e.metric, e.scenario, e.source]),
    [
      ["LCP", "home", "llm"],
      ["INP", "add-to-cart", "llm"],
    ],
  );
  assert.equal(report.explanations[1].answer?.suspected_cause, "recommendFor runs in the click handler.");
  // The rules give the model the cause they matched with the diff
  assert.match(calls[0].user, /Cause found by the rules: the script http:\/\/thirdparty:4000\/ab\.js\?cpu=150/);
  assert.match(calls[1].user, /Cause found by the rules: the function recommendFor/);
});

test("keeps the verdict and the metric of the rules when the LLM contradicts them, and marks it", async () => {
  const { chat } = scripted(answer({ verdict: "pass", metric: "CLS" }), answer({ metric: "INP" }));
  const [lcp] = (await explain(REGRESSED, chat)).explanations;
  assert.equal(lcp.answer?.verdict, "fail");
  assert.equal(lcp.answer?.metric, "LCP");
  assert.deepEqual(lcp.discrepancies, [
    { field: "verdict", llm: "pass", rules: "fail" },
    { field: "metric", llm: "CLS", rules: "LCP" },
  ]);
});

test("reports an answer that is not valid JSON or breaks the schema as an error, without an explanation", async () => {
  const { chat } = scripted("not json", answer({ metric: "INP", evidence: [] }));
  const [lcp, inp] = (await explain(REGRESSED, chat)).explanations;
  assert.equal(lcp.answer, null);
  assert.match(lcp.error ?? "", /JSON/);
  assert.equal(inp.answer, null);
  assert.match(inp.error ?? "", /schema/);
});

test("reports a failed call to the LLM as an error, and keeps the verdict of the rules", async () => {
  const report = await explain(REGRESSED, async () => {
    throw new Error("connect ECONNREFUSED");
  });
  assert.equal(report.verdict, "fail");
  assert.deepEqual(
    report.explanations.map((e) => e.error),
    ["connect ECONNREFUSED", "connect ECONNREFUSED"],
  );
});

// The fixture of experiments/models, with the real gate, diff and traces of the branch. It runs where
// the repo and a model are at hand, such as OLLAMA_URL=http://127.0.0.1:11434 on the host.
const FIXTURE = new URL("../../../experiments/models/fixtures/pr-loaf-cart-handler.json", import.meta.url);
const OLLAMA_URL = process.env.OLLAMA_URL;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";
const profiles = (process.env.COMPOSE_PROFILES ?? "llm").split(",");
const skipReal = !OLLAMA_URL || !profiles.includes("llm") ? "needs OLLAMA_URL and the llm profile" : !existsSync(FIXTURE) ? "needs experiments/models" : false;

test("the model names the cause of each regression of pr/loaf-cart-handler", { skip: skipReal, timeout: 300_000 }, async () => {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const report = await explain(fixture.input, ollama(OLLAMA_URL!, OLLAMA_MODEL));
  assert.deepEqual(report.explanations.map((e) => e.metric), ["LCP", "INP"]);
  for (const e of report.explanations) {
    assert.equal(e.error, undefined, `${e.metric}: ${e.error}`);
    assert.deepEqual(e.discrepancies, [], `${e.metric}`);
    assert.match(e.answer!.suspected_cause, new RegExp(fixture.expected[e.metric], "i"), `${e.metric}`);
  }
});
