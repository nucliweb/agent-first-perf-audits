// What the Judge gets: the verdict and the metrics of the gate, the diff of the branch and the
// trace summaries of trace-engine-cli, and what the rules find in them before the LLM explains.

export type MetricName = "LCP" | "CLS" | "INP";

export interface MetricResult {
  baseline: number;
  candidate: number;
  deltaPercent: number | null;
  threshold: number;
  p?: number;
  verdict: string;
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
