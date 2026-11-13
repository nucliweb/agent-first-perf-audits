// The explanation of a run of ci by another model, such as Claude in the demo on GitHub Actions:
// it reads the input of the Judge (input.json) and the report (report.json) of the run, asks the
// model with the same prompt and schema as the local LLM, and writes report-<model>.md, .html and
// .json, with the same verdict, metrics and facts of the rules. The lab has no internet access, so
// this runs after ci, outside the lab network.
//   node src/ci/explain.ts <folder of the run> [model]   (default claude-sonnet-5-5, ANTHROPIC_API_KEY)
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { claude } from "../judge/claude.ts";
import type { JudgeInput } from "../judge/types.ts";
import { explain, type Chat } from "../subagents/judge.ts";
import { reportHtml, reportMarkdown, type Report } from "./report.ts";

export async function explainRun(dir: string, model: string, chat: Chat): Promise<Report> {
  const input: JudgeInput = JSON.parse(await readFile(join(dir, "input.json"), "utf8"));
  const report: Report = JSON.parse(await readFile(join(dir, "report.json"), "utf8"));
  const { explanations } = await explain(input, chat);
  const explained: Report = { ...report, explanations, explainedBy: model };
  const name = join(dir, `report-${model}`);
  await writeFile(`${name}.json`, JSON.stringify(explained, null, 2) + "\n");
  await writeFile(`${name}.md`, reportMarkdown(explained));
  await writeFile(`${name}.html`, reportHtml(explained));
  return explained;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, model = "claude-sonnet-5-5"] = process.argv.slice(2);
  if (!dir) {
    console.error("Usage: node src/ci/explain.ts <folder of the run> [model]");
    process.exit(2);
  }
  const report = await explainRun(resolve(dir), model, claude(model));
  const failed = (report.explanations ?? []).filter((e) => e.error);
  for (const e of failed) console.error(`[explain] ${e.metric} in ${e.scenario}: ${e.error}`);
  console.error(`[explain] ${model}: report-${model}.md in ${dir}`);
  process.exitCode = failed.length ? 1 : 0;
}
