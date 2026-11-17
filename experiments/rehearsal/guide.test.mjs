// What the rehearsal reads from a guide: its commands in order, with the output each one has to give,
// the marker above it and the counts the guide prints after it; and the slot of each step in the agenda.
import { test } from "node:test";
import assert from "node:assert/strict";
import { agendaOf, agendaRowsOf, pointOf, rehearsalCommandsOf, withoutCloneLines } from "./guide.mjs";

const GUIDE = `---
title: A step
---

## Before you start

\`\`\`bash
git fetch origin workshop --tags
docker compose up -d
\`\`\`

## Step by step

1. Run the tests:

   \`\`\`bash
   docker compose run --rm agents node --test test/a.test.ts
   \`\`\`

   The 2 tests fail (\`fail 2\`) with this message:

   \`\`\`text
   Step 1 of the workshop: do it. Its tests: test/a.test.ts
   \`\`\`

2. Optional: the other branch:

   <!-- rehearsal: optional -->

   \`\`\`bash
   CANDIDATE=pr-x docker compose up -d
   \`\`\`

3. Run them again:

   <!-- rehearsal: skip, it needs a key of the API -->
   \`\`\`bash
   docker compose run --rm agents node --test test/a.test.ts
   \`\`\`

   The 2 pass (\`pass 2\`).

## What the code does

\`\`\`json
{ "not": "a command" }
\`\`\`
`;

test("takes the bash blocks in order, each with the text block that follows it", () => {
  const commands = rehearsalCommandsOf(GUIDE);
  assert.deepEqual(
    commands.map((c) => c.command),
    [
      "git fetch origin workshop --tags\ndocker compose up -d",
      "docker compose run --rm agents node --test test/a.test.ts",
      "CANDIDATE=pr-x docker compose up -d",
      "docker compose run --rm agents node --test test/a.test.ts",
    ],
  );
  assert.deepEqual(
    commands.map((c) => c.expected),
    [null, "Step 1 of the workshop: do it. Its tests: test/a.test.ts", null, null],
  );
  assert.deepEqual(
    commands.map((c) => [c.index, c.line]),
    [
      [0, 7],
      [1, 16],
      [2, 30],
      [3, 37],
    ],
  );
});

test("reads the marker right above a block, blank lines between them allowed, with its note", () => {
  const commands = rehearsalCommandsOf(GUIDE);
  assert.deepEqual(
    commands.map((c) => [c.marker, c.note]),
    [
      [null, null],
      [null, null],
      ["optional", null],
      ["skip", "it needs a key of the API"],
    ],
  );
});

test("reads the pass and fail counts the guide prints after each command, up to the next command", () => {
  assert.deepEqual(
    rehearsalCommandsOf(GUIDE).map((c) => c.claims),
    [{}, { fail: 2 }, {}, { pass: 2 }],
  );
});

test("a marker that is not one of the rehearsal stops the extraction with its line", () => {
  const text = "<!-- rehearsal: optinal -->\n```bash\necho hi\n```\n";
  assert.throws(() => rehearsalCommandsOf(text), /line 1: unknown rehearsal marker "optinal"; one of optional, skip, clone/);
});

test("a marker that does not sit above a bash block stops the extraction, so it cannot mark nothing", () => {
  const text = "<!-- rehearsal: skip -->\n\nSome prose.\n\n```bash\necho hi\n```\n";
  assert.throws(() => rehearsalCommandsOf(text), /line 1: the rehearsal marker "skip" is not right above a bash block/);
});

test("an HTML comment that is not about the rehearsal is not a marker", () => {
  const text = "<!-- a note for the translators -->\n```bash\necho hi\n```\n";
  assert.deepEqual(
    rehearsalCommandsOf(text).map((c) => c.marker),
    [null],
  );
});

const README = `# Repo

## Getting started

\`\`\`bash
git clone https://example.com/repo.git
cd repo
scripts/preflight.sh
\`\`\`

To run the gate:

\`\`\`bash
docker compose run --rm ci
\`\`\`

### The subagents

\`\`\`bash
docker compose run --rm agents node src/orchestrator.ts
\`\`\`

## The workshop

\`\`\`bash
git switch -c taller workshop-start
\`\`\`
`;

test("with a section, takes only the blocks between its heading and the next heading", () => {
  const commands = rehearsalCommandsOf(README, { section: "Getting started" });
  assert.deepEqual(
    commands.map((c) => [c.index, c.command]),
    [
      [0, "git clone https://example.com/repo.git\ncd repo\nscripts/preflight.sh"],
      [1, "docker compose run --rm ci"],
    ],
  );
});

test("a section that the page does not have is an error, not an empty list", () => {
  assert.throws(() => rehearsalCommandsOf(README, { section: "Puesta en marcha" }), /no heading "Puesta en marcha"/);
});

test("without the lines that clone the repo and enter it, which the rehearsal has already done", () => {
  assert.equal(withoutCloneLines("git clone https://example.com/repo.git\ncd repo\nscripts/preflight.sh   # with 8 GB: lite"), "scripts/preflight.sh   # with 8 GB: lite");
  assert.equal(withoutCloneLines("scripts/preflight.sh"), "scripts/preflight.sh");
});

const PLAN = `# Plan

## Agenda (2 h)

| Tiempo | Paso | Resultado verificable |
|---|---|---|
| 0:00 | Contexto: Agent-First Design | |
| 0:10 | 1. Entorno y primera llamada MCP a mano | Trace |
| 0:25 | 2. Primer subagente: LCP | JSON |
| 1:45 | 6. Llevarlo a tu plataforma | |

## Requisitos
`;

test("the slot of each step of the agenda, in minutes, up to the next row or the end of the workshop", () => {
  assert.deepEqual(agendaOf(PLAN), { "step-01": 15, "step-02": 80, "step-06": 15 });
});

test("the rows of the agenda in order: when each one starts, its step and its minutes, the context included", () => {
  assert.deepEqual(agendaRowsOf(PLAN), [
    { start: "0:00", step: null, slot: 10 },
    { start: "0:10", step: "step-01", slot: 15 },
    { start: "0:25", step: "step-02", slot: 80 },
    { start: "1:45", step: "step-06", slot: 15 },
  ]);
});

test("the agenda of PLAN.md gives a slot to the six steps of the workshop", async () => {
  const { readFileSync } = await import("node:fs");
  const agenda = agendaOf(readFileSync(new URL("../../PLAN.md", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(agenda), ["step-01", "step-02", "step-03", "step-04", "step-05", "step-06"]);
  assert.equal(agenda["step-05"], 20);
  assert.equal(Object.values(agenda).reduce((a, b) => a + b) + 10, 120, "the six steps and the 10 minutes of context fill the 2 h");
});

test("a command belongs to the item of the numbered list above it, and to none outside a list", () => {
  const text = ["## Antes", "", "```bash", "docker compose up -d", "```", "", "## Paso a paso", "", "1. Lanza:", "", "   ```bash", "   npm test", "   ```", "", "2. Mide:", "", "   Un párrafo.", "", "   ```bash", "   npm run measure", "   ```"].join("\n");
  assert.equal(pointOf(text, 3), null);
  assert.equal(pointOf(text, 11), 1);
  assert.equal(pointOf(text, 19), 2);
});
