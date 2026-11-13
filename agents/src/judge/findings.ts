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
  // workshop: step 4, the facts of the LCP subagent for a regressed LCP (test/judge/findings.test.ts)
  throw new Error("Step 4 of the workshop: the facts of the LCP subagent for a regressed LCP. Its tests: test/judge/findings.test.ts");
  // workshop: end
}

function clsFacts(found: Found, scenario: string): string[] {
  // workshop: step 4, the facts of the CLS subagent for a regressed CLS (test/judge/findings.test.ts)
  throw new Error("Step 4 of the workshop: the facts of the CLS subagent for a regressed CLS. Its tests: test/judge/findings.test.ts");
  // workshop: end
}

// A script of the long frames, the same on both sides: the origin of the shop and the hash of its
// bundle change from one side to the other
const scriptKey = ({ invoker, source }: { invoker: string; source: string }) =>
  /^https?:\/\//.test(invoker) ? codeKey(invoker) : `${invoker}|${source.replace(/-[\w-]{8}(\.js)$/, "$1")}`;

function inpFacts(found: Found, scenario: string): string[] {
  // workshop: step 4, the facts of the LoAF/INP subagent for a regressed INP (test/judge/findings.test.ts)
  throw new Error("Step 4 of the workshop: the facts of the LoAF/INP subagent for a regressed INP. Its tests: test/judge/findings.test.ts");
  // workshop: end
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
