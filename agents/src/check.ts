// The check of a step of the workshop: its tests, found by the workshop markers of the code, and
// the files the step leaves in out/. It prints OK or KO for each one, with what to run when a file
// is missing, and exits with 0 when the step is done. Inside Docker Compose:
//   docker compose run --rm agents npm run check -- step-02
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { regionsIn } from "./workshop.ts";

const AGENTS = join(import.meta.dirname, "..");
const SIDES = ["baseline", "candidate"];
const JOURNEYS = ["home", "shop", "product", "add-to-cart"];
const BRANCHES = { "pr/lcp-hero-lazy": "fail", "pr/cls-promo-banner": "fail", "pr/loaf-cart-handler": "fail", "pr/noop-refactor": "pass" };

export interface Result {
  what: string;
  ok: boolean;
  detail?: string;
}

// The test files of a step, relative to agents/
export function testsOf(step: number): string[] {
  return [...new Set(regionsIn(join(AGENTS, "src")).filter((r) => r.step === step).map((r) => r.tests))].sort();
}

// A file of out/ that passes when valid returns true for its parsed JSON
function file(out: string, path: string, valid: (json: any) => boolean, detail: string): Result {
  const what = `out/${path}`;
  if (!existsSync(join(out, path))) return { what, ok: false, detail: "missing" };
  try {
    return valid(JSON.parse(readFileSync(join(out, path), "utf8"))) ? { what, ok: true } : { what, ok: false, detail };
  } catch {
    return { what, ok: false, detail: "not JSON" };
  }
}

// A branch of a fresh clone exists only on the remote, and the reports name it origin/pr/...
const branchOf = (report: any) => String(report.branch ?? "").replace(/^origin\//, "");
const events = (trace: any): Array<{ name?: string }> => (Array.isArray(trace) ? trace : (trace.traceEvents ?? []));
const journeys = (report: any, valid: (journey: any) => boolean) =>
  JSON.stringify(report.journeys?.map((j: any) => j.name)) === JSON.stringify(JOURNEYS) && report.journeys.every(valid);

export const STEPS: Record<string, { title: string; run: string[]; outputs: (out: string) => Result[] }> = {
  "step-01": {
    title: "The first call to an MCP server",
    run: ["docker compose run --rm agents node src/first-trace.ts"],
    outputs: (out) => [
      file(out, "first-trace.json", (t) => events(t).length > 100 && events(t).some((e) => e.name === "largestContentfulPaint::Candidate"), "a trace of a page load, with its LCP"),
    ],
  },
  "step-02": {
    title: "The LCP subagent",
    run: ["CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp"],
    outputs: (out) =>
      SIDES.map((side) =>
        file(out, `agents/lcp-${side}.json`, (r) => r.lcp?.value > 0 && Object.values(r.subparts ?? {}).length === 4, "the LCP with its four sub-parts"),
      ),
  },
  "step-03": {
    title: "The Navigator, CLS and LoAF/INP",
    run: ["CANDIDATE=pr-loaf-cart-handler docker compose run --rm agents node src/orchestrator.ts cls loaf"],
    outputs: (out) =>
      SIDES.flatMap((side) => [
        file(out, `agents/navigator-${side}.json`, (r) => journeys(r, (j) => j.steps?.length > 0), "the four journeys with their steps"),
        file(out, `agents/cls-${side}.json`, (r) => journeys(r, (j) => typeof j.cls?.value === "number"), "the CLS of the four journeys"),
        file(
          out,
          `agents/loaf-${side}.json`,
          (r) => journeys(r, (j) => j.longFrames) && r.journeys.find((j: any) => j.name === "add-to-cart").inp?.value > 0,
          "the long frames of the four journeys and the INP of add to cart",
        ),
      ]),
  },
  "step-04": {
    title: "The Judge",
    run: ["CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp judge"],
    outputs: (out) => [
      file(
        out,
        "agents/judge/report.json",
        (r) => branchOf(r) === "pr/lcp-hero-lazy" && r.verdict === "fail" && r.findings?.some((f: any) => f.metric === "LCP" && f.facts.length),
        "the report of pr/lcp-hero-lazy: fail, with the findings of the LCP",
      ),
    ],
  },
  "step-05": {
    title: "The gate in ci against the four branches",
    run: Object.keys(BRANCHES).map((b) => `CANDIDATE=${b.replace("/", "-")} docker compose run --rm -e OUT=/out/ci/${b.replace("/", "-")} ci`),
    outputs: (out) =>
      Object.entries(BRANCHES).map(([branch, verdict]) =>
        file(out, `ci/${branch.replace("/", "-")}/report.json`, (r) => branchOf(r) === branch && r.verdict === verdict, `the report of ${branch}: ${verdict}`),
      ),
  },
};

export function outputsOf(step: string, out: string): Result[] {
  return STEPS[step].outputs(out);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  const step = STEPS[name];
  if (!step) {
    console.error(`Usage: npm run check -- <step>, one of ${Object.keys(STEPS).join(", ")}`);
    process.exit(2);
  }
  const out = process.env.OUT || "/out";
  console.log(`${name}: ${step.title}\n`);
  const results: Result[] = [];

  const tests = testsOf(Number(name.slice(-2)));
  if (tests.length) {
    const run = spawnSync(process.execPath, ["--test", "--test-reporter=spec", ...tests], { cwd: AGENTS, encoding: "utf8" });
    const count = (label: string) => run.stdout.match(new RegExp(`ℹ ${label} (\\d+)`))?.[1] ?? "?";
    results.push({ what: `tests: ${tests.join(" ")}`, ok: run.status === 0, detail: `${count("fail")} failing` });
    if (run.status !== 0) {
      // The summary of the failing tests that node prints at the end, with the error of each one
      const lines = run.stdout.split("\n");
      const summary = lines.slice(lines.findIndex((line) => line.includes("failing tests:")) + 1);
      console.log(summary.filter((line) => /^\s*(✖|\w*Error)/.test(line)).slice(0, 12).join("\n") + "\n");
    }
  }
  results.push(...outputsOf(name, out));

  for (const r of results) console.log(`  ${r.ok ? "OK" : "KO"}  ${r.what}${r.ok ? "" : `: ${r.detail}`}`);
  if (results.some((r) => !r.ok && r.what.startsWith("out/"))) console.log(`\nTo make the files of out/, run:\n${step.run.map((c) => `  ${c}`).join("\n")}`);
  const done = results.every((r) => r.ok);
  console.log(`\n${done ? `${name} is done.` : `${name} is not done yet.`}`);
  process.exitCode = done ? 0 : 1;
}
