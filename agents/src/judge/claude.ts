// The Judge with Claude instead of the local LLM: the same prompt and the same schema, through the
// Claude API. The workshop runs a small model on the CPU of a laptop; this is the same input for a
// larger one, as the handoff describes, so both explanations can be compared.
// Structured output does not take the length and array constraints of the schema, so they go in
// words at the end of the system prompt, and explain() validates the answer against the whole
// schema, as it does with Ollama.
import Anthropic from "@anthropic-ai/sdk";
import type { Chat } from "../subagents/judge.ts";

const UNSUPPORTED = new Set(["$schema", "$id", "minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum", "multipleOf"]);

// A copy of the schema without the keywords that structured output does not take
export function apiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(apiSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(Object.entries(schema).filter(([key]) => !UNSUPPORTED.has(key)).map(([key, value]) => [key, apiSchema(value)]));
}

// The limits that apiSchema leaves out, for the system prompt
export function limitsNote(schema: any): string {
  const cause = schema.properties.suspected_cause;
  const evidence = schema.properties.evidence;
  return `Keep suspected_cause within ${cause.maxLength} characters, and give ${evidence.minItems} to ${evidence.maxItems} evidences of at most ${evidence.items.maxLength} characters each.`;
}

// A Chat for explain(), with the key of ANTHROPIC_API_KEY. A refusal of the model is an error of
// the explanation, as a failed call to Ollama is: the verdict of the rules stands.
export function claude(model: string, client = new Anthropic()): Chat {
  return async (messages, schema) => {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content);
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      // On a refusal, the API runs the same request on the fallback model that fits its category
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [...system, limitsNote(schema)].join("\n\n"),
      messages: messages.filter((m) => m.role === "user").map((m) => ({ role: "user" as const, content: m.content })),
      output_config: { format: { type: "json_schema", schema: apiSchema(schema) as Record<string, unknown> } },
    });
    if (response.stop_reason === "refusal") throw new Error(`${model} declined to answer: ${response.stop_details?.category ?? "no category"}`);
    if (response.stop_reason === "max_tokens") throw new Error(`${model} reached max_tokens before the end of the answer`);
    return response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  };
}
