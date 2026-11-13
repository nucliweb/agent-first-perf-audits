// The handoff of the Judge: the input that the local LLM gets, written for an external agent, such
// as one in the cloud. The lite profile has no local LLM, so the handoff is how it gets the
// explanation; with the llm profile it lets you compare both explanations of the same input.
// The same input gives the same files.
import { requestsFor, rulesAnswer, SCHEMA, SYSTEM } from "./prompt.ts";
import type { Explanation, JudgeInput } from "./types.ts";

export const PRIVACY =
  "The requests carry the diff of the branch and the trace summaries of the pages. Sending them to an external service is a decision of each team for its own code.";

export const MODELS =
  "The local model of the workshop is small, so it runs on the CPU of a laptop next to Chromium, and with several changes in the diff it can name only one. A larger model, such as Claude Sonnet or Opus or Gemini, gets the same input here and can relate every change of the diff to the regression.";

export interface Handoff {
  branch: string;
  verdict: "pass" | "fail";
  privacy: string;
  models: string;
  instructions: string;
  system: string;
  requests: { metric: string; scenario: string; prompt: string }[];
  schema: object;
  // The answer of the rules when nothing regressed: there is nothing to ask
  rulesAnswer: Explanation | null;
}

const INSTRUCTIONS =
  "The verdict of the gate is decided: do not change it. For each request, send the system prompt and the prompt of the request to the model, and get one JSON object that follows the schema.";

export function handoffOf(input: JudgeInput): Handoff {
  const requests = requestsFor(input).map(({ target, messages }) => ({ metric: target.metric, scenario: target.scenario, prompt: messages[1].content }));
  return {
    branch: input.branch,
    verdict: input.gate.verdict,
    privacy: PRIVACY,
    models: MODELS,
    instructions: INSTRUCTIONS,
    system: SYSTEM,
    requests,
    schema: SCHEMA,
    rulesAnswer: requests.length ? null : rulesAnswer(input),
  };
}

// A fence longer than any run of backticks in the text, so a diff with code fences stays inside
function fenced(text: string, lang = "text") {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${lang}\n${text}\n${fence}`;
}

export function handoffMarkdown(handoff: Handoff): string {
  const lines = [
    `# Handoff of the Judge: ${handoff.branch}`,
    "",
    `> ${handoff.privacy}`,
    "",
    `> ${handoff.models}`,
    "",
    `The rules of the gate decided the verdict: **${handoff.verdict}**.`,
    "",
  ];
  if (!handoff.requests.length) {
    lines.push("Nothing to explain: no metric regressed, so the Judge does not ask a model. The answer of the rules:", "", fenced(JSON.stringify(handoff.rulesAnswer, null, 2), "json"), "");
    return lines.join("\n");
  }
  lines.push(
    "## How to use it",
    "",
    `You are the Judge of a web performance gate. Below are a system prompt, ${handoff.requests.length} request${handoff.requests.length > 1 ? "s" : ""} and a JSON schema. Answer each request on its own, following the system prompt, with one JSON object that follows the schema and nothing else.`,
    "",
    "## System prompt",
    "",
    fenced(handoff.system),
    "",
  );
  handoff.requests.forEach((request, i) => {
    lines.push(`## Request ${i + 1}: ${request.metric} in ${request.scenario}`, "", fenced(request.prompt), "");
  });
  lines.push("## Schema of each answer", "", fenced(JSON.stringify(handoff.schema, null, 2), "json"), "");
  return lines.join("\n");
}
