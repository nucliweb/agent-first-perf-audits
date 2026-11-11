// The findings of the subagents for each metric the rules decided to explain: facts that code picks
// from what the LCP, CLS and LoAF/INP subagents measured on the baseline and on the branch. They go
// into the report next to the explanation of the LLM, which does not see them, so the prompt and
// the figures of the model benchmark stay as they are.
//   LCP: the subagent measures the home, so only an LCP that regresses on the home
//   CLS and INP: the journey of the Navigator with the name of the scenario of the gate
import type { ClsReport } from "../subagents/cls.ts";
import type { LcpReport } from "../subagents/lcp.ts";
import type { LoafReport } from "../subagents/loaf.ts";
import type { Side } from "../subagents/subagent.ts";
import { codeKey, suspectsFor } from "./suspects.ts";
import type { Target } from "./types.ts";

export interface Finding {
  metric: string;
  scenario: string;
  subagent: string;
  facts: string[];
}

// What each subagent found, by name and side, as the orchestrator collects it
export type Found = Record<string, Partial<Record<Side, unknown>> | undefined>;

const bothSides = <T>(found: Found, name: string) => {
  const sides = found[name] as Partial<Record<Side, T>> | undefined;
  return sides?.baseline && sides?.candidate ? { baseline: sides.baseline, candidate: sides.candidate } : null;
};

// The phase with the largest growth from the baseline to the branch
function grownPhase(baseline: Record<string, number>, candidate: Record<string, number>, unit: string) {
  const [phase] = Object.keys(candidate).sort((a, b) => candidate[b] - baseline[b] - (candidate[a] - baseline[a]));
  return `The phase that grows the most is ${phase}: ${baseline[phase]}${unit} to ${candidate[phase]}${unit}`;
}

function lcpFacts(found: Found, scenario: string): string[] {
  const lcp = bothSides<LcpReport>(found, "lcp");
  if (!lcp || scenario !== "home") return [];
  const { baseline: b, candidate: c } = lcp;
  const facts = [
    `LCP of the home: ${b.lcp.value} ms in the baseline, ${c.lcp.value} ms in the branch (median of ${c.conditions.runs} runs)`,
    grownPhase(b.subparts, c.subparts, " ms"),
  ];
  if (b.element.selector !== c.element.selector) facts.push(`The LCP element changes: ${b.element.selector} to ${c.element.selector}`);
  if (b.image && c.image) {
    const changes = (["loading", "fetchpriority", "decoding"] as const)
      .filter((attribute) => b.image![attribute] !== c.image![attribute])
      .map((attribute) => `${attribute} ${b.image![attribute]} to ${c.image![attribute]}`);
    if (b.image.preloaded !== c.image.preloaded) changes.push(c.image.preloaded ? "preload added" : "preload removed");
    if (changes.length) facts.push(`The LCP image changes: ${changes.join(", ")}`);
    const before = new Set(b.image.issues.map((i) => i.code));
    const added = c.image.issues.map((i) => i.code).filter((code) => !before.has(code));
    if (added.length) facts.push(`New warnings of the LCP image: ${added.join(", ")}`);
  }
  return facts;
}

function clsFacts(found: Found, scenario: string): string[] {
  const cls = bothSides<ClsReport>(found, "cls");
  const b = cls?.baseline.journeys.find((j) => j.name === scenario);
  const c = cls?.candidate.journeys.find((j) => j.name === scenario);
  if (!b || !c) return [];
  const facts = [`CLS of the journey ${scenario}: ${b.cls.value} in the baseline, ${c.cls.value} in the branch (median of ${cls!.candidate.conditions.runs} runs)`];
  const before = new Set(b.elements.map((e) => e.selector));
  const moved = c.elements.map((e) => e.selector).filter((selector) => !before.has(selector)).slice(0, 3);
  if (moved.length) facts.push(`Nodes that move in the branch and not in the baseline: ${moved.join(", ")}`);
  return facts;
}

// A script of the long frames, the same on both sides: the origin of the shop and the hash of its
// bundle change from one side to the other
const scriptKey = ({ invoker, source }: { invoker: string; source: string }) =>
  /^https?:\/\//.test(invoker) ? codeKey(invoker) : `${invoker}|${source.replace(/-[\w-]{8}(\.js)$/, "$1")}`;

function inpFacts(found: Found, scenario: string): string[] {
  const loaf = bothSides<LoafReport>(found, "loaf");
  const b = loaf?.baseline.journeys.find((j) => j.name === scenario);
  const c = loaf?.candidate.journeys.find((j) => j.name === scenario);
  if (!b || !c) return [];
  const facts: string[] = [];
  if (b.inp && c.inp) {
    facts.push(`INP of the journey ${scenario}: ${b.inp.value} ms in the baseline, ${c.inp.value} ms in the branch (${c.inp.event})`);
    facts.push(grownPhase(b.inp.phases, c.inp.phases, " ms"));
  }
  const before = new Set(b.longFrames.topScripts.map(scriptKey));
  const added = c.longFrames.topScripts
    .filter((s) => !before.has(scriptKey(s)))
    .map((s) => (/^https?:\/\//.test(s.invoker) ? `${s.invoker}, ${s.totalDurationMs} ms` : `${s.invoker} in ${s.source}, ${s.totalDurationMs} ms`));
  if (added.length) facts.push(`Scripts of the long frames that only the branch runs: ${added.join("; ")}`);
  if (b.trace && c.trace) {
    const traces = { [scenario]: { baseline: b.trace.summaries, candidate: c.trace.summaries } };
    for (const s of suspectsFor(traces, { metric: "INP", scenario })) {
      if (s.kind === "layout-shift") continue;
      const named = s.kind === "function" ? `the function ${s.name} (${s.url}, line ${s.line})` : `the script ${s.name}`;
      facts.push(`The trace of the click names ${named}: ${s.selfTimeMs} ms of self time in the branch, ${s.baselineSelfTimeMs} ms in the baseline`);
    }
  }
  return facts;
}

const BY_METRIC: Record<string, { subagent: string; facts: (found: Found, scenario: string) => string[] }> = {
  LCP: { subagent: "lcp", facts: lcpFacts },
  CLS: { subagent: "cls", facts: clsFacts },
  INP: { subagent: "loaf", facts: inpFacts },
};

// One finding per target of the rules, in their order, when its subagent ran on both sides
export function findingsFor(targets: Target[], found: Found): Finding[] {
  return targets.flatMap(({ metric, scenario }) => {
    const source = BY_METRIC[metric];
    const facts = source ? source.facts(found, scenario) : [];
    return facts.length ? [{ metric, scenario, subagent: source.subagent, facts }] : [];
  });
}
