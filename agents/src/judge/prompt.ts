// The prompt of the Judge. The rules have decided the verdict and which metric to explain; the
// model explains the cause of that one metric. A branch that regresses several metrics gets one
// prompt per metric.
import type { Explanation, JudgeInput, Match, MetricResult, Suspect, Target } from "./types.ts";

export const SYSTEM = `You are the Judge of a web performance gate for pull requests.
The rules have already decided the verdict and the metric to explain: repeat both, never change them.
Your job is to explain the regression of that metric:
- suspected_cause: the change of the diff that most likely caused the regression of that metric, in one sentence. When the metric is "none", say that nothing regressed.
  The rules also list the suspects they found by comparing the traces of the candidate with those of the baseline. When there are suspects, the cause is usually one of them: name it and the line of the diff that adds it. When there are none, find the cause in the diff.
  When the rules give the cause they found, with its line of the diff, explain that cause: do not look for another one.
- evidence: up to three facts from the input that support the cause, such as a line of the diff, a function or a script of a trace summary, or a metric.
- confidence: low, medium or high.
Base everything on the input. Do not invent files, functions or numbers.`;

const formatMetric = (name: string, m: MetricResult) => {
  const unit = name === "CLS" ? "" : " ms";
  const change = m.deltaPercent == null ? "" : `, ${m.deltaPercent > 0 ? "+" : ""}${m.deltaPercent}%`;
  return `${name} ${m.baseline}${unit} -> ${m.candidate}${unit} (${m.verdict}${change})`;
};

const formatSuspect = (s: Suspect) =>
  s.kind === "layout-shift"
    ? `- ${s.name}: cumulative score ${s.score}, ${s.nodes} shifted nodes`
    : `- ${s.kind} ${s.name}${s.kind === "function" ? ` (${s.url}, line ${s.line})` : ""}: ${s.selfTimeMs} ms of self time in the candidate, ${s.baselineSelfTimeMs} ms in the baseline`;

const formatMatch = ({ suspect, file, line }: Match) =>
  `Cause found by the rules: the ${suspect.kind} ${suspect.name}, ${suspect.selfTimeMs} ms of self time in the candidate and ${suspect.baselineSelfTimeMs} ms in the baseline, added in ${file} by the line: ${line}`;

// target: { metric, scenario } of the rules, or null when nothing regressed
// suspects: what the rules found by comparing the traces (suspects.ts), or undefined to leave them out
// matches: the suspects the rules related to a line of the diff (match.ts), or undefined
export function userPrompt(input: JudgeInput, target: Target | null, suspects?: Suspect[], matches?: Match[]): string {
  const lines = [
    `Branch: ${input.branch}`,
    `Verdict of the rules: ${input.gate.verdict}`,
    target
      ? `Metric to explain, decided by the rules: ${target.metric}, which regressed in the scenario ${target.scenario}`
      : "Metric to explain, decided by the rules: none, nothing regressed",
    ...(suspects === undefined
      ? []
      : ["Suspects found by the rules:", ...(suspects.length ? suspects.map(formatSuspect) : ["- none in the traces"])]),
    ...(matches?.length ? matches.map(formatMatch) : []),
    "",
    "Metrics of the gate (baseline = main, candidate = the branch):",
    ...input.gate.scenarios.map(
      (s) => `- ${s.scenario}: ${Object.entries(s.metrics).map(([name, m]) => formatMetric(name, m)).join("; ")}`,
    ),
    "",
    "Diff of the branch:",
    input.diff || "(empty)",
    "",
    "Trace summaries of trace-engine-cli:",
  ];
  for (const [scenario, sides] of Object.entries(input.traces)) {
    for (const [side, summaries] of Object.entries(sides)) {
      for (const [name, text] of Object.entries(summaries)) lines.push(`### ${scenario}, ${side}, ${name}`, text);
    }
  }
  return lines.join("\n");
}

// What the Judge returns without asking the LLM, when nothing regressed: there is nothing to
// explain, and a question would only give a model the chance to invent a regression
export function rulesAnswer(input: JudgeInput): Explanation {
  return {
    verdict: input.gate.verdict,
    metric: "none",
    suspected_cause: "Nothing regressed: no metric of the gate went beyond its threshold.",
    evidence: input.gate.scenarios.map((s) => `${s.scenario}: ${Object.entries(s.metrics).map(([name, m]) => `${name} ${m.verdict}`).join(", ")}`).slice(0, 3),
    confidence: "high",
  };
}
