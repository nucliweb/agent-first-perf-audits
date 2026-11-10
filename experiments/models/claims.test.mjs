// Checks the figures of the documentation against the saved runs of results/. The answers are
// deterministic, so the test scores them again with the current score.mjs instead of calling the
// models: if a change of the scoring moves a figure, this test fails and the docs need an update.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadFixtures, rescoreRows, summarize } from "./bench.mjs";

const load = async (name) => JSON.parse(await readFile(new URL(`results/${name}.json`, import.meta.url), "utf8"));
const ofModel = (summary, model, mode = "schema") => summary.find((s) => s.model === model && s.mode === mode);
const causes = (summary, model) => Math.round(ofModel(summary, model).cause * ofModel(summary, model).calls);

let fixtures;
before(async () => {
  fixtures = await loadFixtures();
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
