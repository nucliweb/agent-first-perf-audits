// The report of the ci service: the verdict of the rules, the metrics of each scenario and the
// explanation of each regressed metric, in Markdown and in HTML.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reportHtml, reportMarkdown, type Report } from "../../src/ci/report.ts";

const base: Report = {
  branch: "pr/lcp-hero-lazy",
  baseline: "main",
  profile: "llm",
  conditions: "--cpu 4 --network fast-4g --runs 5, chromium 153.0.8010.12",
  verdict: "fail",
  gate: {
    verdict: "fail",
    scenarios: [
      {
        scenario: "home",
        exitCode: 1,
        metrics: {
          LCP: { baseline: 652, candidate: 1056.4, deltaPercent: 62, threshold: 100, p: 0.0055, verdict: "regressed" },
          CLS: { baseline: 0, candidate: 0.0004, deltaPercent: null, threshold: 0.05, p: 1, verdict: "unchanged" },
        },
      },
    ],
  },
  explanations: [
    {
      metric: "LCP",
      scenario: "home",
      source: "llm",
      answer: {
        verdict: "fail",
        metric: "LCP",
        suspected_cause: 'The hero image lost its preload and got loading="lazy".',
        evidence: ["LCP 652 ms -> 1056 ms", "<img loading=\"lazy\">"],
        confidence: "high",
      },
      discrepancies: [{ field: "metric", llm: "CLS", rules: "LCP" }],
    },
  ],
};

test("leads with the verdict of the rules and the metrics of each scenario", () => {
  const md = reportMarkdown(base);
  assert.match(md, /^# Performance gate: pr\/lcp-hero-lazy$/m);
  assert.match(md, /\*\*fail\*\*/);
  assert.match(md, /\| home \| LCP \| 652 ms \| 1056 ms \| \+62 % \| 0\.0055 \| regressed \|/);
  assert.match(md, /\| home \| CLS \| 0\.000 \| 0\.000 \| {2}\| 1 \| unchanged \|/);
});

test("explains each regressed metric, with its evidence and the discrepancies with the rules", () => {
  const md = reportMarkdown(base);
  assert.match(md, /^### LCP in home$/m);
  assert.match(md, /The hero image lost its preload and got loading="lazy"\./);
  assert.match(md, /^- LCP 652 ms -> 1056 ms$/m);
  assert.match(md, /The LLM said CLS for the metric; the rules decided LCP/);
});

test("in the lite profile, points to the handoff instead of an explanation", () => {
  const md = reportMarkdown({ ...base, profile: "lite", explanations: null });
  assert.match(md, /lite profile/);
  assert.match(md, /handoff\.md/);
  assert.match(md, /handoff\.json/);
});

test("reports an explanation that failed without hiding the verdict", () => {
  const md = reportMarkdown({
    ...base,
    explanations: [{ metric: "LCP", scenario: "home", source: "llm", answer: null, discrepancies: [], error: "connect ECONNREFUSED" }],
  });
  assert.match(md, /\*\*fail\*\*/);
  assert.match(md, /No explanation: connect ECONNREFUSED/);
});

test("the HTML escapes what comes from the branch and the model", () => {
  const html = reportHtml(base);
  assert.match(html, /<title>Performance gate: pr\/lcp-hero-lazy<\/title>/);
  assert.ok(html.includes("&lt;img loading=&quot;lazy&quot;&gt;"));
  assert.ok(!html.includes('<img loading="lazy">'));
});
