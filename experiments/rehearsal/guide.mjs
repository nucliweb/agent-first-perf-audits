// What the rehearsal reads from a guide and from PLAN.md. Pure functions over the text: the fences,
// the headings and the inline code come from scripts/lib/markdown.mjs.
//
// A guide marks a command for the rehearsal with an HTML comment right above its block, blank lines
// allowed between them, and an optional note after a comma:
//   <!-- rehearsal: optional -->            part of the guide but not of the timed path: it runs, and
//                                           its time does not count in the slot of its step
//   <!-- rehearsal: skip, <why> -->         it does not run, as an alternative to another command
//   <!-- rehearsal: clone -->               the block clones the repo and enters it: the rehearsal has
//                                           cloned it already, so it runs the rest of the block
import { commandsOf, headingsOf, inlineCodeOf, isShell, fencesOf } from "../../scripts/lib/markdown.mjs";

export const MARKERS = ["optional", "skip", "clone"];

const COMMENT = /^\s*<!--\s*rehearsal:\s*(.*?)\s*-->\s*$/;

// The rehearsal comments of the page, with their line
function markersOf(text) {
  return text.split("\n").flatMap((raw, i) => {
    const comment = raw.match(COMMENT);
    if (!comment) return [];
    const [, name, note] = comment[1].match(/^([\w-]+)(?:\s*,\s*(.+))?$/) ?? [null, comment[1], null];
    if (!MARKERS.includes(name)) throw new Error(`line ${i + 1}: unknown rehearsal marker "${name}"; one of ${MARKERS.join(", ")}`);
    return [{ line: i + 1, marker: name, note: note ?? null }];
  });
}

// The line of the first line above `line` that is not blank, or 0
function lineAbove(lines, line) {
  let at = line - 1;
  while (at > 0 && !lines[at - 1].trim()) at--;
  return at;
}

// The lines of a section: from its heading to the next heading, whatever its level
function sectionRange(text, section) {
  const headings = headingsOf(text);
  const at = headings.findIndex((h) => h.text === section);
  if (at === -1) throw new Error(`no heading "${section}" in the page`);
  return { from: headings[at].line, to: headings[at + 1]?.line ?? Infinity };
}

// The counts that the prose between two lines prints in inline code, as `fail 2` or `pass 7`
function claimsBetween(text, from, to) {
  const claims = {};
  for (const { code, line } of inlineCodeOf(text)) {
    const count = code.match(/^(pass|fail) (\d+)$/);
    if (count && line > from && line < to) claims[count[1]] = Number(count[2]);
  }
  return claims;
}

// The bash blocks of the page in order, or only those of a section: each with its position in that
// list, the line of its fence, the command, the text block that follows it (the output the guide
// shows, or null), its marker and note, and the counts the guide prints after it
export function rehearsalCommandsOf(text, { section } = {}) {
  const lines = text.split("\n");
  const shellLines = fencesOf(text).filter(isShell).map((f) => f.line);
  const markers = markersOf(text);
  const markerAt = new Map();
  for (const m of markers) {
    const fence = shellLines.find((line) => lineAbove(lines, line) === m.line);
    if (!fence) throw new Error(`line ${m.line}: the rehearsal marker "${m.marker}" is not right above a bash block`);
    markerAt.set(fence, m);
  }

  const headingLines = headingsOf(text).map((h) => h.line);
  const { from, to } = section ? sectionRange(text, section) : { from: 0, to: Infinity };
  return commandsOf(text)
    .filter((c) => c.line > from && c.line < to)
    .map((c, index) => {
      const nextCommand = shellLines.find((line) => line > c.line) ?? Infinity;
      const nextHeading = headingLines.find((line) => line > c.line) ?? Infinity;
      const marker = markerAt.get(c.line);
      return {
        index,
        line: c.line,
        command: c.command,
        expected: c.expected,
        marker: marker?.marker ?? null,
        note: marker?.note ?? null,
        claims: claimsBetween(text, c.line, Math.min(nextCommand, nextHeading)),
      };
    });
}

// A block that clones the repo, without its git clone and the cd into the clone
export function withoutCloneLines(command) {
  return command
    .split("\n")
    .filter((line) => !/^\s*(git clone|cd)\s/.test(line))
    .join("\n");
}

// The slot of each step in the agenda of PLAN.md, in minutes: from its row to the next one, and the
// last one to the end of the workshop, the hours of the heading "Agenda (2 h)"
export function agendaOf(plan) {
  const lines = plan.split("\n");
  const heading = lines.findIndex((line) => /^## Agenda \(\d+ h\)/.test(line));
  if (heading === -1) throw new Error('no heading "## Agenda (N h)" in the plan');
  const total = Number(lines[heading].match(/\((\d+) h\)/)[1]) * 60;
  const rows = [];
  for (const line of lines.slice(heading + 1)) {
    if (line.startsWith("## ")) break;
    const row = line.match(/^\|\s*(\d+):(\d\d)\s*\|\s*(?:(\d+)\.)?/);
    if (row) rows.push({ start: Number(row[1]) * 60 + Number(row[2]), step: row[3] ? `step-${row[3].padStart(2, "0")}` : null });
  }
  const slots = {};
  rows.forEach((row, i) => {
    if (row.step) slots[row.step] = (rows[i + 1]?.start ?? total) - row.start;
  });
  return slots;
}
