// Checks what an agent gets from Chrome DevTools MCP and from trace-engine-cli for the same
// trace. Milliseconds and bytes change between machines, so the test uses thresholds.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { compare } from "./compare.mjs";

let devtools;
let traceEngine;

before(async () => {
  ({ devtools, traceEngine } = await compare());
});

const bytes = (outputs) => Object.values(outputs).reduce((sum, text) => sum + Buffer.byteLength(text), 0);
const all = (outputs) => Object.values(outputs).join("\n");

test("Chrome DevTools MCP gives the agent at least three times more text", () => {
  assert.ok(bytes(devtools) > 3 * bytes(traceEngine), `DevTools MCP ${bytes(devtools)} bytes, trace-engine-cli ${bytes(traceEngine)} bytes`);
});

test("both detect the CLS of the banner", () => {
  const devtoolsCls = Number(devtools.performance_stop_trace.match(/CLS: ([\d.]+)/)?.[1]);
  const traceEngineCls = Number(traceEngine.overview.match(/cls:\s+value: ([\d.]+)/)?.[1]);
  assert.ok(devtoolsCls >= 0.1, `DevTools MCP CLS ${devtoolsCls}`);
  assert.ok(traceEngineCls >= 0.1, `trace-engine-cli CLS ${traceEngineCls}`);
});

test("both break the INP down with the processing as the longest subpart", () => {
  const insight = devtools["performance_analyze_insight INPBreakdown"];
  const [inputDelay, processing, presentation] = ["Input delay", "Processing duration", "Presentation delay"].map((label) =>
    // DevTools formats durations with Intl: a non-breaking space separates the number and "ms"
    Number(insight.match(new RegExp(`${label}: ([\\d.]+)\\s+ms`))?.[1]),
  );
  assert.ok(processing > 150 && processing > inputDelay && processing > presentation, insight);

  // One row per event of the interaction (pointerdown, click...); the INP is the longest one
  const rows = traceEngine.interactions.trim().split("\n").slice(1).map((line) => line.trim().split(",").map(Number));
  const [, , duration, input, processingMs, presentationMs] = rows.reduce((a, b) => (b[2] > a[2] ? b : a));
  assert.ok(duration > 150 && processingMs > input && processingMs > presentationMs, traceEngine.interactions);
});

test("only trace-engine-cli names the function behind the INP", () => {
  assert.match(traceEngine["tasks --tree bottom-up --top 5"], /addToCart/);
  assert.doesNotMatch(all(devtools), /addToCart/);
});
