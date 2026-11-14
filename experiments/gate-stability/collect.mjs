// Measures single runs of the shop of main and of each regression branch, in the lab of the repo and
// under the conditions of the gate, so every policy of policies.mjs can be evaluated afterwards on the
// same data. Each round measures, for each scenario, two orders:
//   adjacent     all the runs of main, then all the runs of one branch, as the gate does
//   interleaved  main, branch 1, ..., branch n, repeated as many times as runs a side
// Home measures the four branches; add to cart, only the two that change it. One Chromium at a time:
// every run is one call to the WebPerf Snippets CLI in the agents container, one after the other.
// It saves results/<label>.json after every block, so an interrupted night keeps its data and
// --resume continues it.
// Usage, from anywhere:
//   node collect.mjs --label idle --rounds 3 [--runs 9] [--branches a,b] [--scenarios home] [--resume] [--load]
// --load keeps the ollama service of the lab generating while it measures.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { loadavg } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { BASELINE, BRANCHES, CONDITIONS, run, SCENARIOS } from "../regressions/measure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const RESULTS = join(HERE, "results");
const MAX_RUNS = 9;

// The branches each scenario measures: add to cart only changes with the handler of the cart, and the
// refactor is the control of false positives in both
const SCENARIO_BRANCHES = {
  home: BRANCHES.map((b) => b.ref),
  "add-to-cart": ["pr/loaf-cart-handler", "pr/noop-refactor"],
};

// The conditions of the gate, with one run instead of its five
export function singleRun(conditions) {
  const at = conditions.indexOf("--runs");
  if (at === -1) throw new Error("The conditions of the gate have no --runs");
  return conditions.with(at + 1, "1");
}

// The arguments of the CLI for one run, in the order of measureWithCli in agents/src/judge/gate.ts. The
// agents container mounts agents/journeys at /app/journeys, so a file of agents/ moves to /app.
export function cliArgs(origin, scenario, repo) {
  const agents = join(repo, "agents") + "/";
  const inContainer = (arg) => (arg.startsWith(agents) ? "/app/" + arg.slice(agents.length) : arg);
  return [origin + scenario.path, ...scenario.cli.map(inContainer), ...singleRun(CONDITIONS), "--json"];
}

// The shop service of a ref in the override file, and its image tag: the ref with "/" as "-"
export function shopOf(ref) {
  const tag = ref.replaceAll("/", "-");
  return { service: `shop-${tag}`, tag, url: `http://shop-${tag}:3000` };
}

// The blocks of every round, in the order they are measured. sequence is the ref of each run.
export function planRounds({ rounds, runs, branches, scenarios }) {
  const blocks = [];
  for (let round = 1; round <= rounds; round++) {
    for (const { id: scenario } of SCENARIOS.filter((s) => scenarios.includes(s.id))) {
      const refs = SCENARIO_BRANCHES[scenario].filter((ref) => branches.includes(ref));
      if (!refs.length) continue;
      const times = (n, refs) => Array.from({ length: n }, () => refs).flat();
      for (const ref of refs) {
        blocks.push({ round, scenario, order: "adjacent", branches: [ref], sequence: [...times(runs, [BASELINE]), ...times(runs, [ref])] });
      }
      blocks.push({ round, scenario, order: "interleaved", branches: refs, sequence: times(runs, [BASELINE, ...refs]) });
    }
  }
  return blocks;
}

// What a block saves: one record per branch, with the runs of main and of the branch in the order
// measured. In an interleaved block every branch shares the same runs of main.
export function recordsOf(block, runsByRef, extra = {}) {
  const { round, scenario, order } = block;
  return block.branches.map((branch) => ({ round, scenario, branch, order, baseline: runsByRef[BASELINE], candidate: runsByRef[branch], ...extra }));
}

export const keyOf = ({ round, scenario, order, branch }) => `${round} ${scenario} ${order} ${branch}`;

// The blocks still to measure: a block counts as done only when all its records are saved
export function pendingBlocks(blocks, records) {
  const saved = new Set(records.map(keyOf));
  return blocks.filter((block) => block.branches.some((branch) => !saved.has(keyOf({ ...block, branch }))));
}

// A run as the policies read it (what summarizeRuns and compareRun of the CLI use: the URL, navMs and
// the results of the metrics), with the benchmark index of the machine and the time it was measured
export function savedRun(json, timestamp) {
  return {
    timestamp,
    url: json.url,
    navMs: json.navMs,
    results: json.results.filter((r) => r.metric).map(({ id, metric, status, value, unit }) => ({ id, metric, status, value, unit })),
    conditions: { machine: { benchmarkIndex: json.conditions?.machine?.benchmarkIndex } },
  };
}

// A run that failed, as the CLI keeps it among its runs: left out of the median
export const failedRun = (error, timestamp) => ({ timestamp, error });

// How the runs were measured, saved once: the same for every run but the benchmark index
export function conditionsOf(json) {
  const { viewport, waitMs, cpu, network, browser, cliVersion, machine } = json.conditions;
  const { benchmarkIndex, ...rest } = machine;
  return { viewport, waitMs, cpu, network, browser, cliVersion, machine: rest };
}

// The results of a label: a new file, or the saved one when resuming with the same settings
export function resultsFile(saved, { label, runs, load }, { resume }) {
  if (!saved) return { label, runs, load, conditions: null, records: [] };
  if (!resume) throw new Error(`results/${label}.json already exists: continue it with --resume, or choose another --label`);
  if (saved.runs !== runs) throw new Error(`results/${label}.json has ${saved.runs} runs a side, and this run asks for ${runs}`);
  if (saved.load !== load) throw new Error(`results/${label}.json was measured ${saved.load ? "with" : "without"} --load`);
  return saved;
}

const list = (value) => value.split(",").map((s) => s.trim()).filter(Boolean);

export function optionsOf(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      label: { type: "string" },
      rounds: { type: "string", default: "1" },
      runs: { type: "string", default: String(MAX_RUNS) },
      branches: { type: "string" },
      scenarios: { type: "string" },
      resume: { type: "boolean", default: false },
      load: { type: "boolean", default: false },
    },
  });
  if (!values.label) throw new Error("Give a --label, such as idle, loaded or smoke");
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(values.label)) throw new Error(`The label "${values.label}" names a file: use letters, digits and "-"`);
  const rounds = Number(values.rounds);
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error(`--rounds takes a whole number from 1, not "${values.rounds}"`);
  const runs = Number(values.runs);
  if (!Number.isInteger(runs) || runs < 1 || runs > MAX_RUNS) throw new Error(`--runs takes 1 to ${MAX_RUNS} runs a side, as the CLI, not "${values.runs}"`);
  const refs = BRANCHES.map((b) => b.ref);
  const branches = values.branches ? list(values.branches) : refs;
  for (const ref of branches) if (!refs.includes(ref)) throw new Error(`Unknown branch ${ref}. Choose from: ${refs.join(", ")}`);
  const ids = SCENARIOS.map((s) => s.id);
  const scenarios = values.scenarios ? list(values.scenarios) : ids;
  for (const id of scenarios) if (!ids.includes(id)) throw new Error(`Unknown scenario ${id}. Choose from: ${ids.join(", ")}`);
  return { label: values.label, rounds, runs, branches, scenarios, resume: values.resume, load: values.load };
}

// What would share the CPU with the runs: a gate or the agents of the lab, or the Ollama of the
// benchmark of experiments/models
export const busyContainers = (names) => names.filter((name) => /^agent-first-perf-audits-(agents|ci)-/.test(name) || name === "ollama-bench");

export function formatDuration(ms) {
  const total = Math.round(ms / 1000);
  const [h, m, s] = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  const pad = (n) => String(n).padStart(2, "0");
  if (h) return `${h}h${pad(m)}m${pad(s)}s`;
  if (m) return `${m}m${pad(s)}s`;
  return `${s}s`;
}

export function progressLine({ done, total, elapsedMs, round, rounds, scenario, order, ref, value }) {
  const left = (elapsedMs / done) * (total - done);
  return `[${done}/${total}] round ${round}/${rounds}, ${scenario} ${order}, ${ref}: ${value} | ${formatDuration(elapsedMs)} elapsed, about ${formatDuration(left)} left`;
}

// The measuring part: the lab, the runs and the file

const AGENTS = "agent-first-perf-audits-gate-stability-agents";
const IMAGE = "ghcr.io/nucliweb/agent-first-perf-audits/shop";

async function docker(args, { check = true } = {}) {
  const result = await run("docker", args, { cwd: REPO });
  if (check && result.code !== 0) throw new Error(`docker ${args.join(" ")} exited with ${result.code}:\n${result.stderr}`);
  return result;
}

const compose = (args, options) => docker(["compose", "-f", join(REPO, "compose.yaml"), "-f", join(HERE, "compose.yaml"), ...args], options);
const lines = (text) => text.split("\n").map((s) => s.trim()).filter(Boolean);

// Generates with the local LLM in a loop, from the agents container, which is on the lab network
const LOAD = `
const body = JSON.stringify({ model: process.env.OLLAMA_MODEL, prompt: "Write a long story about a coffee roastery.", stream: false, options: { num_predict: 64 } });
for (;;) {
  try {
    const response = await fetch(process.env.OLLAMA_URL + "/api/generate", { method: "POST", body });
    await response.text();
    console.log(response.ok ? "generated" : "status " + response.status);
  } catch (err) {
    console.log("error " + err.message);
    await new Promise((ok) => setTimeout(ok, 1000));
  }
}`;

// Starts the shops of the refs, the agents container and, with load, the generation loop. Returns the
// cleanup, which leaves the lab as it was: it removes the shops of the experiment and its agents
// container, and stops the services of the lab it had to start.
async function startLab(refs, { load, log }) {
  const before = lines((await compose(["ps", "--services", "--status", "running"])).stdout);
  const shops = refs.map((ref) => shopOf(ref).service);
  const started = [];
  let loop = null;
  const cleanup = async () => {
    loop?.kill();
    await docker(["rm", "-f", AGENTS], { check: false });
    await compose(["rm", "--stop", "--force", ...shops], { check: false });
    const lab = started.filter((service) => !before.includes(service));
    if (lab.length) await compose(["stop", ...lab], { check: false });
  };
  try {
    log(`Starting ${shops.join(", ")}`);
    started.push("thirdparty", ...shops);
    await compose(["up", "-d", "--wait", ...shops]);
    await docker(["rm", "-f", AGENTS], { check: false });
    await compose(["run", "-d", "--rm", "--no-deps", "--name", AGENTS, "agents", "sleep", "infinity"]);
    if (load) {
      log("Starting the generation loop of ollama");
      started.push("ollama");
      await compose(["up", "-d", "--wait", "ollama"]);
      loop = spawn("docker", ["exec", AGENTS, "node", "--input-type=module", "-e", LOAD], { stdio: ["ignore", "pipe", "inherit"] });
      loop.generations = 0;
      await new Promise((ok, fail) => {
        loop.stdout.on("data", (data) => {
          for (const line of lines(String(data))) {
            if (line === "generated") loop.generations++;
            else log(`ollama: ${line}`);
          }
          if (loop.generations) ok();
        });
        loop.on("close", () => fail(new Error("The generation loop of ollama stopped")));
      });
      log("ollama is generating");
    }
  } catch (err) {
    await cleanup();
    throw err;
  }
  return { cleanup, generations: () => loop?.generations ?? 0 };
}

async function measureOnce(origin, scenario) {
  const timestamp = new Date().toISOString();
  const { code, stdout, stderr } = await docker(["exec", AGENTS, "node_modules/.bin/webperf-snippets", ...cliArgs(origin, scenario, REPO)], { check: false });
  const tail = stderr.trim().split("\n").slice(-3).join(" ");
  if (code > 1) return { run: failedRun(`The CLI exited with ${code}: ${tail}`, timestamp) };
  try {
    const json = JSON.parse(stdout);
    return { json, run: savedRun(json, timestamp) };
  } catch {
    return { run: failedRun(`The CLI printed no JSON (exit ${code}): ${tail}`, timestamp) };
  }
}

async function save(file, results) {
  await writeFile(file + ".tmp", JSON.stringify(results, null, 1) + "\n");
  await rename(file + ".tmp", file);
}

const describeRun = (run) => (run.error ? `failed, ${run.error}` : run.results.map((r) => `${r.metric} ${r.value}`).join(", "));

export async function collect(options, log = console.log) {
  const { label, rounds, runs, branches, scenarios, resume, load } = options;
  const file = join(RESULTS, `${label}.json`);
  const results = resultsFile(existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : null, { label, runs, load }, { resume });
  const blocks = pendingBlocks(planRounds({ rounds, runs, branches, scenarios }), results.records);
  if (!blocks.length) return log(`Nothing to measure: results/${label}.json has every block of ${rounds} round(s)`);

  const busy = busyContainers(lines((await docker(["ps", "--format", "{{.Names}}"])).stdout));
  if (busy.length) throw new Error(`The lab is busy, these containers would share the CPU with the runs: ${busy.join(", ")}`);

  const refs = [BASELINE, ...new Set(blocks.flatMap((b) => b.branches))];
  const images = {};
  for (const ref of refs) {
    const { code, stdout } = await docker(["image", "inspect", "--format", "{{.Id}}", `${IMAGE}:${shopOf(ref).tag}`], { check: false });
    if (code !== 0) throw new Error(`There is no image ${IMAGE}:${shopOf(ref).tag}; build it with scripts/build-shop.sh ${ref}`);
    images[ref] = stdout.trim();
  }

  await mkdir(RESULTS, { recursive: true });
  const lab = lines((await compose(["ps", "--services", "--status", "running"])).stdout);
  const hostLoad = loadavg()[0];
  const { cleanup, generations } = await startLab(refs, { load, log });
  const stop = async (signal) => {
    log(`${signal}: stopping the lab of the experiment; --resume continues from the last saved block`);
    await cleanup();
    process.exit(130);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    const total = blocks.reduce((sum, b) => sum + b.sequence.length, 0);
    const start = Date.now();
    let done = 0;
    for (const block of blocks) {
      const scenario = SCENARIOS.find((s) => s.id === block.scenario);
      const runsByRef = Object.fromEntries([BASELINE, ...block.branches].map((ref) => [ref, []]));
      const generated = generations();
      for (const ref of block.sequence) {
        const { json, run } = await measureOnce(shopOf(ref).url, scenario);
        runsByRef[ref].push(run);
        if (json && !results.conditions) results.conditions = { ...conditionsOf(json), args: singleRun(CONDITIONS), images, lab, hostLoad };
        done++;
        log(progressLine({ done, total, elapsedMs: Date.now() - start, round: block.round, rounds, scenario: block.scenario, order: block.order, ref, value: describeRun(run) }));
      }
      results.records.push(...recordsOf(block, runsByRef, load ? { generations: generations() - generated } : {}));
      await save(file, results);
    }
    const seconds = (Date.now() - start) / 1000 / done;
    log(`${done} runs in ${formatDuration(Date.now() - start)}, ${seconds.toFixed(1)} s a run. Results in ${file}`);
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await cleanup();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await collect(optionsOf(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}
