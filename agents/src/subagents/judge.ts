// The Judge explains the verdict of the gate. The rules decide the verdict and which metrics to
// explain, find the suspects in the traces and relate them to the diff; the LLM only writes the
// explanation of each regressed metric, as JSON constrained by the schema of the verdict. When it
// contradicts the rules, the rules win and the discrepancy is marked.
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { matchSuspects } from "../judge/match.ts";
import { rulesAnswer, SYSTEM, userPrompt } from "../judge/prompt.ts";
import { regressedMetrics } from "../judge/rules.ts";
import { suspectsFor } from "../judge/suspects.ts";
import type { Explanation, JudgeInput, MetricName } from "../judge/types.ts";

export const SCHEMA = JSON.parse(readFileSync(new URL("../../schemas/verdict.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: false });
const validate = ajv.compile(SCHEMA);

// The options of the model benchmark (experiments/models): the same answers for the same input
const OPTIONS = { temperature: 0, seed: 42, num_ctx: 8192 };

export interface Message {
  role: "system" | "user";
  content: string;
}

// Sends the messages to an LLM with the schema as structured output and returns its text
export type Chat = (messages: Message[], schema: object) => Promise<string>;

export interface Discrepancy {
  field: "verdict" | "metric";
  llm: string;
  rules: string;
}

export interface MetricExplanation {
  metric: MetricName | "none";
  scenario: string | null;
  source: "rules" | "llm";
  answer: Explanation | null;
  discrepancies: Discrepancy[];
  error?: string;
}

export interface JudgeReport {
  verdict: "pass" | "fail";
  explanations: MetricExplanation[];
}

export function ollama(url: string, model: string): Chat {
  return async (messages, schema) => {
    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      body: JSON.stringify({ model, messages, stream: false, format: schema, options: OPTIONS }),
    });
    if (!res.ok) throw new Error(`Ollama answered ${res.status}: ${await res.text()}`);
    return (await res.json()).message.content;
  };
}

// The answer of the LLM for one metric, checked against the schema and against the rules
function checked(content: string, rules: { verdict: string; metric: string }) {
  let answer: Explanation;
  try {
    answer = JSON.parse(content);
  } catch {
    return { answer: null, discrepancies: [], error: `The answer is not JSON: ${content.slice(0, 200)}` };
  }
  if (!validate(answer)) {
    return { answer: null, discrepancies: [], error: `The answer breaks the schema: ${ajv.errorsText(validate.errors)}` };
  }
  const discrepancies: Discrepancy[] = [];
  for (const field of ["verdict", "metric"] as const) {
    if (answer[field] !== rules[field]) discrepancies.push({ field, llm: answer[field], rules: rules[field] });
  }
  return { answer: { ...answer, ...rules } as Explanation, discrepancies };
}

export async function explain(input: JudgeInput, chat: Chat): Promise<JudgeReport> {
  const verdict = input.gate.verdict;
  const targets = regressedMetrics(input.gate.scenarios);

  // Without a regression there is nothing to explain, and a question would only give a small
  // model the chance to invent one
  if (!targets.length) {
    return { verdict, explanations: [{ metric: "none", scenario: null, source: "rules", answer: rulesAnswer(input), discrepancies: [] }] };
  }

  // One call at a time: a single model on the CPU of a laptop
  const explanations: MetricExplanation[] = [];
  for (const target of targets) {
    const suspects = suspectsFor(input.traces, target);
    const matches = matchSuspects(suspects, input.diff);
    const messages: Message[] = [
      { role: "system", content: SYSTEM },
      { role: "user", content: userPrompt(input, target, suspects, matches) },
    ];
    const base = { metric: target.metric as MetricName, scenario: target.scenario, source: "llm" as const };
    try {
      const content = await chat(messages, SCHEMA);
      explanations.push({ ...base, ...checked(content, { verdict, metric: target.metric }) });
    } catch (error) {
      explanations.push({ ...base, answer: null, discrepancies: [], error: (error as Error).message });
    }
  }
  return { verdict, explanations };
}
