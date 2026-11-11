// Checks the figures of the documentation against the saved runs of results/. It scores the saved
// answers again with the current score.mjs instead of calling the models: if a change of the
// scoring moves a figure, this test fails and the docs need an update. With temperature 0 and a
// fixed seed the answers are deterministic cold (runs 5 and 6); warm, the prompt cache of Ollama
// can change the wording of an answer (runs 1 to 4).
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadFixtures, rescoreRows, summarize } from "./bench.mjs";

// The runs of 2026-11-10 and 11, with the fixtures they were measured on
const HISTORY = new URL("history/2026-11-10/", import.meta.url);
const load = async (name) => JSON.parse(await readFile(new URL(`results/${name}.json`, HISTORY), "utf8"));
const ofModel = (summary, model, mode = "schema") => summary.find((s) => s.model === model && s.mode === mode);
const causes = (summary, model) => Math.round(ofModel(summary, model).cause * ofModel(summary, model).calls);

let fixtures;
before(async () => {
  fixtures = await loadFixtures(fileURLToPath(new URL("fixtures/", HISTORY)));
});

test("run 1: with the schema every model returns valid JSON; in the prompt alone qwen2.5-coder never does", async () => {
  const summary = summarize(await load("1-free-metric"));
  for (const model of ["qwen3:1.7b", "qwen2.5-coder:1.5b", "llama3.2:3b", "gemma3:1b"]) {
    assert.equal(ofModel(summary, model).json, 1, model);
    assert.ok(ofModel(summary, model, "prompt").json <= ofModel(summary, model).json, model);
  }
  assert.equal(ofModel(summary, "qwen2.5-coder:1.5b", "prompt").json, 0);
});

test("run 2: with the metric of the rules, llama3.2:3b names the cause in 9 of 15 answers", async () => {
  const summary = summarize(rescoreRows(await load("2-metric-by-rules"), fixtures));
  assert.equal(causes(summary, "llama3.2:3b"), 9);
  assert.equal(causes(summary, "qwen3:1.7b"), 6);
  assert.equal(causes(summary, "qwen2.5-coder:1.5b"), 6);
  assert.equal(causes(summary, "gemma3:1b"), 0);
  for (const s of summary) assert.equal(s.metric, 1, `${s.model} repeats the metric of the rules`);
});

test("run 3: the suspects of the traces barely help, llama3.2:3b stays at 9 of 15", async () => {
  const summary = summarize(rescoreRows(await load("3-suspects"), fixtures));
  assert.equal(causes(summary, "llama3.2:3b"), 9);
  assert.equal(causes(summary, "qwen3:1.7b"), 8);
  assert.equal(causes(summary, "qwen2.5-coder:1.5b"), 6);
  assert.equal(causes(summary, "gemma3:1b"), 0);
});

test("run 4: with the cause matched by the rules, llama3.2:3b names it in 14 of 15 answers", async () => {
  const rows = rescoreRows(await load("4-rules"), fixtures);
  const summary = summarize(rows);
  assert.equal(causes(summary, "llama3.2:3b"), 14);
  assert.equal(ofModel(summary, "llama3.2:3b").llmCalls, 12, "the branch without regression gets no LLM call");
  const missed = rows.filter((r) => !r.score.cause);
  assert.deepEqual(missed.map((r) => `${r.ref} ${r.metric}`), ["pr/lcp-hero-lazy LCP"]);
});

const causeOf = (row) => JSON.parse(row.content).suspected_cause;
const heroRows = (rows) => rows.filter((r) => r.ref === "pr/lcp-hero-lazy");

test("run 5, cold: without escaping the quotes, the sentence of the hero ends in loading= every time", async () => {
  const rows = rescoreRows(await load("5-rules-cold"), fixtures);
  assert.ok(rows.every((r) => r.cold));
  assert.equal(causes(summarize(rows), "llama3.2:3b"), 12);
  for (const row of heroRows(rows)) assert.match(causeOf(row), /`loading=$/);
});

test("run 6, cold: with the quotes escaped, llama3.2:3b names the cause in 15 of 15 answers", async () => {
  const rows = rescoreRows(await load("6-quotes-cold"), fixtures);
  assert.ok(rows.every((r) => r.cold));
  assert.equal(causes(summarize(rows), "llama3.2:3b"), 15);
  for (const row of heroRows(rows)) assert.match(causeOf(row), /`loading="lazy"` attribute/);
});

test("cold, the three repetitions of each case give the same answer", async () => {
  for (const run of ["5-rules-cold", "6-quotes-cold"]) {
    const byCase = Map.groupBy(await load(run), (r) => `${r.ref} ${r.metric}`);
    for (const [name, rows] of byCase) assert.equal(new Set(rows.map((r) => r.content)).size, 1, `${run}: ${name}`);
  }
});

test("warm, the same case can get another wording: the sentence of the hero changes after the first repetition of run 4", async () => {
  const hero = heroRows(await load("4-rules"));
  assert.equal(new Set(hero.map((r) => r.content)).size, 2);
  assert.match(causeOf(hero.find((r) => r.rep === 0)), /`loading=$/);
});

test("runs 4 to 6: none of the 108 evidences of llama3.2:3b reaches the limit of 200 characters of the schema", async () => {
  let evidences = 0;
  for (const run of ["4-rules", "5-rules-cold", "6-quotes-cold"]) {
    for (const row of (await load(run)).filter((r) => r.source === "llm")) {
      for (const fact of JSON.parse(row.content).evidence) {
        evidences++;
        assert.ok(fact.length < 200, `${run} ${row.ref}: ${fact}`);
      }
    }
  }
  assert.equal(evidences, 108);
});

// The runs on the current fixtures: cold, one repetition (cold, every repetition is the same)
const loadCurrent = async (stage) => JSON.parse(await readFile(new URL(`results/${stage}.json`, import.meta.url), "utf8"));
let current;
before(async () => {
  current = await loadFixtures();
});

test("current fixtures, llm and suspects: llama3.2:3b names the cause in 3 of 5, and no model does better", async () => {
  const expected = { llm: { "llama3.2:3b": 3, "qwen3:1.7b": 2, "qwen2.5-coder:1.5b": 2, "gemma3:1b": 0 }, suspects: { "llama3.2:3b": 3, "qwen3:1.7b": 3, "qwen2.5-coder:1.5b": 2, "gemma3:1b": 0 } };
  for (const [stage, byModel] of Object.entries(expected)) {
    const rows = rescoreRows(await loadCurrent(stage), current);
    assert.ok(rows.every((r) => r.cold));
    const summary = summarize(rows);
    for (const [model, n] of Object.entries(byModel)) assert.equal(causes(summary, model), n, `${stage} ${model}`);
    for (const s of summary) assert.equal(s.schema, 1, `${stage} ${s.model} follows the schema`);
  }
});

test("current fixtures, rules and quotes: llama3.2:3b names the cause in 5 of 5, with 4 calls to the LLM", async () => {
  for (const stage of ["rules", "quotes"]) {
    const summary = summarize(rescoreRows(await loadCurrent(stage), current));
    assert.equal(causes(summary, "llama3.2:3b"), 5, stage);
    assert.equal(ofModel(summary, "llama3.2:3b").llmCalls, 4, stage);
  }
});

test("current fixtures: without escaping, the hero sentence mixes loading with fetchPriority; escaped, it names the attribute", async () => {
  const [rules] = heroRows(await loadCurrent("rules"));
  const [quotes] = heroRows(await loadCurrent("quotes"));
  assert.match(causeOf(rules), /'loading' attribute to the 'fetchPriority' property/);
  assert.match(causeOf(quotes), /`loading="lazy"` attribute to the `img`/);
});

test("current fixtures, rules and quotes: one of the 22 evidences fits the limit of 200 characters exactly, as a complete sentence", async () => {
  const facts = [];
  for (const stage of ["rules", "quotes"]) {
    for (const row of (await loadCurrent(stage)).filter((r) => r.source === "llm")) facts.push(...JSON.parse(row.content).evidence);
  }
  assert.equal(facts.length, 22);
  const atLimit = facts.filter((f) => f.length >= 200);
  assert.equal(atLimit.length, 1);
  assert.match(atLimit[0], /\.$/);
});

test("current fixtures, quotes warm: 12 calls to llama3.2:3b with a median of 23.2 s, from 13.7 to 40.3 s", async () => {
  const rows = (await loadCurrent("quotes-warm")).filter((r) => r.source === "llm");
  assert.ok(rows.every((r) => !r.cold));
  const ms = rows.map((r) => r.wallMs).sort((a, b) => a - b);
  assert.equal(ms.length, 12);
  assert.equal(summarize(rows)[0].p50Ms, 23217);
  assert.equal(Math.round(ms[0] / 100) / 10, 13.7);
  assert.equal(Math.round(ms.at(-1) / 100) / 10, 40.3);
  assert.equal(rows.filter((r) => r.score.cause).length, 12);
});
