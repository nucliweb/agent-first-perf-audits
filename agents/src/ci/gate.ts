// The ci service: the performance gate of a pull request, inside Docker Compose.
//   1. The gate: the WebPerf Snippets CLI measures the baseline shop, then the candidate against it.
//      Its exit code is the decision.
//   2. The attribution: one trace per scenario and side, summarized by trace-engine-cli.
//   3. The explanation: the Judge with the local LLM (llm profile). With the lite profile there is
//      no local LLM, and the handoff files carry the same input for an external agent.
// It writes report.json, report.md, report.html, handoff.json and handoff.md to OUT, and exits
// with 0 when the gate passes and 1 when it fails. One Chromium at a time: the measurements and
// the traces run one after the other, so they never share the CPU.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { diffOf, refOfTag, refsOf } from "../judge/diff.ts";
import { CONDITIONS, gateOf, measureWithCli, SCENARIOS, type ScenarioResult } from "../judge/gate.ts";
import { handoffMarkdown, handoffOf } from "../judge/handoff.ts";
import { record, summarize } from "../judge/traces.ts";
import type { JudgeInput, TraceSummaries } from "../judge/types.ts";
import { explain, ollama } from "../subagents/judge.ts";
import { reportHtml, reportMarkdown, type Report } from "./report.ts";

const BIN = join(import.meta.dirname, "../../node_modules/.bin");

function env(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const log = (message: string) => console.error(`[ci] ${message}`);

async function main() {
  const urls = { baseline: env("BASELINE_URL"), candidate: env("CANDIDATE_URL") };
  const repo = env("REPO", "/repo");
  const out = env("OUT", "/out");
  const profile = (process.env.COMPOSE_PROFILES ?? "").split(",").includes("llm") ? "llm" : "lite";

  // The refs of the two shop images, from their tags or given as refs
  const refs = refsOf(repo);
  const baselineRef = process.env.BASELINE_REF || refOfTag(env("BASELINE", "main"), refs);
  const candidateRef = process.env.CANDIDATE_REF || refOfTag(env("CANDIDATE"), refs);
  log(`${candidateRef} against ${baselineRef}, ${profile} profile`);

  await mkdir(join(out, "gate"), { recursive: true });
  await mkdir(join(out, "traces"), { recursive: true });

  // 1. The gate
  const results: ScenarioResult[] = [];
  let browserBuild = "";
  for (const scenario of SCENARIOS) {
    const baselineFile = join(out, "gate", `baseline-${scenario.id}.json`);
    log(`gate, ${scenario.id}: baseline`);
    const { report: baseline } = await measureWithCli(join(BIN, "webperf-snippets"), urls.baseline + scenario.path, scenario);
    await writeFile(baselineFile, JSON.stringify(baseline, null, 2));
    log(`gate, ${scenario.id}: candidate`);
    const { exitCode, report } = await measureWithCli(join(BIN, "webperf-snippets"), urls.candidate + scenario.path, scenario, baselineFile);
    await writeFile(join(out, "gate", `candidate-${scenario.id}.json`), JSON.stringify(report, null, 2));
    results.push({ scenario: scenario.id, exitCode, metrics: report.baseline?.metrics ?? {} });
    const browser = report.conditions?.browser;
    if (browser) browserBuild = `${browser.build} ${browser.version}`;
  }
  const gate = gateOf(results);
  log(`gate: ${gate.verdict}`);

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
  const input: JudgeInput = { branch: candidateRef, gate, diff: diffOf(repo, baselineRef, candidateRef), traces };
  const handoff = handoffOf(input);
  await writeFile(join(out, "handoff.json"), JSON.stringify(handoff, null, 2) + "\n");
  await writeFile(join(out, "handoff.md"), handoffMarkdown(handoff));

  // Without a regression the rules answer on their own, in both profiles. With a regression and
  // the lite profile, the explanation comes from the handoff.
  let explanations = null;
  if (profile === "llm" || !handoff.requests.length) {
    if (handoff.requests.length) log(`explanation: ${handoff.requests.length} call(s) to ${env("OLLAMA_MODEL")}`);
    const chat = profile === "llm" ? ollama(env("OLLAMA_URL"), env("OLLAMA_MODEL")) : async () => Promise.reject(new Error("The lite profile has no local LLM"));
    explanations = (await explain(input, chat)).explanations;
  }

  const report: Report = {
    branch: candidateRef,
    baseline: baselineRef,
    profile,
    conditions: [CONDITIONS.join(" "), browserBuild].filter(Boolean).join(", "),
    verdict: gate.verdict,
    gate,
    explanations,
  };
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await writeFile(join(out, "report.md"), reportMarkdown(report));
  await writeFile(join(out, "report.html"), reportHtml(report));
  log(`${gate.verdict}: report in report.md, report.html and report.json`);
  return gate.verdict === "pass" ? 0 : 1;
}

// 0 pass, 1 fail, 2 the gate could not run
process.exitCode = await main().catch((error) => {
  console.error(error);
  return 2;
});
