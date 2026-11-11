// The findings of the subagents for each metric the rules decided to explain: facts picked by code
// from what the LCP, CLS and LoAF/INP subagents measured on both sides, next to the explanation of
// the LLM, which does not see them. The inputs are real results of the subagents: LCP on
// pr/lcp-hero-lazy and CLS on pr/cls-promo-banner (from their fixtures), LoAF/INP on
// pr/loaf-cart-handler (whole reports of a run of the orchestrator).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findingsFor } from "../../src/judge/findings.ts";
import { clsJourneyOf } from "../../src/subagents/cls.ts";
import { lcpReportOf } from "../../src/subagents/lcp.ts";
import { CONDITIONS } from "../../src/subagents/subagent.ts";

const fixture = (path: string) => JSON.parse(readFileSync(new URL(`../fixtures/${path}.json`, import.meta.url), "utf8"));

const lcp = {
  baseline: lcpReportOf(fixture("lcp/workflow-baseline"), fixture("lcp/subparts-baseline")),
  candidate: lcpReportOf(fixture("lcp/workflow-candidate"), fixture("lcp/subparts-candidate")),
};
const cls = {
  baseline: { conditions: CONDITIONS, journeys: [clsJourneyOf("home", fixture("cls/home-baseline"))] },
  candidate: { conditions: CONDITIONS, journeys: [clsJourneyOf("home", fixture("cls/home-candidate"))] },
};
const loaf = { baseline: fixture("findings/loaf-baseline"), candidate: fixture("findings/loaf-candidate") };

const target = (metric: string, scenario: string) => ({ metric, scenario, ratio: 1 });

test("LCP: the value, the phase that grows the most and what changes in the LCP image", () => {
  assert.deepEqual(findingsFor([target("LCP", "home")], { lcp }), [
    {
      metric: "LCP",
      scenario: "home",
      subagent: "lcp",
      facts: [
        "LCP of the home: 760 ms in the baseline, 1168 ms in the branch (median of 3 runs)",
        "The phase that grows the most is resourceLoadDelay: 188 ms to 741 ms",
        "The LCP image changes: loading (not set) to lazy, fetchpriority high to (not set), preload removed",
        "New warnings of the LCP image: lcp-no-fetchpriority, lcp-lazy, lcp-not-preloaded",
      ],
    },
  ]);
});

test("CLS: the value of the journey and the nodes that move only in the branch", () => {
  assert.deepEqual(findingsFor([target("CLS", "home")], { cls }), [
    {
      metric: "CLS",
      scenario: "home",
      subagent: "cls",
      facts: [
        "CLS of the journey home: 0 in the baseline, 0.053 in the branch (median of 3 runs)",
        "Nodes that move in the branch and not in the baseline: main.main, " +
          "section.section:nth-of-type(2) > div.grid > article.card:nth-of-type(1) > a.card__link > h3.card__name, " +
          "section.section:nth-of-type(2) > div.grid > article.card:nth-of-type(2) > a.card__link > h3.card__name",
      ],
    },
  ]);
});

test("INP: the value, the phase that grows the most, the scripts only the branch runs and the function of the trace", () => {
  assert.deepEqual(findingsFor([target("INP", "add-to-cart")], { loaf }), [
    {
      metric: "INP",
      scenario: "add-to-cart",
      subagent: "loaf",
      facts: [
        "INP of the journey add-to-cart: 32 ms in the baseline, 200 ms in the branch (click → button.button)",
        "The phase that grows the most is processingTime: 13 ms to 170 ms",
        "Scripts of the long frames that only the branch runs: DIV#root.onclick in index-BsVNkX21.js, 167 ms; http://thirdparty:4000/ab.js?cpu=150, 154 ms",
        "The trace of the click names the function recommendFor (/assets/index.js, line 8): 155 ms of self time in the branch, 0 ms in the baseline",
      ],
    },
  ]);
});

test("one finding per metric, in the order of the rules, and none for a subagent that did not run", () => {
  const findings = findingsFor([target("INP", "add-to-cart"), target("LCP", "home"), target("CLS", "home")], { loaf, lcp });
  assert.deepEqual(findings.map((f) => f.metric), ["INP", "LCP"]);
});

test("the LCP subagent measures the home, so an LCP that regresses on another page has no findings", () => {
  assert.deepEqual(findingsFor([target("LCP", "add-to-cart")], { lcp }), []);
});
