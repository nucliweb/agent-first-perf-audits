// The same input to the local model of the workshop and to a larger one. The inputs are the
// input.json of the Judge in the runs of the demo on GitHub Actions (same-input/inputs), where
// Claude Sonnet 5.5 explained each regression (same-input/answers/claude-sonnet-5-5.json, from the
// artifacts of the runs). This script asks llama3.2:3b with the same explain() of the Judge, cold,
// and writes same-input/answers/llama3.2-3b.json. Claude gets the same prompt plus one line with the
// length limits of the schema, which its structured output does not take (agents/src/judge/claude.ts).
// Usage: node same-input.mjs   (OLLAMA_URL, default http://127.0.0.1:11434)
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { explain, ollama } from "../../agents/src/subagents/judge.ts";
import { unloadAll } from "./bench.mjs";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "same-input");
const OLLAMA = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const MODEL = "llama3.2:3b";

const chat = ollama(OLLAMA, MODEL);
// Cold: the model is unloaded before each call, so no call reuses the prompt cache of another one
const cold = async (messages, schema) => {
  await unloadAll();
  return chat(messages, schema);
};

const answers = {};
for (const file of (await readdir(join(HERE, "inputs"))).sort()) {
  const input = JSON.parse(await readFile(join(HERE, "inputs", file), "utf8"));
  const ref = input.branch.replace(/^origin\//, "");
  answers[ref] = { explanations: (await explain(input, cold)).explanations };
  console.error(`${ref}: ${answers[ref].explanations.map((e) => `${e.metric} (${e.source})`).join(", ")}`);
}
await writeFile(join(HERE, "answers", `${MODEL.replace(":", "-")}.json`), JSON.stringify({ model: MODEL, source: "same-input.mjs, cold", answers }, null, 2) + "\n");
