// Measures the alternatives that the map page of the stack discards, next to the choice of the
// workshop, with the same tools as the gate and the Judge:
//   network:     the gate on pr/lcp-hero-lazy with and without the fast-4g network throttling
//   preload:     the gate on pr/lcp-hero-lazy against main with and without the preload of the hero
//   keep-names:  the suspects of the INP of pr/loaf-cart-handler and the lines of the diff they
//                match, with a build that keeps the function names and with one that does not
// The measurements run one after the other, so two Chromium never share the CPU.
// Usage: node discarded.mjs   (writes out/results.json and prints a summary)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build, CONDITIONS, freePort, resolveRef, run, SCENARIOS, serve, waitFor } from "../regressions/measure.mjs";
import { record, summarize } from "../../agents/src/judge/traces.ts";
import { suspectsFor } from "../../agents/src/judge/suspects.ts";
import { matchSuspects } from "../../agents/src/judge/match.ts";
import { diffOf } from "../../agents/src/judge/diff.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = join(HERE, "out");
const CLI = join(HERE, "node_modules/.bin/webperf-snippets");
const TRACE_ENGINE = join(HERE, "node_modules/.bin/trace-engine-cli");

const HOME = SCENARIOS.find((s) => s.id === "home");
const ADD_TO_CART = SCENARIOS.find((s) => s.id === "add-to-cart");

// The conditions of the gate without the network throttling: --cpu 4 --runs 5
export const WITHOUT_NETWORK = CONDITIONS.filter((arg, i, all) => arg !== "--network" && all[i - 1] !== "--network");

// The shop of a ref, as it is or changed before its build
const BUILDS = {
  main: { ref: "main" },
  "pr/lcp-hero-lazy": { ref: "pr/lcp-hero-lazy" },
  "pr/loaf-cart-handler": { ref: "pr/loaf-cart-handler" },
  // index.html without the marker where server.mjs puts the preload of the LCP image of each route
  "main without preload": { ref: "main", patch: (dir) => edit(join(dir, "apps/shop/index.html"), "<!-- lcp-preload -->", "") },
  // The default minification of Rolldown, which renames functions
  "main without keepNames": { ref: "main", patch: withoutKeepNames },
  "pr/loaf-cart-handler without keepNames": { ref: "pr/loaf-cart-handler", patch: withoutKeepNames },
};

// The LCP of pr/lcp-hero-lazy in the gate, under each alternative
export const LCP_CASES = [
  { id: "gate", baseline: "main", conditions: CONDITIONS },
  { id: "without network throttling", baseline: "main", conditions: WITHOUT_NETWORK },
  { id: "without preload in main", baseline: "main without preload", conditions: CONDITIONS },
];

// The attribution of the INP of pr/loaf-cart-handler, with each build
export const ATTRIBUTION_CASES = [
  { id: "keepNames", baseline: "main", candidate: "pr/loaf-cart-handler" },
  { id: "without keepNames", baseline: "main without keepNames", candidate: "pr/loaf-cart-handler without keepNames" },
];

async function edit(file, from, to) {
  const text = await readFile(file, "utf8");
  if (!text.includes(from)) throw new Error(`${from} is not in ${file}`);
  await writeFile(file, text.replace(from, to));
}

function withoutKeepNames(dir) {
  return edit(join(dir, "apps/shop/vite.config.ts"), "keepNames: true", "keepNames: false");
}

// One measurement with the CLI, like the gate (agents/src/judge/gate.ts) but with the given conditions
async function gate(url, scenario, conditions, baselineFile) {
  const args = [url, ...scenario.cli, ...conditions, "--json"];
  if (baselineFile) args.push("--baseline", baselineFile, "--fail-on-regression");
  const { code, stdout, stderr } = await run(CLI, args);
  if (code > 1) throw new Error(`The CLI exited with ${code} on ${url}:\n${stderr}`);
  return { exitCode: code, report: JSON.parse(stdout) };
}

async function measureLcp(origins) {
  const results = [];
  for (const { id, baseline, conditions } of LCP_CASES) {
    const baselineFile = join(OUT, `baseline-${id.replaceAll(" ", "-")}.json`);
    const { report } = await gate(origins[baseline] + HOME.path, HOME, conditions);
    await writeFile(baselineFile, JSON.stringify(report));
    const { exitCode, report: candidate } = await gate(origins["pr/lcp-hero-lazy"] + HOME.path, HOME, conditions, baselineFile);
    results.push({ id, baseline, conditions, exitCode, LCP: candidate.baseline?.metrics?.LCP ?? null });
  }
  return results;
}

async function attribute(origins, thirdPartyOrigin) {
  const click = ADD_TO_CART.traces.find((t) => t.click);
  const diff = diffOf(REPO, resolveRef("main"), resolveRef("pr/loaf-cart-handler"));
  const browser = await chromium.launch({ channel: "chromium" });
  const results = [];
  try {
    for (const { id, baseline, candidate } of ATTRIBUTION_CASES) {
      const sides = {};
      for (const [side, name] of [["baseline", baseline], ["candidate", candidate]]) {
        const file = join(OUT, "traces", `${id.replaceAll(" ", "-")}-${side}.json`);
        await mkdir(dirname(file), { recursive: true });
        await record(browser, origins[name] + ADD_TO_CART.path, click, file);
        const names = [
          [origins[name], `http://shop-${side}:3000`],
          [thirdPartyOrigin, "http://thirdparty:4000"],
        ];
        sides[side] = summarize(TRACE_ENGINE, file, click.summaries, names);
      }
      const suspects = suspectsFor({ [ADD_TO_CART.id]: sides }, { metric: "INP", scenario: ADD_TO_CART.id });
      const matches = matchSuspects(suspects, diff);
      results.push({
        id,
        suspects: suspects.map(({ name, selfTimeMs, baselineSelfTimeMs }) => ({ name, selfTimeMs, baselineSelfTimeMs })),
        matches: matches.map(({ suspect, file, line }) => ({ name: suspect.name, file, line })),
        tasks: sides.candidate.tasks,
      });
    }
  } finally {
    await browser.close();
  }
  return results;
}

export async function measure() {
  await mkdir(OUT, { recursive: true });
  const dirs = {};
  for (const [name, { ref, patch }] of Object.entries(BUILDS)) {
    dirs[name] = await build(resolveRef(ref), { dir: join(OUT, "refs", name.replaceAll(/[ /]/g, "-")), patch });
  }

  const children = [];
  try {
    const thirdPartyPort = await freePort();
    const thirdPartyOrigin = `http://127.0.0.1:${thirdPartyPort}`;
    children.push(serve("server.mjs", join(dirs.main, "apps/thirdparty"), { PORT: String(thirdPartyPort) }));
    await waitFor(`${thirdPartyOrigin}/ab.js`);

    const origins = {};
    for (const name of Object.keys(BUILDS)) {
      const port = await freePort();
      children.push(serve("server.mjs", join(dirs[name], "apps/shop"), { PORT: String(port), THIRDPARTY_ORIGIN: thirdPartyOrigin }));
      origins[name] = `http://127.0.0.1:${port}`;
      await waitFor(origins[name]);
    }

    const results = { lcp: await measureLcp(origins), attribution: await attribute(origins, thirdPartyOrigin) };
    await writeFile(join(OUT, "results.json"), JSON.stringify(results, null, 2));
    return results;
  } finally {
    for (const child of children) child.kill();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { lcp, attribution } = await measure();
  console.log("LCP of pr/lcp-hero-lazy in the gate");
  for (const { id, baseline, exitCode, LCP } of lcp) {
    console.log(`  ${id} (baseline: ${baseline}): ${Math.round(LCP.baseline)} -> ${Math.round(LCP.current)} ms, ${LCP.deltaPercent} %, p ${LCP.stats?.p}, ${LCP.verdict}, exit ${exitCode}`);
  }
  console.log("Suspects of the INP of pr/loaf-cart-handler and the lines of the diff they match");
  for (const { id, suspects, matches } of attribution) {
    console.log(`  ${id}: suspects ${suspects.map((s) => `${s.name} (${s.selfTimeMs} ms)`).join(", ") || "none"}`);
    for (const m of matches) console.log(`    ${m.name} -> ${m.file}: ${m.line}`);
  }
  console.log(`\nResults in ${join(OUT, "results.json")}`);
}
