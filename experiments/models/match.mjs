// Relates each suspect of the traces to the line of the diff that adds it. A match makes the cause
// deterministic: the LLM only has to explain it. A function matches its name in an added line,
// and the line that calls it wins over the one that defines or imports it, because the call is
// what the branch makes the page run; a script matches its file name.

const searchTerm = (suspect) => (suspect.kind === "script" ? new URL(suspect.url).pathname.split("/").pop() : suspect.name);

// How much a line tells about a suspect: a call first, then a definition, then an import
function rank(line, name) {
  if (/^\s*import\b/.test(line)) return 2;
  if (new RegExp(`\\b(function|const|let|class)\\s+${name}\\b`).test(line)) return 1;
  return 0;
}

function addedLines(diff) {
  const lines = [];
  let file = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line.replace(/^\+\+\+ (b\/)?/, "");
    } else if (line.startsWith("+") && file) {
      lines.push({ file, text: line.slice(1).trim() });
    }
  }
  return lines;
}

export function matchSuspects(suspects, diff) {
  const added = addedLines(diff);
  return suspects.flatMap((suspect) => {
    const term = searchTerm(suspect);
    const name = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const candidates = added.filter(({ text }) => text.includes(term));
    if (!candidates.length) return [];
    const best = candidates.reduce((a, b) => (rank(b.text, name) < rank(a.text, name) ? b : a));
    return [{ suspect, file: best.file, line: best.text }];
  });
}
