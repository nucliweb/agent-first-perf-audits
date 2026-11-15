// The performance gate of a pull request and its explanation, as ci runs it and as the orchestrator
// runs it after the subagents:
//   1. The gate: the WebPerf Snippets CLI measures the candidate shop against the baseline shop, one
//      call per scenario with the runs of both alternating, and more runs when a metric is
//      inconclusive for the worse. Its exit code is the decision.
//   2. The attribution: one trace per scenario and side, summarized by trace-engine-cli.
//   3. The explanation: the Judge with the local LLM (llm profile). With the lite profile there is
//      no local LLM, and the handoff files carry the same input for an external agent.
//   4. The facts of the rules: the lines of the diff they relate to each regressed metric.
//   5. From the orchestrator, the findings of the subagents for each regressed metric.
// It writes gate/ (the JSON of the CLI for each scenario), traces/, input.json (what the Judge gets), report.json, report.md, report.html,
// handoff.json and handoff.md to out. explain.ts reads input.json to explain the run with another model.
// One Chromium at a time: the measurements and the traces run one after the other.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { branchOf, diffOf, refOfTag, refsOf } from "../judge/diff.ts";
import { findingsFor, type Found } from "../judge/findings.ts";
import { CONDITIONS, gateOf, MAX_RUNS, measureWithCli, resultOf, runsOf, SCENARIOS, type ScenarioResult } from "../judge/gate.ts";
import { handoffMarkdown, handoffOf } from "../judge/handoff.ts";
import { lcpLoadingFacts } from "../judge/lcp-loading.ts";
import { inconclusiveMetrics, regressedMetrics } from "../judge/rules.ts";
import { record, summarize } from "../judge/traces.ts";
import type { JudgeInput, TraceSummaries } from "../judge/types.ts";
import { explain, ollama } from "../subagents/judge.ts";
import { reportHtml, reportMarkdown, type Report } from "./report.ts";

const BIN = join(import.meta.dirname, "../../node_modules/.bin");

export interface GateRun {
  urls: { baseline: string; candidate: string };
  repo: string;
  out: string;
  profile: "llm" | "lite";
  baselineRef: string;
  candidateRef: string;
  // The local LLM, only with the llm profile
  ollama: { url: string; model: string } | null;
  log: (message: string) => void;
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// What Docker Compose gives the agents service: the URLs of the shops, the repo, the tags of the
// shop images under comparison and the profile
export function gateRunFromEnv(out: string, log: GateRun["log"]): GateRun {
  const repo = env("REPO", "/repo");
  const profile = (process.env.COMPOSE_PROFILES ?? "").split(",").includes("llm") ? "llm" : "lite";
  // The refs of the two shop images, from their tags or given as refs
  const refs = refsOf(repo);
  return {
    urls: { baseline: env("BASELINE_URL"), candidate: env("CANDIDATE_URL") },
    repo,
    out,
    profile,
    baselineRef: process.env.BASELINE_REF || refOfTag(env("BASELINE", "main"), refs),
    candidateRef: process.env.CANDIDATE_REF || refOfTag(env("CANDIDATE"), refs),
    ollama: profile === "llm" ? { url: env("OLLAMA_URL"), model: env("OLLAMA_MODEL") } : null,
    log,
  };
}

// found: what the subagents of the orchestrator measured, for the findings; ci has none
export async function runGate(run: GateRun, found?: Found): Promise<Report> {
  const { urls, repo, out, profile, baselineRef, candidateRef, log } = run;
  log(`${branchOf(candidateRef)} against ${branchOf(baselineRef)}, ${profile} profile`);

  // Only the files of this run: the gate of an earlier version wrote a baseline and a candidate file
  await rm(join(out, "gate"), { recursive: true, force: true });
  await mkdir(join(out, "gate"), { recursive: true });
  await mkdir(join(out, "traces"), { recursive: true });

  // 1. The gate
  const results: ScenarioResult[] = [];
  let browserBuild = "";
  for (const scenario of SCENARIOS) {
    log(`gate, ${scenario.id}: candidate against baseline, their runs alternating`);
    const pages = { baseline: urls.baseline + scenario.path, candidate: urls.candidate + scenario.path };
    const { exitCode, report } = await measureWithCli(join(BIN, "webperf-snippets"), pages, scenario);
    await writeFile(join(out, "gate", `${scenario.id}.json`), JSON.stringify(report, null, 2));
    const result = resultOf(scenario.id, exitCode, report);
    if (result.extended) log(`gate, ${scenario.id}: ${result.extended.metrics.join(", ")} inconclusive after ${result.extended.after} runs, measured ${result.runs}`);
    results.push(result);
    const browser = report.conditions?.browser;
    if (browser) browserBuild = `${browser.build} ${browser.version}`;
  }
  const gate = gateOf(results);
  const inconclusive = inconclusiveMetrics(gate.scenarios);
  log(`gate: ${gate.verdict}${inconclusive.length ? `, inconclusive: ${inconclusive.map((m) => `${m.metric} in ${m.scenario}`).join(", ")}` : ""}`);

  // 2. The traces, recorded with the same Chromium as the CLI
  const traces: TraceSummaries = {};
  const browser = await chromium.launch({ channel: "chromium" });
  try {
    for (const scenario of SCENARIOS) {
      traces[scenario.id] = {};
      for (const side of ["baseline", "candidate"] as const) {
        traces[scenario.id][side] = {};
        for (const trace of scenario.traces) {
          log(`trace, ${scenario.id}: ${side}, ${trace.name}`);
          const file = join(out, "traces", `${scenario.id}-${trace.name}-${side}.json`);
          await record(browser, urls[side] + scenario.path, trace, file);
          Object.assign(traces[scenario.id][side], summarize(join(BIN, "trace-engine-cli"), file, trace.summaries));
        }
      }
    }
  } finally {
    await browser.close();
  }

  // 3. The explanation, and the handoff with the same input
  const input: JudgeInput = { branch: branchOf(candidateRef), gate, diff: diffOf(repo, baselineRef, candidateRef), traces };
  await writeFile(join(out, "input.json"), JSON.stringify(input, null, 2) + "\n");
  const handoff = handoffOf(input);
  await writeFile(join(out, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n");
  await writeFile(join(out, "handoff.md"), handoffMarkdown(handoff));

  // Without a regression the rules answer on their own, in both profiles. With a regression and
  // the lite profile, the explanation comes from the handoff.
  let explanations = null;
  if (run.ollama || !handoff.requests.length) {
    if (handoff.requests.length) log(`explanation: ${handoff.requests.length} call(s) to ${run.ollama!.model}`);
    const chat = run.ollama ? ollama(run.ollama.url, run.ollama.model) : async () => Promise.reject(new Error("The lite profile has no local LLM"));
    explanations = (await explain(input, chat)).explanations;
  }

  const report: Report = {
    branch: branchOf(candidateRef),
    baseline: branchOf(baselineRef),
    profile,
    conditions: [[...CONDITIONS, ...MAX_RUNS].join(" "), browserBuild].filter(Boolean).join(", "),
    verdict: gate.verdict,
    inconclusive,
    runs: runsOf(results),
    gate,
    explanations,
    ...(explanations && run.ollama && handoff.requests.length ? { explainedBy: run.ollama.model } : {}),
    // 4. The facts of the rules, which the LLM does not see
    ruleFacts: regressedMetrics(gate.scenarios)
      .map(({ metric, scenario }) => ({ metric, scenario, facts: lcpLoadingFacts(input, { metric, scenario }) }))
      .filter((f) => f.facts.length),
    // 5. The findings of the subagents, for the metrics the rules explain
    ...(found ? { findings: findingsFor(regressedMetrics(gate.scenarios), found) } : {}),
  };
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await writeFile(join(out, "report.md"), reportMarkdown(report));
  await writeFile(join(out, "report.html"), reportHtml(report));
  log(`${gate.verdict}: report in report.md, report.html and report.json`);
  return report;
}
