// What the rules decide before the LLM explains anything: which metrics regressed, and in which
// order. A branch can regress several metrics for different reasons, so the Judge asks for one
// explanation per metric. The order compares each regression with its threshold, the same measure
// the gate uses to call it a regression; a percentage would not work for CLS, whose baseline is 0.
import type { Inconclusive, Scenario, Target } from "./types.ts";

const round = (value: number) => Math.round(value * 100) / 100;

export function regressedMetrics(scenarios: Scenario[]): Target[] {
  const worst = new Map<string, Target>();
  for (const { scenario, metrics } of scenarios) {
    for (const [metric, m] of Object.entries(metrics)) {
      if (m.verdict !== "regressed") continue;
      const ratio = round((m.candidate - m.baseline) / m.threshold);
      if (!worst.has(metric) || ratio > worst.get(metric)!.ratio) worst.set(metric, { metric, scenario, ratio });
    }
  }
  return [...worst.values()].sort((a, b) => b.ratio - a.ratio);
}

// The metrics whose change beat their threshold without the evidence of the runs, in the order of the
// scenarios. The gate does not fail on them and the Judge does not explain them: the report says them,
// with what to do. Every metric is better lower, so a positive change is worse.
export function inconclusiveMetrics(scenarios: Scenario[]): Inconclusive[] {
  return scenarios.flatMap(({ scenario, metrics }) =>
    Object.entries(metrics)
      .filter(([, m]) => m.verdict === "inconclusive")
      .map(([metric, m]) => ({ metric, scenario, ...m, worse: m.candidate > m.baseline })),
  );
}
