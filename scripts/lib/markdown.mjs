// What the scripts of the repo read from a Markdown page: its fences, headings, frontmatter keys,
// links and commands. Pure functions over the text, with no dependencies.

const FENCE = /^(\s*)(`{3,})\s*([\w-]*)/;
const SHELL = ["bash", "sh", "shell"];

// Each line with its number and whether it is inside a fence (the lines of the fence marks too)
function lines(text) {
  let open = false;
  return text.split("\n").map((raw, i) => {
    const mark = FENCE.test(raw);
    const fenced = open || mark;
    if (mark) open = !open;
    return { line: i + 1, text: raw, fenced };
  });
}

// The lines of the frontmatter, the ones between the two --- at the top
function frontmatter(text) {
  if (!text.startsWith("---\n")) return [];
  const all = text.split("\n");
  const end = all.indexOf("---", 1);
  return end === -1 ? [] : all.slice(1, end);
}

// The fenced code blocks: language, line of the opening mark and body without the indent of the list
export function fencesOf(text) {
  const fences = [];
  let open = null;
  text.split("\n").forEach((raw, i) => {
    const mark = raw.match(FENCE);
    if (mark && !open) open = { lang: mark[3], line: i + 1, indent: mark[1].length, body: [] };
    else if (mark) {
      fences.push({ lang: open.lang, line: open.line, body: open.body.join("\n") });
      open = null;
    } else if (open) open.body.push(raw.slice(Math.min(open.indent, raw.length - raw.trimStart().length)));
  });
  return fences;
}

// The lines outside the fences, frontmatter included
export function proseOf(text) {
  return lines(text).filter((l) => !l.fenced);
}

export function headingsOf(text) {
  const skip = frontmatter(text).length ? frontmatter(text).length + 2 : 0;
  return proseOf(text)
    .filter((l) => l.line > skip)
    .map((l) => ({ match: l.text.match(/^(#{1,6})\s+(.+?)\s*$/), line: l.line }))
    .filter((h) => h.match)
    .map((h) => ({ level: h.match[1].length, text: h.match[2], line: h.line }));
}

// The top-level keys of the frontmatter, in order
export function frontmatterKeysOf(text) {
  return frontmatter(text)
    .map((line) => line.match(/^([A-Za-z_][\w-]*):/)?.[1])
    .filter(Boolean);
}

export const withoutInlineCode = (line) => line.replace(/`[^`]*`/g, "");

// The inline code spans of the prose
export function inlineCodeOf(text) {
  return proseOf(text).flatMap((l) => [...l.text.matchAll(/`([^`]+)`/g)].map((m) => ({ code: m[1], line: l.line })));
}

// The links of the prose: Markdown links and href attributes
export function linksOf(text) {
  return proseOf(text).flatMap((l) =>
    [...withoutInlineCode(l.text).matchAll(/\]\(([^)\s]+)[^)]*\)|href="([^"]+)"/g)].map((m) => ({ href: m[1] ?? m[2], line: l.line })),
  );
}

export const isShell = (fence) => SHELL.includes(fence.lang);

// Each shell fence with the text fence that follows it: the command and the output the page shows
export function commandsOf(text) {
  const fences = fencesOf(text);
  return fences
    .map((fence, i) => ({ fence, next: fences[i + 1] }))
    .filter(({ fence }) => isShell(fence))
    .map(({ fence, next }) => ({ command: fence.body, line: fence.line, expected: next?.lang === "text" ? next.body : null }));
}
