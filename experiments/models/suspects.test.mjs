import { test } from "node:test";
import assert from "node:assert/strict";
import { suspectsFor } from "./suspects.mjs";

const tasks = (...rows) =>
  ["mode: bottom-up", `tasks[${rows.length}]{durationMs,selfTimeMs,functionName,url,lineNumber,columnNumber}:`, ...rows.map((r) => `  ${r}`)].join(
    "\n",
  );

const BASELINE_TASKS = tasks(
  '61.21,61.17,ProfileCall,"http://thirdparty:4000/chat.js?delay=300&cpu=60",0,1',
  '42.56,42.56,formatPrice,"http://shop-baseline:3000/assets/index-Dq8xWP3D.js",8,66440',
  '388.74,33.73,"ThreadControllerImpl::RunTask",null,null,null',
);

test("names a function of the app that only the candidate runs for long", () => {
  const traces = {
    "add-to-cart": {
      baseline: { tasks: tasks('44.06,44.04,"CpuProfiler::StartProfiling",null,null,null') },
      candidate: { tasks: tasks('83.86,79.99,recommendFor,"http://shop-candidate:3000/assets/index-BsVNkX21.js",8,69676') },
    },
  };
  assert.deepEqual(suspectsFor(traces, { metric: "INP", scenario: "add-to-cart" }), [
    { kind: "function", name: "recommendFor", url: "/assets/index.js", line: 8, selfTimeMs: 80, baselineSelfTimeMs: 0 },
  ]);
});

test("names a third-party script by its URL, which keeps its query", () => {
  const traces = {
    home: {
      baseline: { tasks: BASELINE_TASKS },
      candidate: { tasks: tasks('150.98,150.62,ProfileCall,"http://thirdparty:4000/ab.js?cpu=150",0,1') },
    },
  };
  assert.deepEqual(suspectsFor(traces, { metric: "LCP", scenario: "home" }), [
    { kind: "script", name: "http://thirdparty:4000/ab.js?cpu=150", url: "http://thirdparty:4000/ab.js?cpu=150", line: 0, selfTimeMs: 151, baselineSelfTimeMs: 0 },
  ]);
});

test("ignores the tasks that the baseline runs as long, the short ones and those of the browser", () => {
  const traces = {
    home: {
      baseline: { tasks: BASELINE_TASKS },
      candidate: {
        tasks: tasks(
          '61.02,60.67,ProfileCall,"http://thirdparty:4000/chat.js?delay=300&cpu=60",0,1',
          '19.81,19.75,ProfileCall,"http://thirdparty:4000/promo.js?delay=800&cpu=20",0,1',
          '420.1,95.2,"ThreadControllerImpl::RunTask",null,null,null',
        ),
      },
    },
  };
  assert.deepEqual(suspectsFor(traces, { metric: "LCP", scenario: "home" }), []);
});

test("names a layout shift cluster that only the candidate has", () => {
  const traces = {
    home: {
      baseline: { shifts: "clusters: []" },
      candidate: {
        shifts: ["clusters[1]:", "  - durationMs: 1000", "    cumulativeScore: 0.0524", "    culprits[3]{nodeId,tagName,selector,debugName,scoreDelta}:"].join("\n"),
      },
    },
  };
  assert.deepEqual(suspectsFor(traces, { metric: "CLS", scenario: "home" }), [
    { kind: "layout-shift", name: "a layout shift cluster that the baseline does not have", score: 0.0524, nodes: 3 },
  ]);
});

test("has no suspects when nothing regressed", () => {
  assert.deepEqual(suspectsFor({}, null), []);
});
