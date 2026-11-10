// What the rules decide before the LLM explains anything: which metrics regressed, and in which
// order. A branch can regress several metrics for different reasons, so the Judge asks for one
// explanation per metric. The order compares each regression with its threshold, the same measure
// the gate uses to call it a regression; a percentage would not work for CLS, whose baseline is 0.

const round = (value) => Math.round(value * 100) / 100;

export function regressedMetrics(scenarios) {
  const worst = new Map();
  for (const { scenario, metrics } of scenarios) {
    for (const [metric, m] of Object.entries(metrics)) {
      if (m.verdict !== "regressed") continue;
      const ratio = round((m.candidate - m.baseline) / m.threshold);
      if (!worst.has(metric) || ratio > worst.get(metric).ratio) worst.set(metric, { metric, scenario, ratio });
    }
  }
  return [...worst.values()].sort((a, b) => b.ratio - a.ratio);
}
