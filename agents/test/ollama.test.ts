// Checks the ollama service from inside the agents container: the model comes inside the image,
// so it answers on the lab network without access to the internet. With the lite profile there
// is no local LLM, and outside Docker Compose there is no service, so the tests are skipped.
import { test } from "node:test";
import assert from "node:assert/strict";

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
