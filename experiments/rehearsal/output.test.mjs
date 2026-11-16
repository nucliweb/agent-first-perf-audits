// What the rehearsal reads from the output of a command: whether it shows the lines of the expected
// block of the guide, the counts of node --test and the exit code of each branch of step 5.
import { test } from "node:test";
import assert from "node:assert/strict";
import { branchExitsOf, matchOutput, stripAnsi, testCountsOf } from "./output.mjs";

test("an output matches when it has every line of the expected block, in order, other lines between them", () => {
  const output = "Pulling images\nstep-01: The first call\n\n  OK  tests: test/a.test.ts\nnoise\n  OK  out/first-trace.json\n\nstep-01 is done.\n";
  const expected = "step-01: The first call\n\n  OK  tests: test/a.test.ts\n  OK  out/first-trace.json\n\nstep-01 is done.";
  assert.deepEqual(matchOutput(output, expected), { matched: true, missing: [] });
});

test("an expected line may be part of a longer line, as the message of an error inside the report of node --test", () => {
  const output = "not ok 1 - records the load\n  ---\n  error: 'Step 1 of the workshop: record the load. Its tests: test/a.test.ts'\n";
  assert.equal(matchOutput(output, "Step 1 of the workshop: record the load. Its tests: test/a.test.ts").matched, true);
});

test("… stands for any text, figures included, and may be empty", () => {
  const output = "[orchestrator] loaf, baseline: home no click, shop INP 48 ms, add-to-cart INP 32 ms; top script MessagePort.onmessage (index.js)\n";
  const expected = "[orchestrator] loaf, baseline: home no click, shop INP … ms, add-to-cart INP … ms; top script MessagePort.onmessage (…)";
  assert.equal(matchOutput(output, expected).matched, true);
  assert.equal(matchOutput("top script (anonymous) ()", "top script (…) (…)").matched, true);
});

test("the rest of the text is literal: dots, brackets and parentheses are not patterns", () => {
  assert.equal(matchOutput("report in report_md", "report in report.md").matched, false);
  assert.equal(matchOutput("[first-trace] http://shop-baseline:3000/ -> /out/first-trace.json", "[first-trace] http://shop-baseline:3000/ -> /out/first-trace.json").matched, true);
});

test("runs of spaces and tabs count as one space, and the indent does not count", () => {
  assert.equal(matchOutput("\tOK\t tests: a.ts", "  OK  tests: a.ts").matched, true);
});

test("the colours and the carriage returns of a terminal do not count", () => {
  const output = "\u001b[32m✔\u001b[39m pass\r\n\u001b[1A\u001b[2K[+] Running 3/3\rstep-01 is \u001b[1mdone\u001b[22m.\r\n";
  assert.equal(stripAnsi("\u001b[32mOK\u001b[39m"), "OK");
  assert.equal(matchOutput(output, "step-01 is done.").matched, true);
});

test("the lines that are missing, or that come out of order, are listed", () => {
  const output = "line b\nline a\n";
  assert.deepEqual(matchOutput(output, "line a\nline b\nline c"), { matched: false, missing: ["line b", "line c"] });
});

test("without an expected block there is nothing to match", () => {
  assert.deepEqual(matchOutput("anything", null), { matched: null, missing: [] });
});

test("the counts of node --test, with the spec reporter and with TAP", () => {
  assert.deepEqual(testCountsOf("✔ a\nℹ tests 7\nℹ suites 0\nℹ pass 5\nℹ fail 2\nℹ cancelled 0\n"), { pass: 5, fail: 2 });
  assert.deepEqual(testCountsOf("ok 1 - a\n1..2\n# tests 2\n# pass 2\n# fail 0\n"), { pass: 2, fail: 0 });
  assert.deepEqual(testCountsOf("\u001b[34mℹ pass 19\u001b[39m\n\u001b[34mℹ fail 0\u001b[39m\n"), { pass: 19, fail: 0 });
});

test("an output without node --test has no counts, and a test named pass is not one", () => {
  assert.equal(testCountsOf("step-02 is done.\n"), null);
  assert.equal(testCountsOf("✔ pass 2 tests to the handler (3ms)\n"), null);
});

test("the exit code of each branch that the loop of step 5 prints", () => {
  const output = "[ci] gate: fail\npr-lcp-hero-lazy: exit 1\n[ci] gate: pass\npr-noop-refactor: exit 0\n";
  assert.deepEqual(branchExitsOf(output), [
    { branch: "pr-lcp-hero-lazy", exit: 1 },
    { branch: "pr-noop-refactor", exit: 0 },
  ]);
  assert.deepEqual(branchExitsOf("nothing here"), []);
});
