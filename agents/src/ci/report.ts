// The report of the ci service, in Markdown and in HTML. The verdict comes first and comes from the
// rules; the explanation of the LLM follows, with any discrepancy with the rules in sight, and then
// the facts of the rules: the lines of the diff they relate to each regressed metric. When the
// orchestrator runs the Judge, the findings of the subagents close the report.
import type { Finding } from "../judge/findings.ts";
import { SCHEMA } from "../judge/prompt.ts";
import type { Gate } from "../judge/types.ts";
import type { MetricExplanation } from "../subagents/judge.ts";

export interface Report {
  branch: string;
  baseline: string;
  profile: "llm" | "lite";
  conditions: string;
  verdict: "pass" | "fail";
  gate: Gate;
  // null in the lite profile: the explanation comes from the handoff
  explanations: MetricExplanation[] | null;
  // The lines of the diff that the rules relate to each regressed metric (lcp-loading.ts)
  ruleFacts?: RuleFacts[];
  // Only from the orchestrator: what the subagents measured for each regressed metric
  findings?: Finding[];
}

export interface RuleFacts {
  metric: string;
  scenario: string;
  facts: string[];
}

// The schema bounds each text and the grammar of the model stops it there: a text at the limit that
// does not end a sentence was cut. A complete sentence can fit the limit exactly.
const CAUSE_MAX = SCHEMA.properties.suspected_cause.maxLength;
const EVIDENCE_MAX = SCHEMA.properties.evidence.items.maxLength;
const marked = (text: string, max: number) => (text.length >= max && !/[.!?)]$/.test(text) ? `${text}…` : text);
const cause = (text: string) => marked(text, CAUSE_MAX);
const fact = (text: string) => marked(text, EVIDENCE_MAX);

const value = (metric: string, v: number) => (metric === "CLS" ? v.toFixed(3) : `${Math.round(v)} ms`);
const change = (d: number | null) => (d == null ? "" : `${d > 0 ? "+" : ""}${d} %`);

function metricRows(gate: Gate) {
  return gate.scenarios.flatMap(({ scenario, metrics }) =>
    Object.entries(metrics).map(([metric, m]) => [scenario, metric, value(metric, m.baseline), value(metric, m.candidate), change(m.deltaPercent), m.p == null ? "" : String(m.p), m.verdict]),
  );
}

const LITE =
  "The lite profile has no local LLM. To get the explanation, pass handoff.md (to paste into a chat) or handoff.json (for a script) to an agent. They carry the diff of the branch: sending it to an external service is a decision of each team for its own code.";

const discrepancyText = (d: { field: string; llm: string; rules: string }) => `The LLM said ${d.llm} for the ${d.field}; the rules decided ${d.rules}, and the rules win.`;

const heading = (e: MetricExplanation) => (e.metric === "none" ? "No regression" : `${e.metric} in ${e.scenario}`);

const FINDINGS = "Facts that the rules pick from what the subagents measured; the LLM does not see them.";
const findingHeading = (f: Finding) => `${f.metric} in ${f.scenario}, from the ${f.subagent} subagent`;

const RULE_FACTS = "Lines of the diff that the rules relate to each regressed metric; the LLM does not see them.";

function ruleFactsMarkdown(ruleFacts: RuleFacts[] | undefined): string[] {
  if (!ruleFacts?.length) return [];
  const lines = ["## Facts of the rules", "", RULE_FACTS, ""];
  for (const f of ruleFacts) lines.push(`### ${f.metric} in ${f.scenario}`, "", ...f.facts.map((fact) => `- ${fact}`), "");
  return lines;
}

function findingsMarkdown(findings: Finding[] | undefined): string[] {
  if (!findings) return [];
  const lines = ["## Findings of the subagents", "", FINDINGS, ""];
  for (const f of findings) lines.push(`### ${findingHeading(f)}`, "", ...f.facts.map((fact) => `- ${fact}`), "");
  return lines;
}

export function reportMarkdown(report: Report): string {
  const lines = [
    `# Performance gate: ${report.branch}`,
    "",
    `Verdict of the rules: **${report.verdict}**. Compared with ${report.baseline}, with ${report.conditions}.`,
    "",
    "## Metrics",
    "",
    "| Scenario | Metric | Baseline | Branch | Change | p | Verdict |",
    "|---|---|---|---|---|---|---|",
    ...metricRows(report.gate).map((cells) => `| ${cells.join(" | ")} |`),
    "",
    "## Explanation",
    "",
  ];
  if (!report.explanations) {
    lines.push(LITE, "");
    return [...lines, ...ruleFactsMarkdown(report.ruleFacts), ...findingsMarkdown(report.findings)].join("\n");
  }
  for (const e of report.explanations) {
    lines.push(`### ${heading(e)}`, "");
    if (!e.answer) {
      lines.push(`No explanation: ${e.error}`, "");
      continue;
    }
    lines.push(cause(e.answer.suspected_cause), "", ...e.answer.evidence.map((f) => `- ${fact(f)}`), "", `Confidence: ${e.answer.confidence}. Source: ${e.source === "llm" ? "the LLM" : "the rules"}.`, "");
    for (const d of e.discrepancies) lines.push(`> ${discrepancyText(d)}`, "");
  }
  return [...lines, ...ruleFactsMarkdown(report.ruleFacts), ...findingsMarkdown(report.findings)].join("\n");
}

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function reportHtml(report: Report): string {
  const title = `Performance gate: ${report.branch}`;
  const rows = metricRows(report.gate)
    .map((cells) => `<tr>${cells.map((c) => `<td>${escape(c)}</td>`).join("")}</tr>`)
    .join("\n");
  const explanations = !report.explanations
    ? `<p>${escape(LITE)}</p>`
    : report.explanations
        .map((e) => {
          const body = !e.answer
            ? `<p>No explanation: ${escape(e.error ?? "")}</p>`
            : [
                `<p>${escape(cause(e.answer.suspected_cause))}</p>`,
                `<ul>${e.answer.evidence.map((f) => `<li>${escape(fact(f))}</li>`).join("")}</ul>`,
                `<p class="meta">Confidence: ${escape(e.answer.confidence)}. Source: ${e.source === "llm" ? "the LLM" : "the rules"}.</p>`,
                ...e.discrepancies.map((d) => `<p class="discrepancy">${escape(discrepancyText(d))}</p>`),
              ].join("\n");
          return `<section><h3>${escape(heading(e))}</h3>\n${body}</section>`;
        })
        .join("\n");
  const ruleFacts = !report.ruleFacts?.length
    ? ""
    : [
        `<h2>Facts of the rules</h2>`,
        `<p class="meta">${escape(RULE_FACTS)}</p>`,
        ...report.ruleFacts.map((f) => `<section><h3>${escape(`${f.metric} in ${f.scenario}`)}</h3>\n<ul>${f.facts.map((fact) => `<li>${escape(fact)}</li>`).join("")}</ul></section>`),
      ].join("\n");
  const findings = !report.findings
    ? ""
    : [
        `<h2>Findings of the subagents</h2>`,
        `<p class="meta">${escape(FINDINGS)}</p>`,
        ...report.findings.map((f) => `<section><h3>${escape(findingHeading(f))}</h3>\n<ul>${f.facts.map((fact) => `<li>${escape(fact)}</li>`).join("")}</ul></section>`),
      ].join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  :root { color-scheme: light dark; --fail: #b42318; --pass: #067647; }
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border-bottom: 1px solid #8884; padding: .4rem .6rem; text-align: left; }
  .verdict { font-weight: 700; color: var(--${report.verdict}); }
  .meta { opacity: .75; }
  .discrepancy { border-left: 3px solid var(--fail); padding-left: .6rem; }
</style>
</head>
<body>
<h1>${escape(title)}</h1>
<p>Verdict of the rules: <span class="verdict">${report.verdict}</span>. Compared with ${escape(report.baseline)}, with ${escape(report.conditions)}.</p>
<h2>Metrics</h2>
<table>
<thead><tr><th>Scenario</th><th>Metric</th><th>Baseline</th><th>Branch</th><th>Change</th><th>p</th><th>Verdict</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<h2>Explanation</h2>
${explanations}
${ruleFacts}
${findings}
</body>
</html>
`;
}
