// The challenges of the workshop, run as their page writes them: the rehearsal clones the repo clean and
// runs the bash blocks of the Spanish page of the challenges in order, and this script does by hand what
// the page asks the reader to do by hand, the edits of the shop and of the conditions of the gate, right
// before the command that follows each one. After each gate it keeps the verdict and the metrics of its
// report. results.json is what claims.test.mjs checks the page against.
//
// Usage, from anywhere:
//   node run.mjs [--source <path or URL>] [--ref main] [--dir <empty folder>] [--timeout <minutes>]
//   node run.mjs --dry-run      lists the commands of the page of this checkout, with their edits
//
// It measures: on the reference machine, nothing else runs at the same time, and the lab of the repo
// is stopped. It builds shop images, so it needs the network.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { describePlan, planOf, rehearse, stopLabOf } from "../rehearsal/rehearse.mjs";
import { expandLoops } from "../../scripts/check-docs.mjs";

const REPO = resolve(import.meta.dirname, "../..");
export const PAGE = "docs/src/content/docs/es/challenges.md";
export const SOURCES = [{ file: PAGE, step: "challenges" }];
export const RESULTS = "results";

// The line of lcpImageFor that pr/lcp-hero-lazy removes: the preload of the hero image
export const PRELOAD = 'if (pathname === "/") return { href: "/images/hero-1200.webp", srcset: heroSrcSet(), sizes: HERO_SIZES };';
// The conditions of the gate of the workshop, and the ones of the challenge without throttling
export const THROTTLED = 'export const CONDITIONS = ["--cpu", "4", "--network", "fast-4g", "--runs", "5"];';
export const UNTHROTTLED = 'export const CONDITIONS = ["--runs", "5"];';
// The chat widget of the shop, with how it loads and what its server takes to answer, in ms
export const chat = (loading, delay) => `<script ${loading ? `${loading} ` : ""}src="__THIRDPARTY_ORIGIN__/chat.js?delay=${delay}&cpu=60"></script>`;

// What the page asks the reader to change by hand, each one before the command that has its text. The
// files are relative to the root of the clone: the branches of the shop live in worktrees next to it.
export const EDITS = [
  {
    id: "fix-attribute",
    challenge: 1,
    before: 'commit -am "Load the hero image with high priority"',
    file: "../fix-lcp-hero/apps/shop/src/pages.tsx",
    from: 'loading="lazy"\n          alt="Freshly brewed specialty coffee"',
    to: 'fetchPriority="high"\n          alt="Freshly brewed specialty coffee"',
  },
  {
    id: "fix-preload",
    challenge: 1,
    before: 'commit -am "Preload the hero image on the home page"',
    file: "../fix-lcp-hero/apps/shop/src/products.ts",
    from: "export function lcpImageFor(pathname: string) {\n",
    to: `export function lcpImageFor(pathname: string) {\n  ${PRELOAD}\n`,
  },
  { id: "unthrottled", challenge: 3, before: "OUT=/out/unthrottled/", file: "agents/src/judge/gate.ts", from: THROTTLED, to: UNTHROTTLED },
  { id: "no-defer", challenge: 4, before: 'commit -am "Load the chat widget without defer"', file: "../my-regression/apps/shop/index.html", from: chat("defer", 300), to: chat("", 300) },
  { id: "slow-defer", challenge: 4, before: 'commit -am "Simulate a slow day of the chat provider"', file: "../my-regression/apps/shop/index.html", from: chat("", 300), to: chat("defer", 1500) },
  { id: "slow-async", challenge: 4, before: 'commit -am "Load the chat widget with async"', file: "../my-regression/apps/shop/index.html", from: chat("defer", 1500), to: chat("async", 1500) },
];

// The edits that go before a command
export const editsFor = (command) => EDITS.filter((edit) => command.includes(edit.before));

// Changes the one place of the file that has the text of the edit. The shop of another day may not have
// it: then the edit and the page that describes it have to change, so it stops instead of going on
export function applyEdit(root, edit) {
  const file = resolve(root, edit.file);
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const times = text.split(edit.from).length - 1;
  if (times !== 1) throw new Error(`${edit.id}: ${file} has its text ${times} times, not once`);
  writeFileSync(file, text.replace(edit.from, edit.to));
}

// The folders of out/ where the gate of a command leaves its reports, one for each OUT it sets
export function reportDirsOf(command) {
  return expandLoops(command).flatMap((line) => {
    const out = line.match(/-e OUT=\/out\/(\S+)/);
    return out ? [out[1]] : [];
  });
}

// What the results keep of a report.json of the gate. The text of the explanation stays out: it is the
// one of a model, and no claim of the page depends on it
export function summaryOf(dir, report) {
  return {
    dir,
    branch: report.branch,
    verdict: report.verdict,
    conditions: report.conditions,
    metrics: Object.fromEntries(
      report.gate.scenarios.map((s) => [
        s.scenario,
        Object.fromEntries(Object.entries(s.metrics).map(([metric, m]) => [metric, { baseline: m.baseline, candidate: m.candidate, deltaPercent: m.deltaPercent, p: m.p, verdict: m.verdict }])),
      ]),
    ),
    explained: (report.explanations ?? []).map(({ metric, scenario, source }) => ({ metric, scenario, source })),
    ruleFacts: report.ruleFacts ?? [],
  };
}

export async function runChallenges(options = {}) {
  const log = options.log ?? console.log;
  const { clone, file, results } = await rehearse({
    ...options,
    sources: SOURCES,
    resultsDir: import.meta.dirname,
    name: RESULTS,
    before: (planned, root) => {
      for (const edit of editsFor(planned.command)) {
        log(`[challenges] edit ${edit.id}: ${edit.file}`);
        applyEdit(root, edit);
      }
    },
    after: (planned, root) => {
      const edits = editsFor(planned.command).map((edit) => edit.id);
      const reports = reportDirsOf(planned.command)
        .filter((dir) => existsSync(join(root, "out", dir, "report.json")))
        .map((dir) => summaryOf(dir, JSON.parse(readFileSync(join(root, "out", dir, "report.json"), "utf8"))));
      return { ...(edits.length ? { edits } : {}), ...(reports.length ? { reports } : {}) };
    },
  });
  log(`[challenges] stopping the lab of ${clone}`);
  await stopLabOf(clone, options.env ?? process.env);
  return { file, results };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        source: { type: "string", default: REPO },
        ref: { type: "string", default: "main" },
        dir: { type: "string" },
        timeout: { type: "string", default: "30" },
        "dry-run": { type: "boolean", default: false },
      },
    });
    if (values["dry-run"]) {
      const plan = planOf(REPO, { sources: SOURCES }).map((c) => ({ ...c, ...(editsFor(c.command).length ? { marker: `after the edit ${editsFor(c.command).map((e) => e.id).join(", ")}` } : {}) }));
      console.log(describePlan(plan));
      console.log(`\n${plan.length} commands from the page of this checkout, ${EDITS.length} edits. A real run clones ${values.source} at ${values.ref} and takes them from the clone.`);
    } else {
      const timeout = Number(values.timeout);
      if (!(timeout > 0)) throw new Error(`--timeout takes minutes, not "${values.timeout}"`);
      await runChallenges({ source: values.source, ref: values.ref, dir: values.dir, timeoutMs: timeout * 60 * 1000 });
    }
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}
