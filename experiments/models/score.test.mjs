import { test } from "node:test";
import assert from "node:assert/strict";
import { score } from "./score.mjs";

const LOAF = { verdict: "fail", metric: "INP", cause: "recommendFor|ab\\.js" };
const NOOP = { verdict: "pass", metric: "none", cause: null };

const answer = (overrides = {}) =>
  JSON.stringify({
    verdict: "fail",
    metric: "INP",
    suspected_cause: "The add to cart handler now calls recommendFor, which blocks the main thread.",
    evidence: ["recommendFor: 80 ms of self time in the candidate"],
    confidence: "high",
    ...overrides,
  });

test("a correct answer scores on every check", () => {
  assert.deepEqual(score(answer(), LOAF), { json: true, schema: true, verdict: true, metric: true, cause: true });
});

test("the cause has to be in the sentence, not only in the evidence", () => {
  const result = score(answer({ suspected_cause: "A new script blocks the load.", evidence: ["recommendFor runs for 80 ms"] }), LOAF);
  assert.equal(result.cause, false);
});

test("a wrong cause, metric or verdict fails only its own check", () => {
  const result = score(answer({ verdict: "pass", metric: "LCP", suspected_cause: "The hero image is lazy.", evidence: ["hero"] }), LOAF);
  assert.deepEqual(result, { json: true, schema: true, verdict: false, metric: false, cause: false });
});

test("text that is not JSON fails every check", () => {
  assert.deepEqual(score("The verdict is fail because of recommendFor.", LOAF), {
    json: false,
    schema: false,
    verdict: false,
    metric: false,
    cause: false,
  });
});

test("JSON wrapped in a code fence is not valid JSON", () => {
  assert.equal(score("```json\n" + answer() + "\n```", LOAF).json, false);
});

test("JSON outside the schema is valid JSON but fails the schema", () => {
  const result = score(answer({ confidence: 0.9 }), LOAF);
  assert.equal(result.json, true);
  assert.equal(result.schema, false);
  assert.equal(result.cause, true);
});

test("on a branch without regression, the cause is right when the sentence says nothing regressed", () => {
  const right = answer({ verdict: "pass", metric: "none", suspected_cause: "Nothing regressed: the diff only moves the hero into a component." });
  assert.equal(score(right, NOOP).cause, true);
});

test("on a branch without regression, a sentence that blames a change is wrong", () => {
  const invented = answer({
    verdict: "pass",
    metric: "none",
    suspected_cause: "The addition of the Hero component likely caused the regression of the LCP.",
  });
  assert.equal(score(invented, NOOP).cause, false);
});

test("a sentence that repeats the instructions of the prompt is wrong", () => {
  const parroted = answer({
    verdict: "pass",
    metric: "none",
    suspected_cause:
      "The change of the diff that most likely caused the regression of that metric, in one sentence. When the metric is 'none', say that nothing regressed.",
  });
  assert.equal(score(parroted, NOOP).cause, false);
});
