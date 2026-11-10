// Scores one answer of a model against what a correct explanation says about the branch.
//   json:    the whole answer parses as JSON, with nothing around it
//   schema:  it follows agents/schemas/verdict.schema.json
//   verdict: it repeats the verdict of the rules
//   metric:  it repeats the metric of the rules
//   cause:   its sentence (suspected_cause) names the change of the branch, without copying the
//            prompt; on a branch without regression, it says there is none and blames nothing
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

// A sentence that says there is no regression, one that blames a change for one, and one that
// copies the instructions of the prompt instead of answering
const NO_REGRESSION = /\b(nothing|no metric|no performance) regress|\bno regression|\bdid not regress|\bdoes not regress/i;
const BLAME = /\bcaused the regression|\bled to (a|the) regression/i;
const PROMPT_WORDING = /most likely caused the regression of that metric|in one sentence/i;

export const SCHEMA = JSON.parse(readFileSync(new URL("../../agents/schemas/verdict.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ strict: false }).compile(SCHEMA);

export function score(content, expected) {
  let answer;
  try {
    answer = JSON.parse(content);
  } catch {
    return { json: false, schema: false, verdict: false, metric: false, cause: false };
  }
  if (typeof answer !== "object" || answer === null) {
    return { json: true, schema: false, verdict: false, metric: false, cause: false };
  }

  // The cause is the sentence: evidence that names the right change does not save a sentence that blames another
  const sentence = String(answer.suspected_cause ?? "");
  const parroted = PROMPT_WORDING.test(sentence);
  const cause = expected.cause
    ? !parroted && new RegExp(expected.cause, "i").test(sentence)
    : !parroted && answer.verdict === "pass" && answer.metric === "none" && NO_REGRESSION.test(sentence) && !BLAME.test(sentence);

  return {
    json: true,
    schema: validate(answer),
    verdict: answer.verdict === expected.verdict,
    metric: answer.metric === expected.metric,
    cause,
  };
}
