// Generates the input of the Judge for each regression branch, from real data, into fixtures/:
// the verdict of the gate, the diff of the branch and the trace-engine-cli summaries of the
// baseline and of the candidate. Every model of the benchmark then gets the same prompt.
// It reuses the builds and the results of experiments/regressions: run npm test there first.
// Usage: node fixtures.mjs   (--gate-only rewrites the gate and the expectations, without new traces)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { diffOf } from "../../agents/src/judge/diff.ts";
import { gateOf as gateOfResults, SCENARIOS } from "../../agents/src/judge/gate.ts";
import { record, summarize as summarizeWith } from "../../agents/src/judge/traces.ts";

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

const summarize = (file, summaries, names) => summarizeWith(TRACE_ENGINE, file, summaries, names);

// The verdict of the gate for a branch, from the results of experiments/regressions
const gateOf = (results, ref) => gateOfResults(results.filter((r) => r.ref === ref));

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
      for (const scenario of SCENARIOS) {
        const { id } = scenario;
        traces[id] = {};
        for (const [side, shopRef] of [["baseline", "main"], ["candidate", ref]]) {
          const names = [
            [shops[shopRef].origin, `http://shop-${side}:3000`],
            [thirdParty.origin, "http://thirdparty:4000"],
          ];
          traces[id][side] = {};
          for (const trace of scenario.traces) {
            const file = join(TRACES, `${ref.replaceAll("/", "-")}-${id}-${trace.name}-${side}.json`);
            await record(browser, shops[shopRef].origin + scenario.path, trace, file);
            Object.assign(traces[id][side], summarize(file, trace.summaries, names));
          }
        }
      }
      const fixture = { ref, expected: EXPECTED[ref], input: { branch: ref, gate: gateOf(results, ref), diff: diffOf(REPO, "main", ref), traces } };
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
