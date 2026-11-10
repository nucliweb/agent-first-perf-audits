// Relates each suspect of the traces to the line of the diff that adds it. A match makes the cause
// deterministic: the LLM only has to explain it. A function matches its name in an added line,
// and the line that calls it wins over the one that defines or imports it, because the call is
// what the branch makes the page run; a script matches its file name.
import type { Match, Suspect, TaskSuspect } from "./types.ts";

const searchTerm = (suspect: TaskSuspect) => (suspect.kind === "script" ? new URL(suspect.url).pathname.split("/").pop()! : suspect.name);

// How much a line tells about a suspect: a call first, then a definition, then an import
function rank(line: string, name: string) {
  if (/^\s*import\b/.test(line)) return 2;
  if (new RegExp(`\\b(function|const|let|class)\\s+${name}\\b`).test(line)) return 1;
  return 0;
}

function addedLines(diff: string) {
  const lines: { file: string; text: string }[] = [];
  let file: string | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line.replace(/^\+\+\+ (b\/)?/, "");
    } else if (line.startsWith("+") && file) {
      lines.push({ file, text: line.slice(1).trim() });
    }
  }
  return lines;
}

// A layout shift has no name to look for in the diff
export function matchSuspects(suspects: Suspect[], diff: string): Match[] {
  const added = addedLines(diff);
  return suspects.flatMap((suspect) => {
    if (suspect.kind === "layout-shift") return [];
    const term = searchTerm(suspect);
    const name = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const candidates = added.filter(({ text }) => text.includes(term));
    if (!candidates.length) return [];
    const best = candidates.reduce((a, b) => (rank(b.text, name) < rank(a.text, name) ? b : a));
    return [{ suspect, file: best.file, line: best.text }];
  });
}
