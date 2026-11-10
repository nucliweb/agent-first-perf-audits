// The suspects of a regressed metric, found by comparing the trace summaries of the candidate with
// those of the baseline. The code finds them; the LLM only has to relate each one to a line of the
// diff and explain it.
//   LCP and INP: a function or a script that runs for long in the candidate and much less, or not
//                at all, in the baseline (the bottom-up tasks of trace-engine-cli)
//   CLS:         a layout shift cluster that the baseline does not have (trace-engine-cli shifts)
import { splitRow } from "./normalize.mjs";

// A suspect runs for a long task's worth and clearly more than in the baseline. The tasks summary
// lists the top 5 of each trace, so a task missing from the baseline ran for less than its fifth one.
const MIN_SELF_MS = 50;
const MIN_GROWTH_MS = 30;
const MIN_SCORE_GROWTH = 0.01;

const unquote = (value) => (value === "null" ? null : value.replace(/^"(.*)"$/, "$1"));

function tableRows(toon) {
  const lines = toon.split("\n");
  const header = lines.findIndex((line) => /^\s*\w+\[\d+\]\{[^}]*\}:$/.test(line));
  if (header === -1) return [];
  const columns = lines[header].match(/\{([^}]*)\}/)[1].split(",");
  return lines
    .slice(header + 1)
    .filter((line) => line.trim())
    .map((line) => Object.fromEntries(splitRow(line.trim()).map((cell, i) => [columns[i], unquote(cell)])));
}

// The shop is served from another origin in each side and Vite hashes its bundle, so the code of
// the app is known by its path without the hash; a third-party script keeps its whole URL
function codeKey(url) {
  const { origin, pathname, search } = new URL(url);
  return /^http:\/\/shop-/.test(origin) ? pathname.replace(/-[\w-]{8}(\.js)$/, "$1") : `${origin}${pathname}${search}`;
}

function taskSuspects(baselineTasks = "", candidateTasks = "") {
  const selfOf = (rows) => {
    const map = new Map();
    for (const row of rows) if (row.url) map.set(`${row.functionName}|${codeKey(row.url)}`, Number(row.selfTimeMs));
    return map;
  };
  const baseline = selfOf(tableRows(baselineTasks));
  return tableRows(candidateTasks)
    .filter((row) => row.url)
    .map((row) => {
      const url = codeKey(row.url);
      const selfTimeMs = Math.round(Number(row.selfTimeMs));
      const baselineSelfTimeMs = Math.round(baseline.get(`${row.functionName}|${url}`) ?? 0);
      const script = row.functionName === "ProfileCall";
      return { kind: script ? "script" : "function", name: script ? url : row.functionName, url, line: Number(row.lineNumber), selfTimeMs, baselineSelfTimeMs };
    })
    .filter((s) => s.selfTimeMs >= MIN_SELF_MS && s.selfTimeMs - s.baselineSelfTimeMs >= MIN_GROWTH_MS);
}

function shiftsOf(toon = "") {
  const score = Number(toon.match(/cumulativeScore: ([\d.]+)/)?.[1] ?? 0);
  const nodes = Number(toon.match(/culprits\[(\d+)\]/)?.[1] ?? 0);
  return { score, nodes };
}

function shiftSuspects(baselineShifts, candidateShifts) {
  const baseline = shiftsOf(baselineShifts);
  const candidate = shiftsOf(candidateShifts);
  if (candidate.score - baseline.score < MIN_SCORE_GROWTH) return [];
  const name = baseline.score === 0 ? "a layout shift cluster that the baseline does not have" : "a layout shift cluster larger than in the baseline";
  return [{ kind: "layout-shift", name, score: candidate.score, nodes: candidate.nodes }];
}

// target: { metric, scenario } of the rules, or null when nothing regressed
export function suspectsFor(traces, target) {
  if (!target) return [];
  const sides = traces[target.scenario] ?? {};
  if (target.metric === "CLS") return shiftSuspects(sides.baseline?.shifts, sides.candidate?.shifts);
  return taskSuspects(sides.baseline?.tasks, sides.candidate?.tasks);
}
