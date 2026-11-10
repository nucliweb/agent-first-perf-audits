// Comprueba las afirmaciones de la página Learnings sobre un trace grabado en esta máquina.
// Los milisegundos cambian entre máquinas, así que las aserciones usan umbrales, no valores exactos.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { record } from "./record.mjs";
import { summarize } from "./summarize.mjs";

let traceBytes;
let byName;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), "trace-engine-cli-"));
  const trace = await record(join(dir, "trace.json"));
  ({ traceBytes, summaries: byName } = summarize(trace));
  byName = Object.fromEntries(byName.map((s) => [s.name, s]));
});

test("cada resumen ocupa menos de 2 KB", () => {
  assert.ok(byName["overview"].bytes < 2048, `overview: ${byName["overview"].bytes} bytes`);
  assert.ok(byName["interactions"].bytes < 2048, `interactions: ${byName["interactions"].bytes} bytes`);
  assert.ok(byName["tasks --tree bottom-up --top 5"].bytes < 2048, `tasks: ${byName["tasks --tree bottom-up --top 5"].bytes} bytes`);
  assert.ok(byName["shifts --events"].bytes < 2048, `shifts: ${byName["shifts --events"].bytes} bytes`);
});

test("los cuatro resúmenes juntos reducen el trace más de un 99 %", () => {
  const total = Object.values(byName).reduce((sum, s) => sum + s.bytes, 0);
  assert.ok(total / traceBytes < 0.01, `${total} de ${traceBytes} bytes`);
});

test("overview detecta el CLS del banner", () => {
  const cls = Number(byName["overview"].output.match(/cls:\s*\n\s*value: ([\d.]+)/)?.[1]);
  assert.ok(cls >= 0.1, `CLS ${cls}`);
});

test("interactions atribuye el INP al processing del handler", () => {
  const row = byName["interactions"].output.split("\n").find((l) => /^\s+pointer|^\s+click/.test(l));
  assert.ok(row, byName["interactions"].output);
  const [, , durationMs, inputDelayMs, processingMs, presentationMs] = row.trim().split(",").map(Number);
  assert.ok(durationMs > 150, `INP ${durationMs} ms`);
  assert.ok(processingMs > inputDelayMs && processingMs > presentationMs, row);
});

test("tasks bottom-up nombra addToCart con su línea y unos 180 ms de self time", () => {
  const row = byName["tasks --tree bottom-up --top 5"].output.split("\n").find((l) => l.includes("addToCart"));
  assert.ok(row, byName["tasks --tree bottom-up --top 5"].output);
  const [, , selfTimeMs, , url, lineNumber] = row.trim().split(",");
  assert.ok(Number(selfTimeMs) >= 150, `self time ${selfTimeMs} ms`);
  assert.match(url, /^"http:\/\/127\.0\.0\.1:\d+\/"$/);
  assert.ok(Number(lineNumber) > 0, `línea ${lineNumber}`);
});

test("shifts no da el selector del nodo culpable, que viene de WebPerf Snippets", () => {
  assert.match(byName["shifts --events"].output, /Node #\d+/);
});
