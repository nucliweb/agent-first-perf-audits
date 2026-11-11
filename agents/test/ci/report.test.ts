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

// The schema bounds the length of each text, and the grammar of the model stops it there
test("marks a text that reached the limit of the schema as cut", () => {
  const cut = "x".repeat(199) + "y";
  const md = reportMarkdown({
    ...base,
    explanations: [{ ...base.explanations![0], answer: { ...base.explanations![0].answer!, evidence: [cut, "A short fact."] } }],
  });
  assert.ok(md.includes(`- ${cut}…`));
  assert.ok(md.includes("- A short fact.\n"));
  assert.ok(reportHtml({ ...base, explanations: [{ ...base.explanations![0], answer: { ...base.explanations![0].answer!, evidence: [cut] } }] }).includes(`${cut}…</li>`));
});

// A real evidence of the benchmark (experiments/models, rules stage) fits the limit exactly
test("does not mark a complete sentence that fits the limit exactly", () => {
  const complete = "x".repeat(198) + "y.";
  const md = reportMarkdown({
    ...base,
    explanations: [{ ...base.explanations![0], answer: { ...base.explanations![0].answer!, evidence: [complete] } }],
  });
  assert.ok(md.includes(`- ${complete}\n`));
});

// The orchestrator adds the findings of the subagents; ci has none
const findings = [
  {
    metric: "LCP",
    scenario: "home",
    subagent: "lcp",
    facts: ["LCP of the home: 760 ms in the baseline, 1168 ms in the branch (median of 3 runs)", 'The LCP image changes: loading (not set) to lazy, preload removed'],
  },
];

test("adds the findings of the subagents after the explanation, picked by the rules and not by the LLM", () => {
  const md = reportMarkdown({ ...base, findings });
  const section = md.slice(md.indexOf("## Findings of the subagents"));
  assert.ok(md.indexOf("## Explanation") < md.indexOf("## Findings of the subagents"), md);
  assert.match(section, /Facts that the rules pick from what the subagents measured; the LLM does not see them\./);
  assert.match(section, /### LCP in home, from the lcp subagent\n\n- LCP of the home: 760 ms in the baseline, 1168 ms in the branch \(median of 3 runs\)\n- The LCP image changes/);
  const html = reportHtml({ ...base, findings });
  assert.match(html, /<h2>Findings of the subagents<\/h2>/);
  assert.match(html, /<li>The LCP image changes: loading \(not set\) to lazy, preload removed<\/li>/);
});

test("the lite profile shows the findings too, though it has no explanation", () => {
  assert.match(reportMarkdown({ ...base, profile: "lite", explanations: null, findings }), /### LCP in home, from the lcp subagent/);
});

test("without findings, as in ci, there is no section for them", () => {
  assert.doesNotMatch(reportMarkdown(base), /Findings of the subagents/);
  assert.doesNotMatch(reportHtml(base), /Findings of the subagents/);
});
