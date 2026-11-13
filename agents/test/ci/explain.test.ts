// The explanation of a measured run of ci with another model: it reads the input of the Judge and
// the report from the folder of the run, and writes a second report with the same verdict, metrics
// and facts of the rules, and the explanation of that model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { explainRun } from "../../src/ci/explain.ts";
import type { Report } from "../../src/ci/report.ts";
import type { JudgeInput } from "../../src/judge/types.ts";

const input: JudgeInput = {
  branch: "pr/lcp-hero-lazy",
  gate: { verdict: "fail", scenarios: [{ scenario: "home", metrics: { LCP: { baseline: 664, candidate: 1072, deltaPercent: 61.4, threshold: 100, p: 0.006, verdict: "regressed" } } }] },
  diff: '+++ b/apps/shop/src/pages.tsx\n+          loading="lazy"',
  traces: {},
};

const report: Report = {
  branch: "pr/lcp-hero-lazy",
  baseline: "main",
  profile: "lite",
  conditions: "--cpu 4 --network fast-4g --runs 5",
  verdict: "fail",
  gate: input.gate,
  explanations: null,
  ruleFacts: [{ metric: "LCP", scenario: "home", facts: ['apps/shop/src/pages.tsx adds: loading="lazy"'] }],
};

const answer = { verdict: "fail", metric: "LCP", suspected_cause: 'The hero image gets loading="lazy".', evidence: ['pages.tsx adds loading="lazy"'], confidence: "high" };

test("writes a report with the explanation of the other model and keeps the verdict and the facts of the rules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "explain-"));
  await writeFile(join(dir, "input.json"), JSON.stringify(input));
  await writeFile(join(dir, "report.json"), JSON.stringify(report));
  const asked: string[] = [];
  const out = await explainRun(dir, "claude-sonnet-5-5", async (messages) => {
    asked.push(messages[1].content);
    return JSON.stringify(answer);
  });
  assert.equal(asked.length, 1, "one request per regressed metric");
  assert.equal(out.verdict, "fail");
  assert.equal(out.explainedBy, "claude-sonnet-5-5");
  assert.equal(out.explanations?.[0].answer?.suspected_cause, answer.suspected_cause);
  const md = await readFile(join(dir, "report-claude-sonnet-5-5.md"), "utf8");
  assert.match(md, /Model: claude-sonnet-5-5\./);
  assert.match(md, /The hero image gets loading="lazy"\./);
  assert.match(md, /## Facts of the rules/);
  assert.deepEqual(JSON.parse(await readFile(join(dir, "report-claude-sonnet-5-5.json"), "utf8")).explainedBy, "claude-sonnet-5-5");
});
