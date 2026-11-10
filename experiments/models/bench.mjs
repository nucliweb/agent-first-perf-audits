// Benchmark of the candidate models of the Judge in Ollama, with the fixtures of fixtures/:
// latency, valid JSON, schema, agreement with the rules, right cause and memory. A case is one
// regressed metric of a branch, or the branch itself when nothing regressed. Each model can run
// in two modes: with the schema as structured output (format) and with the JSON only described
// in the prompt. A Chromium stays open in another container, as it would in the lab.
// Usage: node bench.mjs [model...]
//        node bench.mjs --rescore [file]   scores saved answers again, without models (default out/results.json)
//   OLLAMA_URL (default http://127.0.0.1:11434), REPS (default 3), MODES (default schema,prompt),
//   STAGE: how much the rules do before the LLM, one stage on top of the other
//     llm       the rules decide the verdict and the metric to explain
//     suspects  and the prompt lists the suspects of the traces (agents/src/judge/suspects.ts)
//     rules     and a branch without regression gets no LLM call, and the prompt gives the cause
//               that the rules matched with a line of the diff (agents/src/judge/match.ts). The default
import { execFileSync } from "node:child_process";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchSuspects } from "../../agents/src/judge/match.ts";
import { messages, rulesAnswer } from "./prompt.mjs";
import { regressedMetrics } from "../../agents/src/judge/rules.ts";
import { suspectsFor } from "../../agents/src/judge/suspects.ts";
import { SCHEMA, score } from "./score.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OLLAMA = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_CONTAINER = process.env.OLLAMA_CONTAINER ?? "ollama-bench";
const CHROMIUM_CONTAINER = "bench-chromium";
const AGENTS_IMAGE = "ghcr.io/nucliweb/agent-first-perf-audits/agents:main";
const REPS = Number(process.env.REPS ?? 3);

// The candidates of the plan. qwen3 runs without thinking: the Judge needs an answer, not a trace
export const MODELS = [
  { id: "qwen3:1.7b", think: false },
  { id: "qwen2.5-coder:1.5b" },
  { id: "llama3.2:3b" },
  { id: "gemma3:1b" },
];
export const MODES = (process.env.MODES ?? "schema,prompt").split(",");
export const STAGES = ["llm", "suspects", "rules"];
const STAGE = process.env.STAGE ?? "rules";
if (!STAGES.includes(STAGE)) throw new Error(`STAGE must be one of ${STAGES.join(", ")}`);
const OPTIONS = { temperature: 0, seed: 42, num_ctx: 8192 };

// One case per regressed metric of a branch, as the Judge asks; one case for a branch without regression
export function casesOf(fixture) {
  const targets = regressedMetrics(fixture.input.gate.scenarios);
  const verdict = fixture.input.gate.verdict;
  if (!targets.length) return [{ fixture, target: null, suspects: [], matches: [], expected: { verdict, metric: "none", cause: null } }];
  return targets.map((target) => {
    const suspects = suspectsFor(fixture.input.traces, target);
    return {
      fixture,
      target,
      suspects,
      matches: matchSuspects(suspects, fixture.input.diff),
      expected: { verdict, metric: target.metric, cause: fixture.expected[target.metric] },
    };
  });
}

// The answer of one case at a stage: from the rules alone, or from the model with what the rules found
async function answer(model, mode, { fixture, target, suspects, matches }, stage = STAGE) {
  if (stage === "rules" && !target) return { content: JSON.stringify(rulesAnswer(fixture.input)), source: "rules", wallMs: 0 };
  const call = await chat(model, mode, fixture.input, target, stage === "llm" ? undefined : suspects, stage === "rules" ? matches : undefined);
  return { ...call, source: "llm" };
}

async function chat(model, mode, input, target = null, suspects = undefined, matches = undefined) {
  const body = {
    model: model.id,
    messages: input ? messages(input, mode, target, suspects, matches) : [{ role: "user", content: "Reply with OK." }],
    stream: false,
    keep_alive: "10m",
    options: OPTIONS,
    ...(mode === "schema" ? { format: SCHEMA } : {}),
    ...(model.think === false ? { think: false } : {}),
  };
  const start = performance.now();
  const res = await fetch(`${OLLAMA}/api/chat`, { method: "POST", body: JSON.stringify(body) });
  // A model that loops is an answer of the benchmark too, such as "token repeat limit reached"
  if (!res.ok) return { content: "", error: `${res.status} ${await res.text()}`, wallMs: Math.round(performance.now() - start) };
  const data = await res.json();
  return {
    content: data.message.content,
    wallMs: Math.round(performance.now() - start),
    loadMs: Math.round((data.load_duration ?? 0) / 1e6),
    promptTokens: data.prompt_eval_count,
    promptMs: Math.round((data.prompt_eval_duration ?? 0) / 1e6),
    outputTokens: data.eval_count,
    outputMs: Math.round((data.eval_duration ?? 0) / 1e6),
  };
}

const loadedModels = async () => (await (await fetch(`${OLLAMA}/api/ps`)).json()).models ?? [];

async function unloadAll() {
  for (const { name } of await loadedModels()) {
    await fetch(`${OLLAMA}/api/generate`, { method: "POST", body: JSON.stringify({ model: name, keep_alive: 0 }) });
  }
  for (let i = 0; i < 50 && (await loadedModels()).length; i++) await new Promise((ok) => setTimeout(ok, 200));
}

// The memory Ollama gives to a loaded model, weights and context, in MiB
async function loadedMiB(id) {
  const model = (await loadedModels()).find((m) => m.name === id || m.model === id);
  return model ? Math.round(model.size / 2 ** 20) : null;
}

// Memory of a container, in MiB, as docker stats reports it
function memoryMiB(container) {
  const usage = execFileSync("docker", ["stats", container, "--no-stream", "--format", "{{.MemUsage}}"], { encoding: "utf8" });
  const [, value, unit] = usage.match(/^([\d.]+)\s*([KMG]i?B)/) ?? [];
  const factor = { KiB: 1 / 1024, MiB: 1, GiB: 1024, KB: 1 / 1024, MB: 1, GB: 1024 }[unit] ?? 0;
  return Math.round(Number(value) * factor);
}

// Samples the peak memory of the containers while fn runs
async function withPeakMemory(containers, fn) {
  const peaks = Object.fromEntries(containers.map((c) => [c, 0]));
  let running = true;
  const sampler = (async () => {
    while (running) {
      for (const c of containers) peaks[c] = Math.max(peaks[c], memoryMiB(c));
      await new Promise((ok) => setTimeout(ok, 1000));
    }
  })();
  try {
    const result = await fn();
    return { result, peaks };
  } finally {
    running = false;
    await sampler;
  }
}

function startChromium() {
  execFileSync("docker", ["rm", "-f", CHROMIUM_CONTAINER], { stdio: "ignore" });
  const script = `const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setContent("<h1>Idle Chromium of the benchmark</h1>");
  setInterval(() => {}, 1 << 30);
})();`;
  execFileSync("docker", ["run", "-d", "--rm", "--name", CHROMIUM_CONTAINER, AGENTS_IMAGE, "node", "-e", script], { stdio: "ignore" });
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};
const rate = (rows, check) => rows.filter((r) => r.score[check]).length / rows.length;

export function summarize(rows) {
  const groups = {};
  for (const row of rows) (groups[`${row.model}|${row.mode}`] ??= []).push(row);
  return Object.entries(groups).map(([key, group]) => {
    const [model, mode] = key.split("|");
    return {
      model,
      mode,
      calls: group.length,
      errors: group.filter((r) => r.error).length,
      llmCalls: group.filter((r) => r.source !== "rules").length,
      // The answers of the rules take no time; the latency is the one of the model
      p50Ms: median(group.filter((r) => r.source !== "rules").map((r) => r.wallMs)),
      json: rate(group, "json"),
      schema: rate(group, "schema"),
      verdict: rate(group, "verdict"),
      metric: rate(group, "metric"),
      cause: rate(group, "cause"),
      modelMiB: group[0].modelMiB,
      peakOllamaMiB: group[0].peakOllamaMiB,
      peakChromiumMiB: group[0].peakChromiumMiB,
    };
  });
}

export async function bench(modelIds = MODELS.map((m) => m.id)) {
  const fixtures = await loadFixtures();
  const models = MODELS.filter((m) => modelIds.includes(m.id));
  const cases = fixtures.flatMap(casesOf);

  startChromium();
  const rows = [];
  try {
    for (const model of models) {
      // One model in memory at a time: Ollama keeps a model loaded for keep_alive after its last call
      await unloadAll();
      // The first call only loads the model; it does not count
      const warmup = await chat(model, "prompt", null);
      const modelMiB = await loadedMiB(model.id);
      const { peaks } = await withPeakMemory([OLLAMA_CONTAINER, CHROMIUM_CONTAINER], async () => {
        // Cases change from one call to the next, so no call reuses the whole prompt of the previous one
        for (let rep = 0; rep < REPS; rep++) {
          for (const mode of MODES) {
            for (const one of cases) {
              const call = await answer(model, mode, one);
              const metric = one.target?.metric ?? "none";
              rows.push({ model: model.id, mode, stage: STAGE, ref: one.fixture.ref, metric, rep, ...call, score: score(call.content, one.expected) });
              process.stdout.write(".");
            }
          }
        }
      });
      for (const row of rows.filter((r) => r.model === model.id)) {
        row.peakOllamaMiB = peaks[OLLAMA_CONTAINER];
        row.peakChromiumMiB = peaks[CHROMIUM_CONTAINER];
        row.modelMiB = modelMiB;
        row.warmupLoadMs = warmup.loadMs;
      }
      console.log(` ${model.id}`);
    }
  } finally {
    await unloadAll();
    execFileSync("docker", ["rm", "-f", CHROMIUM_CONTAINER], { stdio: "ignore" });
  }
  await mkdir(join(HERE, "out"), { recursive: true });
  await writeFile(join(HERE, "out/results.json"), JSON.stringify(rows, null, 2));
  return rows;
}

export async function loadFixtures() {
  const files = (await readdir(join(HERE, "fixtures"))).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(join(HERE, "fixtures", f), "utf8"))));
}

// Scores saved answers again with the current score.mjs, without calling any model: the answers
// are deterministic (temperature 0 and a fixed seed). It needs the rows of a run with one case per
// metric (the runs of results/ from 2 on); the first run had one case per branch.
export function rescoreRows(rows, fixtures) {
  const expected = new Map(fixtures.flatMap(casesOf).map((c) => [`${c.fixture.ref}|${c.target?.metric ?? "none"}`, c.expected]));
  return rows.map((row) => ({ ...row, score: score(row.content, expected.get(`${row.ref}|${row.metric}`)) }));
}

export async function rescore(file = join(HERE, "out/results.json")) {
  const rows = rescoreRows(JSON.parse(await readFile(file, "utf8")), await loadFixtures());
  await writeFile(file, JSON.stringify(rows, null, 2) + "\n");
  return rows;
}

const pct = (v) => `${Math.round(v * 100)} %`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const ids = args.filter((a) => !a.startsWith("--"));
  const rows = args.includes("--rescore") ? await rescore(ids[0]) : await bench(ids.length ? ids : undefined);
  console.log("\n| Modelo | Modo | Casos | Llamadas al LLM | Errores | Latencia p50 | JSON | Schema | Veredicto | Métrica | Causa | RAM del modelo | Pico de Ollama | Pico de Chromium |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const s of summarize(rows)) {
    console.log(
      `| \`${s.model}\` | ${s.mode} | ${s.calls} | ${s.llmCalls} | ${s.errors} | ${(s.p50Ms / 1000).toFixed(1).replace(".", ",")} s | ${pct(s.json)} | ${pct(s.schema)} | ${pct(s.verdict)} | ${pct(s.metric)} | ${pct(s.cause)} | ${s.modelMiB} MiB | ${s.peakOllamaMiB} MiB | ${s.peakChromiumMiB} MiB |`,
    );
  }
}
