// The Judge with Claude: the schema of the verdict as the API takes it for structured output, and
// the limits that the API does not take, said in the system prompt. The answer is still validated
// against the whole schema by the Judge, as with the local LLM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apiSchema, limitsNote } from "../../src/judge/claude.ts";
import { SCHEMA } from "../../src/judge/prompt.ts";

test("leaves out the constraints that structured output does not take, and keeps the rest", () => {
  const schema = apiSchema(SCHEMA) as any;
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, SCHEMA.required);
  assert.deepEqual(schema.properties.metric.enum, ["LCP", "CLS", "INP", "none"]);
  assert.equal(schema.properties.evidence.items.type, "string");
  const text = JSON.stringify(schema);
  for (const keyword of ["minLength", "maxLength", "minItems", "maxItems", "$schema", "$id"]) assert.ok(!text.includes(`"${keyword}"`), keyword);
});

test("does not change the schema of the Judge", () => {
  apiSchema(SCHEMA);
  assert.equal(SCHEMA.properties.suspected_cause.maxLength, 300);
});

test("says the limits of the schema in words", () => {
  assert.equal(
    limitsNote(SCHEMA),
    "Keep suspected_cause within 300 characters, and give 1 to 3 evidences of at most 200 characters each.",
  );
});
