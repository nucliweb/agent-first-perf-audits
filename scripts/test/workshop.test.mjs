// The stubs of the workshop branch: scripts/workshop.mjs replaces the code between the markers of a
// step that is not solved yet with a throw that names the step, its task and its tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { regionsOf, stubbed } from "../workshop.mjs";

const SOURCE = `export function lcpReportOf(answer) {
  // workshop: step 2, shape the answer into the LCP report (test/subagents/lcp.test.ts)
  const value = answer.value;
  return { value };
  // workshop: end
}

export async function runJourney(page) {
    // workshop: step 3, run the steps of a journey (test/subagents/navigator.test.ts)
    await page.click();
    // workshop: end
}
`;

test("finds each region with its step, its task and its tests", () => {
  assert.deepEqual(regionsOf(SOURCE), [
    { step: 2, task: "shape the answer into the LCP report", tests: "test/subagents/lcp.test.ts" },
    { step: 3, task: "run the steps of a journey", tests: "test/subagents/navigator.test.ts" },
  ]);
});

test("at the start, every region is a throw that names its step, its task and its tests, between the markers", () => {
  assert.equal(
    stubbed(SOURCE, 0),
    `export function lcpReportOf(answer) {
  // workshop: step 2, shape the answer into the LCP report (test/subagents/lcp.test.ts)
  throw new Error("Step 2 of the workshop: shape the answer into the LCP report. Its tests: test/subagents/lcp.test.ts");
  // workshop: end
}

export async function runJourney(page) {
    // workshop: step 3, run the steps of a journey (test/subagents/navigator.test.ts)
    throw new Error("Step 3 of the workshop: run the steps of a journey. Its tests: test/subagents/navigator.test.ts");
    // workshop: end
}
`,
  );
});

test("a solved step keeps its code, and the later ones stay stubs", () => {
  const solved = stubbed(SOURCE, 2);
  assert.match(solved, /const value = answer\.value;/);
  assert.match(solved, /throw new Error\("Step 3 of the workshop/);
  assert.equal(stubbed(SOURCE, 3), SOURCE);
});

test("a marker without its end, or nested in another, is an error", () => {
  assert.throws(() => stubbed("  // workshop: step 2, a task (test/a.test.ts)\n  code();\n", 0), /without its end/);
  assert.throws(() => stubbed("  // workshop: end\n", 0), /end without a start/);
  assert.throws(
    () => stubbed("  // workshop: step 2, a (test/a.test.ts)\n  // workshop: step 3, b (test/b.test.ts)\n  // workshop: end\n  // workshop: end\n", 0),
    /inside another/,
  );
});
