// The facts of the rules for a regressed LCP: the LCP element of the trace of each side and the
// lines of the diff that change how it loads. A branch can slow the LCP down without adding any
// task to the trace, such as pr/lcp-hero-lazy, which removes the preload and the fetch priority of
// the hero and makes it lazy: there is no suspect to match, but the diff says how the image loads.
// They go into the report next to the explanation of the LLM, which does not see them, so the
// prompt and the figures of the model benchmark stay as they are.
import type { JudgeInput, Target } from "./types.ts";

interface LcpElement {
  element: string;
  path: string;
}

// The LCP element and the path of its image in an overview summary of trace-engine-cli
function lcpOf(overview?: string): LcpElement | null {
  const lines = overview?.split("\n") ?? [];
  const start = lines.findIndex((line) => /^\s+lcp:$/.test(line));
  if (start === -1) return null;
  const indent = lines[start].search(/\S/);
  const fields: Record<string, string> = {};
  for (const line of lines.slice(start + 1)) {
    if (line.search(/\S/) <= indent) break;
    const [, key, value] = line.match(/^\s+(\w+):\s*(.*)$/) ?? [];
    if (key) fields[key] = value.replace(/^"(.*)"$/, "$1");
  }
  if (!fields.element) return null;
  const path = fields.url ? new URL(fields.url, "http://shop").pathname : "";
  return { element: fields.element, path };
}

const describe = ({ element, path }: LcpElement) => (path ? `${element} (${path})` : element);

// A line that sets how an image loads: its loading, its fetch priority or a preload
const LOADING_HINT = /\bloading\s*[=:]|fetchpriority|\bpreload\b/i;

// The image of the LCP in any of its sizes: /images/hero-800.webp also names hero-1200.webp
function namesImage(path: string) {
  const file = path.split("/").pop() ?? "";
  const stem = file.replace(/(-\d+)?\.\w+$/, "");
  if (!stem || stem === file) return () => false;
  const name = new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-\\d+)?\\.(webp|avif|jpe?g|png|gif)\\b`);
  return (text: string) => name.test(text);
}

// The changed lines of the diff that set how an image loads or name the LCP image, with their file
// and the function around them: from the hunk header, or from a line of the hunk that declares one
function loadingChanges(diff: string, lcpImage: (text: string) => boolean): string[] {
  const facts: string[] = [];
  let file: string | null = null;
  let fn: string | null = null;
  const declared = (text: string) => text.match(/\bfunction\s+(\w+)/)?.[1] ?? null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line.replace(/^\+\+\+ (b\/)?/, "");
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("diff --git") || line.startsWith("index ")) continue;
    if (line.startsWith("@@")) {
      fn = declared(line.replace(/^@@[^@]*@@/, ""));
      continue;
    }
    if (!file) continue;
    const text = line.slice(1).trim();
    if (line.startsWith(" ")) {
      fn = declared(text) ?? fn;
      continue;
    }
    if (!line.startsWith("+") && !line.startsWith("-")) continue;
    const verb = line.startsWith("+") ? "adds" : "removes";
    const where = fn ? `${file}, in ${fn},` : `${file}`;
    if (LOADING_HINT.test(text)) facts.push(`${where} ${verb}: ${text}`);
    else if (lcpImage(text)) facts.push(`${where} ${verb} a line that names the LCP image: ${text}`);
  }
  return facts;
}

export function lcpLoadingFacts(input: JudgeInput, target: Pick<Target, "metric" | "scenario">): string[] {
  if (target.metric !== "LCP") return [];
  const sides = input.traces[target.scenario];
  const baseline = lcpOf(sides?.baseline?.overview);
  const candidate = lcpOf(sides?.candidate?.overview);
  if (!baseline || !candidate) return [];

  const images = [baseline.path, candidate.path].filter(Boolean).map(namesImage);
  const changes = loadingChanges(input.diff, (text) => images.some((names) => names(text)));
  if (!changes.length) return [];

  const same = describe(baseline) === describe(candidate);
  const element = same
    ? `The LCP element is ${describe(baseline)} in the baseline and in the branch`
    : `The LCP element is ${describe(baseline)} in the baseline and ${describe(candidate)} in the branch`;
  return [element, ...changes];
}
