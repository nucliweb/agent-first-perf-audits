// Checks that the gate gives each regression branch the verdict the workshop expects: the three
// regressions fail on their metric and the refactor passes. It builds and measures every branch,
// so it takes a few minutes.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { BRANCHES, measure } from "./measure.mjs";

let results;

before(async () => {
  results = await measure();
});

const resultOf = (ref, scenario) => results.find((r) => r.ref === ref && r.scenario === scenario);

for (const { ref, expect } of BRANCHES.filter((b) => b.expect)) {
  test(`${ref} fails the gate on ${expect.metric} in ${expect.scenario}`, () => {
    const result = resultOf(ref, expect.scenario);
    assert.equal(result.exitCode, 1, `exit code ${result.exitCode}`);
    assert.equal(result.metrics[expect.metric]?.verdict, "regressed", JSON.stringify(result.metrics));
  });
}

for (const { ref } of BRANCHES.filter((b) => !b.expect)) {
  test(`${ref} passes the gate in every scenario`, () => {
    for (const result of results.filter((r) => r.ref === ref)) {
      assert.equal(result.exitCode, 0, `${result.scenario}: exit code ${result.exitCode}`);
      const regressed = Object.entries(result.metrics).filter(([, m]) => m.verdict === "regressed");
      assert.deepEqual(regressed, [], result.scenario);
    }
  });
}
