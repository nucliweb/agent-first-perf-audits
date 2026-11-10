import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSummary } from "../../src/judge/normalize.ts";

test("drops the start time column of a TOON table", () => {
  const toon = [
    "tasks[2]{startTimeMs,durationMs,selfTimeMs,functionName,url,lineNumber,columnNumber}:",
    '  356488076.48,79.45,77.65,recommendFor,"http://shop-candidate:3000/assets/index-B.js",8,69676',
    "  356488076.48,41.33,41.31,\"CpuProfiler::StartProfiling\",null,null,null",
  ].join("\n");
  assert.equal(
    normalizeSummary(toon),
    [
      "tasks[2]{durationMs,selfTimeMs,functionName,url,lineNumber,columnNumber}:",
      '  79.45,77.65,recommendFor,"http://shop-candidate:3000/assets/index-B.js",8,69676',
      '  41.33,41.31,"CpuProfiler::StartProfiling",null,null,null',
    ].join("\n"),
  );
});

test("drops the absolute timestamps and ids of the trace, and keeps durations", () => {
  const toon = [
    "bounds:",
    "  minMs: 320829481.2",
    "  maxMs: 320833149.77",
    "  durationMs: 3668.57",
    'mainUrl: "http://shop-baseline:3000/"',
    "navigationStartMs: 320829483.06",
    "clusters[1]:",
    "  - timestampMs: 320830247.87",
    "    durationMs: 1000",
    "    navigationId: EE387BD53005DA41D01A68B77E0298D6",
  ].join("\n");
  assert.equal(
    normalizeSummary(toon),
    ["bounds:", "  durationMs: 3668.57", 'mainUrl: "http://shop-baseline:3000/"', "clusters[1]:", "  - durationMs: 1000"].join("\n"),
  );
});

test("keeps a table without a start time as it is", () => {
  const toon = "culprits[1]{nodeId,tagName,selector,debugName,scoreDelta}:\n  8,null,Node #8,BUTTON id='buy',0.148";
  assert.equal(normalizeSummary(toon), toon);
});

test("drops the time of an interaction, and keeps its subparts", () => {
  const toon =
    "interactions[1]{eventType,startTimeMs,durationMs,inputDelayMs,processingDurationMs,presentationDelayMs,targetElement,interactionId}:\n  pointerdown,356491514.64,119.71,2.33,89.17,28.21,null,1245";
  assert.equal(
    normalizeSummary(toon),
    "interactions[1]{eventType,durationMs,inputDelayMs,processingDurationMs,presentationDelayMs,targetElement}:\n  pointerdown,119.71,2.33,89.17,28.21,null",
  );
});
