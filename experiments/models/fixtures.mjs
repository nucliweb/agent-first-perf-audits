// Generates the input of the Judge for each regression branch, from real data, into fixtures/:
// the verdict of the gate, the diff of the branch and the trace-engine-cli summaries of the
// baseline and of the candidate. Every model of the benchmark then gets the same prompt.
// It reuses the builds and the results of experiments/regressions: run npm test there first.
// Usage: node fixtures.mjs   (--gate-only rewrites the gate and the expectations, without new traces)
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { normalizeSummary } from "../../agents/src/judge/normalize.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const REGRESSIONS = resolve(HERE, "../regressions/out");
const TRACE_ENGINE = join(HERE, "node_modules/.bin/trace-engine-cli");
const TRACES = join(HERE, "out/traces");

// What a correct explanation says about each regressed metric of each branch: the pattern its
// cause or its evidence has to match. The benchmark scores the models with it; the models never
// see it. A branch without regression has none.
export const EXPECTED = {
  "pr/lcp-hero-lazy": { LCP: "preload|lazy|fetch-?priority" },
  "pr/cls-promo-banner": { CLS: "min-height|promo-slot|reserve|font-display|swap" },
  "pr/loaf-cart-handler": { LCP: "ab\\.js|synchronous|A/B", INP: "recommendFor|recommendations" },
  "pr/noop-refactor": {},
};

// The same conditions as the gate: 4x CPU and the fast-4g preset of WebPerf Snippets
const CPU_RATE = 4;
const FAST_4G = { offline: false, latency: 60 * 2.75, downloadThroughput: ((9 * 1e6) / 8) * 0.9, uploadThroughput: ((1.5 * 1e6) / 8) * 0.9 };

const CATEGORIES = [
  "-*", "devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-devtools.timeline.stack", "disabled-by-default-devtools.timeline.invalidationTracking",
  "disabled-by-default-v8.cpu_profiler", "disabled-by-default-lighthouse", "v8.execute", "v8", "blink.user_timing",
  "blink.console", "loading", "latencyInfo", "toplevel", "rail", "__metadata",
];

// Each scenario of the gate, with the summaries that explain its metrics
const SCENARIOS = {
  home: { path: "/", summaries: { overview: ["overview"], shifts: ["shifts"], tasks: ["tasks", "--tree", "bottom-up", "--top", "5"] } },
  "add-to-cart": {
    path: "/product/kenya-aa",
    click: 'button:has-text("Add to cart")',
    summaries: { interactions: ["interactions"], tasks: ["tasks", "--tree", "bottom-up", "--top", "5"] },
  },
};

const dirOf = (ref) => join(REGRESSIONS, "refs", ref.replaceAll("/", "-"), "apps");

const freePort = () =>
  new Promise((ok) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => ok(port));
    });
  });

async function start(createServer, options) {
  const port = await freePort();
  const server = createServer(options);
  await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
  return { server, origin: `http://127.0.0.1:${port}` };
}

async function record(browser, url, scenario, file) {
  const context = await browser.newContext({ viewport: { width: 412, height: 823 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", FAST_4G);
  if (scenario.click) {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1000);
    await browser.startTracing(page, { path: file, categories: CATEGORIES });
    await page.click(scenario.click);
    await page.waitForTimeout(800);
  } else {
    await browser.startTracing(page, { path: file, categories: CATEGORIES });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1500); // the promo banner arrives after 800 ms
  }
  await browser.stopTracing();
  await context.close();
}

function summarize(file, summaries, names) {
  const out = {};
  for (const [name, args] of Object.entries(summaries)) {
    let text = execFileSync(TRACE_ENGINE, [...args, file], { encoding: "utf8" }).trim();
    for (const [origin, service] of names) text = text.replaceAll(origin, service);
    out[name] = normalizeSummary(text);
  }
  return out;
}

const DIFF_EXCLUDES = [":(exclude)apps/shop/*.test.mjs", ":(exclude)apps/shop/**/*.test.ts"];
const diffOf = (ref) =>
  execFileSync("git", ["-C", REPO, "diff", `main...${ref}`, "--", "apps/shop", ...DIFF_EXCLUDES], { encoding: "utf8" }).trim();

// The verdict of the gate for a branch, from the results of experiments/regressions
function gateOf(results, ref) {
  const scenarios = results
    .filter((r) => r.ref === ref)
    .map(({ scenario, exitCode, metrics }) => ({
      scenario,
      exitCode,
      metrics: Object.fromEntries(
        Object.entries(metrics).map(([metric, m]) => [
          metric,
          {
            baseline: m.baseline,
            candidate: m.current,
            deltaPercent: m.deltaPercent,
            threshold: m.threshold,
            p: m.stats?.p,
            verdict: m.verdict,
          },
        ]),
      ),
    }));
  return { verdict: scenarios.some((s) => s.exitCode !== 0) ? "fail" : "pass", scenarios };
}

export async function generate() {
  const results = JSON.parse(await readFile(join(REGRESSIONS, "results.json"), "utf8"));
  await mkdir(TRACES, { recursive: true });
  await mkdir(join(HERE, "fixtures"), { recursive: true });

  const { createThirdPartyServer } = await import(pathToFileURL(join(dirOf("main"), "thirdparty/server.mjs")));
  const thirdParty = await start(createThirdPartyServer);
  const shops = {};
  for (const ref of ["main", ...Object.keys(EXPECTED)]) {
    const { createShopServer } = await import(pathToFileURL(join(dirOf(ref), "shop/server.mjs")));
    shops[ref] = await start(createShopServer, { root: join(dirOf(ref), "shop/dist"), thirdPartyOrigin: thirdParty.origin });
  }

  const browser = await chromium.launch({ channel: "chromium" });
  try {
    for (const ref of Object.keys(EXPECTED)) {
      const traces = {};
      for (const [id, scenario] of Object.entries(SCENARIOS)) {
        traces[id] = {};
        for (const [side, shopRef] of [["baseline", "main"], ["candidate", ref]]) {
          const file = join(TRACES, `${ref.replaceAll("/", "-")}-${id}-${side}.json`);
          await record(browser, shops[shopRef].origin + scenario.path, scenario, file);
          const names = [
            [shops[shopRef].origin, `http://shop-${side}:3000`],
            [thirdParty.origin, "http://thirdparty:4000"],
          ];
          traces[id][side] = summarize(file, scenario.summaries, names);
        }
      }
      const fixture = { ref, expected: EXPECTED[ref], input: { branch: ref, gate: gateOf(results, ref), diff: diffOf(ref), traces } };
      await writeFile(join(HERE, "fixtures", `${ref.replaceAll("/", "-")}.json`), JSON.stringify(fixture, null, 2) + "\n");
      console.log(`${ref}: ${Buffer.byteLength(JSON.stringify(fixture.input))} bytes of input`);
    }
  } finally {
    await browser.close();
    for (const { server } of Object.values(shops)) server.close();
    thirdParty.server.close();
  }
}

// Rewrites the gate and the expectations of the fixtures from the results of experiments/regressions,
// and keeps their diffs and trace summaries, so the models still get the same traces
export async function regate() {
  const results = JSON.parse(await readFile(join(REGRESSIONS, "results.json"), "utf8"));
  for (const ref of Object.keys(EXPECTED)) {
    const file = join(HERE, "fixtures", `${ref.replaceAll("/", "-")}.json`);
    const fixture = JSON.parse(await readFile(file, "utf8"));
    fixture.expected = EXPECTED[ref];
    fixture.input.gate = gateOf(results, ref);
    await writeFile(file, JSON.stringify(fixture, null, 2) + "\n");
    console.log(`${ref}: gate rewritten`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await (process.argv.includes("--gate-only") ? regate() : generate());
}
