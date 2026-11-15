// The gate of the workshop: the WebPerf Snippets CLI measures the candidate against the baseline in
// one call per scenario, with --fail-on-regression, and its exit code is the decision. The Judge reads
// the verdict and the metrics of each scenario from what the CLI reports.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Gate, Scenario, ScenarioRuns } from "./types.ts";

export const CONDITIONS = ["--cpu", "4", "--network", "fast-4g", "--runs", "5"];

// When a metric is inconclusive for the worse after the runs of CONDITIONS, the CLI measures both
// shops up to 7 runs each and decides once more: the policy that experiments/gate-stability chose
export const MAX_RUNS = ["--max-runs", "7"];

// The journey of add to cart, with its page and its steps: the same file the Navigator runs
const JOURNEY = fileURLToPath(new URL("../../journeys/add-to-cart.json", import.meta.url));
const journey = JSON.parse(readFileSync(JOURNEY, "utf8")) as { path: string; interactions: Array<{ action: string; selector?: string }> };
const click = journey.interactions.find((i) => i.action === "click")!.selector!;

// A trace of the Judge: of the load of the page, or of a click after the load, with the summaries
// of trace-engine-cli that explain the metrics of its scenario
export interface TraceSpec {
  name: string;
  click?: string;
  summaries: Record<string, string[]>;
}

// Each scenario of the gate: its page, the arguments of the CLI and the traces of the Judge
export interface GateScenario {
  id: string;
  path: string;
  cli: string[];
  traces: TraceSpec[];
}

export const TASKS = ["tasks", "--tree", "bottom-up", "--top", "5"];

export const SCENARIOS: GateScenario[] = [
  { id: "home", path: "/", cli: [], traces: [{ name: "load", summaries: { overview: ["overview"], shifts: ["shifts"], tasks: TASKS } }] },
  {
    id: "add-to-cart",
    path: journey.path,
    // The default workflow does not give the INP
    cli: ["--workflow", "interaction", "--interact-script", JOURNEY],
    // The CLI measures the CLS over the whole journey, load included, where the promo banner shifts
    // the page. The tasks of the load would hide the handler of the click in the bottom-up tree, so
    // the layout shifts come from a trace of the load and the tasks from a trace of the click.
    traces: [
      { name: "load", summaries: { shifts: ["shifts"] } },
      { name: "click", click, summaries: { interactions: ["interactions"], tasks: TASKS } },
    ],
  },
];

export interface CliMetric {
  baseline: number;
  current: number;
  deltaPercent: number | null;
  threshold: number;
  verdict: string;
  stats?: { p?: number };
}

// What the gate gives for one scenario of the candidate: the exit code of the CLI, its metrics and
// the runs it measured on each side
export interface ScenarioResult {
  scenario: string;
  exitCode: number;
  metrics: Record<string, CliMetric>;
  runs?: number;
  // When the CLI measured more runs: after how many runs a side, and for which metrics
  extended?: ScenarioRuns["extended"];
}

function run(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((ok, fail) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", fail);
    child.on("close", (code) => ok({ code: code ?? 1, stdout, stderr }));
  });
}

// The arguments of the CLI for the gate of one scenario: the page of the candidate against the page of
// the baseline, measured in the same call with their runs alternating (a live baseline), so a machine
// that changes speed during the measurement moves both sides alike
export function gateArgs(urls: { baseline: string; candidate: string }, scenario: GateScenario, conditions = CONDITIONS): string[] {
  return [urls.candidate, ...scenario.cli, ...conditions, ...MAX_RUNS, "--baseline", urls.baseline, "--fail-on-regression", "--json"];
}

// The gate of one scenario with the CLI at cli: it exits with 1 on a regression
export async function measureWithCli(cli: string, urls: { baseline: string; candidate: string }, scenario: GateScenario, conditions = CONDITIONS) {
  const { code, stdout, stderr } = await run(cli, gateArgs(urls, scenario, conditions));
  if (code > 1) throw new Error(`The CLI exited with ${code} on ${urls.candidate} against ${urls.baseline}:\n${stderr}`);
  return { exitCode: code, report: JSON.parse(stdout) };
}

// What the gate keeps of the JSON output of the CLI for one scenario
export function resultOf(scenario: string, exitCode: number, report: any): ScenarioResult {
  const comparison = report.baseline ?? {};
  return {
    scenario,
    exitCode,
    metrics: comparison.metrics ?? {},
    runs: report.runs?.count ?? comparison.runs?.count,
    ...(comparison.extended ? { extended: comparison.extended } : {}),
  };
}

// The runs a side of each scenario, and whether the CLI measured more. They stay out of the gate that
// the Judge gets, so its input does not change.
export function runsOf(results: ScenarioResult[]): ScenarioRuns[] {
  return results.map(({ scenario, runs, extended }) => ({ scenario, runs: runs ?? 0, ...(extended ? { extended } : {}) }));
}

// The verdict of the gate for a candidate: it fails when any scenario exits with 1
export function gateOf(results: ScenarioResult[]): Gate {
  const scenarios: Scenario[] = results.map(({ scenario, exitCode, metrics }) => ({
    scenario,
    exitCode,
    metrics: Object.fromEntries(
      Object.entries(metrics).map(([metric, m]) => [
        metric,
        { baseline: m.baseline, candidate: m.current, deltaPercent: m.deltaPercent, threshold: m.threshold, p: m.stats?.p, verdict: m.verdict },
      ]),
    ),
  }));
  return { verdict: scenarios.some((s) => s.exitCode !== 0) ? "fail" : "pass", scenarios };
}
