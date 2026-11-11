// The gate of the workshop: the WebPerf Snippets CLI measures the baseline, then the candidate
// against it with --fail-on-regression, and its exit code is the decision. The Judge reads the
// verdict and the metrics of each scenario from what the CLI reports.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Gate, Scenario } from "./types.ts";

export const CONDITIONS = ["--cpu", "4", "--network", "fast-4g", "--runs", "5"];

const JOURNEY = fileURLToPath(new URL("../../journeys/add-to-cart.json", import.meta.url));
const clickOf = (journey: string) =>
  JSON.parse(readFileSync(journey, "utf8")).interactions.find((i: { action: string }) => i.action === "click").selector as string;

// Each scenario of the gate: its page, the arguments of the CLI, and for the traces of the Judge,
// what to click and which summaries of trace-engine-cli explain its metrics
export interface GateScenario {
  id: string;
  path: string;
  cli: string[];
  click?: string;
  summaries: Record<string, string[]>;
}

const TASKS = ["tasks", "--tree", "bottom-up", "--top", "5"];

export const SCENARIOS: GateScenario[] = [
  { id: "home", path: "/", cli: [], summaries: { overview: ["overview"], shifts: ["shifts"], tasks: TASKS } },
  {
    id: "add-to-cart",
    path: "/product/kenya-aa",
    // The default workflow does not give the INP
    cli: ["--workflow", "interaction", "--interact-script", JOURNEY],
    click: clickOf(JOURNEY),
    summaries: { interactions: ["interactions"], tasks: TASKS },
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

// What the gate gives for one scenario of the candidate
export interface ScenarioResult {
  scenario: string;
  exitCode: number;
  metrics: Record<string, CliMetric>;
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

// One measurement with the CLI at cli: without a baseline file it measures a baseline; with one, it
// compares against it and exits with 1 on a regression
export async function measureWithCli(cli: string, url: string, scenario: GateScenario, baselineFile?: string) {
  const args = [url, ...scenario.cli, ...CONDITIONS, "--json"];
  if (baselineFile) args.push("--baseline", baselineFile, "--fail-on-regression");
  const { code, stdout, stderr } = await run(cli, args);
  if (code > 1) throw new Error(`The CLI exited with ${code} on ${url}:\n${stderr}`);
  return { exitCode: code, report: JSON.parse(stdout) };
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
