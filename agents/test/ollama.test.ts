// Checks the ollama service from inside the agents container: the model comes inside the image,
// so it answers on the lab network without access to the internet. With the lite profile there
// is no local LLM, and outside Docker Compose there is no service, so the tests are skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { requestsFor, SCHEMA } from "../src/judge/prompt.ts";
import { ollama } from "../src/subagents/judge.ts";

const OLLAMA_URL = process.env.OLLAMA_URL;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL;
const profiles = (process.env.COMPOSE_PROFILES ?? "").split(",");
const skip = !OLLAMA_URL || !OLLAMA_MODEL
  ? "only inside Docker Compose"
  : !profiles.includes("llm")
    ? "the lite profile has no local LLM"
    : false;

test("the ollama service has the model of the Judge without pulling it", { skip }, async () => {
  const { models } = await (await fetch(`${OLLAMA_URL}/api/tags`)).json();
  assert.deepEqual(models.map((m: { name: string }) => m.name), [OLLAMA_MODEL]);
});

test("the model answers JSON constrained by a schema", { skip, timeout: 180_000 }, async () => {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages: [{ role: "user", content: "Is 1000 ms slower than 500 ms? Answer in JSON." }],
      format: {
        type: "object",
        properties: { slower: { type: "boolean" } },
        required: ["slower"],
      },
      options: { temperature: 0, seed: 42 },
    }),
  });
  assert.equal(res.status, 200, await res.clone().text());
  const { message } = await res.json();
  assert.deepEqual(JSON.parse(message.content), { slower: true });
});

// The answers of the benchmark (experiments/models, the quotes stage) are cold: the model unloaded before
// each call, so no call reuses the prompt cache of another. Cold, the image of the workshop has to
// give the same answers, or the figures of the benchmark do not hold for it. It needs the fixtures
// of the experiment: on the host, or mounted with -v "$PWD/experiments:/experiments:ro".
const BENCHMARK = new URL("../../experiments/models/", import.meta.url);
const skipBenchmark = skip || (!existsSync(new URL("results/quotes.json", BENCHMARK)) && "needs experiments/models");

test("cold, the model gives the answers of the benchmark", { skip: skipBenchmark, timeout: 600_000 }, async () => {
  const saved = JSON.parse(readFileSync(new URL("results/quotes.json", BENCHMARK), "utf8"));
  const chat = ollama(OLLAMA_URL!, OLLAMA_MODEL!);
  const fixtures = readdirSync(new URL("fixtures/", BENCHMARK)).filter((f) => f.endsWith(".json")).sort();
  let cases = 0;
  for (const file of fixtures) {
    const { ref, input } = JSON.parse(readFileSync(new URL(`fixtures/${file}`, BENCHMARK), "utf8"));
    for (const { target, messages } of requestsFor(input)) {
      await unload();
      const expected = saved.find((r: { ref: string; metric: string; rep: number }) => r.ref === ref && r.metric === target.metric && r.rep === 0);
      assert.equal(await chat(messages, SCHEMA), expected.content, `${ref} ${target.metric}`);
      cases++;
    }
  }
  assert.equal(cases, 4);
});

async function unload() {
  await fetch(`${OLLAMA_URL}/api/generate`, { method: "POST", body: JSON.stringify({ model: OLLAMA_MODEL, keep_alive: 0 }) });
  for (let i = 0; i < 50; i++) {
    const { models } = await (await fetch(`${OLLAMA_URL}/api/ps`)).json();
    if (!models.length) return;
    await new Promise((ok) => setTimeout(ok, 200));
  }
}
