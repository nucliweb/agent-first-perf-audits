// The prompt of the benchmark: the one of the Judge (agents/src/judge/prompt.ts), and for the mode
// without structured output, the JSON described in the system prompt.
import { SYSTEM, userPrompt } from "../../agents/src/judge/prompt.ts";

export { rulesAnswer } from "../../agents/src/judge/prompt.ts";

// Without structured output, the prompt has to describe the JSON
export const JSON_INSTRUCTIONS = `Answer with a single JSON object and nothing else, no code fence, with exactly these keys:
{"verdict": "pass" | "fail", "metric": "LCP" | "CLS" | "INP" | "none", "suspected_cause": string, "evidence": [string, up to 3], "confidence": "low" | "medium" | "high"}`;

export function messages(input, mode, target = null, suspects = undefined, matches = undefined) {
  const system = mode === "prompt" ? `${SYSTEM}\n\n${JSON_INSTRUCTIONS}` : SYSTEM;
  return [
    { role: "system", content: system },
    { role: "user", content: userPrompt(input, target, suspects, matches) },
  ];
}
