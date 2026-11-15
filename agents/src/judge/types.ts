// What the Judge gets: the verdict and the metrics of the gate, the diff of the branch and the
// trace summaries of trace-engine-cli, and what the rules find in them before the LLM explains.

export type MetricName = "LCP" | "CLS" | "INP";

export interface MetricResult {
  baseline: number;
  candidate: number;
  deltaPercent: number | null;
  threshold: number;
  p?: number;
  // regressed, improved, unchanged, inconclusive (over its threshold without the evidence of the
  // runs) or not measured, as the CLI decides it
  verdict: string;
}

// A metric whose change beat its threshold while the runs do not back it (p not under 0.05): neither a
// regression nor its absence. worse when it changed for the worse.
export interface Inconclusive extends MetricResult {
  metric: string;
  scenario: string;
  worse: boolean;
}

// The runs a side that the CLI measured in a scenario, and when it measured more than the gate asks
// for: after how many runs, and for which metrics inconclusive for the worse
export interface ScenarioRuns {
  scenario: string;
  runs: number;
  extended?: { after: number; metrics: string[] };
}

export interface Scenario {
  scenario: string;
  exitCode?: number;
  metrics: Record<string, MetricResult>;
}

export interface Gate {
  verdict: "pass" | "fail";
  scenarios: Scenario[];
}

// TOON summaries of trace-engine-cli by scenario, side (baseline, candidate) and command
export type TraceSummaries = Record<string, Record<string, Record<string, string>>>;

export interface JudgeInput {
  branch: string;
  gate: Gate;
  diff: string;
  traces: TraceSummaries;
}

// A metric that the rules decided to explain, in the scenario where it regressed the most
export interface Target {
  metric: string;
  scenario: string;
  ratio: number;
}

export interface TaskSuspect {
  kind: "function" | "script";
  name: string;
  url: string;
  line: number;
  selfTimeMs: number;
  baselineSelfTimeMs: number;
}

export interface ShiftSuspect {
  kind: "layout-shift";
  name: string;
  score: number;
  nodes: number;
}

export type Suspect = TaskSuspect | ShiftSuspect;

// A suspect related to the added line of the diff that brings it
export interface Match {
  suspect: TaskSuspect;
  file: string;
  line: string;
}

export interface Explanation {
  verdict: "pass" | "fail";
  metric: MetricName | "none";
  suspected_cause: string;
  evidence: string[];
  confidence: "low" | "medium" | "high";
}
