// What the rehearsal reads from the output of a command. Pure functions over the text.

// The escape sequences of a terminal: colours, cursor moves and titles
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

export const stripAnsi = (text) => text.replace(ANSI, "");

// The lines of an output as a terminal leaves them: without colours, a carriage return starts a line
const linesOf = (text) => stripAnsi(text).split(/\r\n|\r|\n/);
const normalize = (line) => line.replace(/\s+/g, " ").trim();
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The pattern of an expected line: literal text where … stands for any text
const patternOf = (line) => new RegExp(normalize(line).split("…").map(escape).join(".*"));

// Whether the output has every line of the expected block in order, each one inside a line of the
// output, with any other lines between them. Blank lines of the block do not count. missing lists the
// lines not found in order; with no expected block, matched is null.
export function matchOutput(output, expected) {
  if (expected == null) return { matched: null, missing: [] };
  const lines = linesOf(output).map(normalize);
  const missing = [];
  let at = 0;
  for (const line of expected.split("\n").filter((l) => l.trim())) {
    const pattern = patternOf(line);
    const found = lines.findIndex((l, i) => i >= at && pattern.test(l));
    if (found === -1) missing.push(line.trim());
    else at = found + 1;
  }
  return { matched: missing.length === 0, missing };
}

// The pass and fail counts of node --test, from the summary of the spec reporter (ℹ pass 5) or of
// TAP (# pass 5), added up when the output has more than one run; null without a summary
export function testCountsOf(output) {
  let counts = null;
  for (const line of linesOf(output)) {
    const count = line.trim().match(/^(?:ℹ|#)\s*(pass|fail) (\d+)$/);
    if (!count) continue;
    counts ??= { pass: 0, fail: 0 };
    counts[count[1]] += Number(count[2]);
  }
  return counts;
}

// The exit code of each branch, from the lines "<branch>: exit <code>" that the loop of step 5 prints
export function branchExitsOf(output) {
  return linesOf(output).flatMap((line) => {
    const exit = line.trim().match(/^(\S+): exit (\d+)$/);
    return exit ? [{ branch: exit[1], exit: Number(exit[2]) }] : [];
  });
}
