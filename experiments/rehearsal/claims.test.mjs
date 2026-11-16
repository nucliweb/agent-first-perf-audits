// The claims of the guides, checked on the saved rehearsals of results/: the commands are the ones the
// guides write today, the pass and fail counts they print are the measured ones, each command exits as
// its guide says, the machine time of each step fits in its slot of the agenda of PLAN.md, step 5 gives
// three failures and a pass, and the output of each command has the lines its guide shows. It does not
// run anything: node rehearse.mjs writes results/<profile>.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { agendaOf } from "./guide.mjs";
import { planOf, stepTimesOf } from "./rehearse.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const RESULTS = join(import.meta.dirname, "results");
// The share of its slot that the machine may take in a step: the rest is for explaining and for the
// attendees who go slower than the reference machine
const SHARE = 0.6;
// The exit code of ci for each branch of step 5, in the order of its loop
const STEP_5 = [
  { branch: "pr-lcp-hero-lazy", exit: 1 },
  { branch: "pr-cls-promo-banner", exit: 1 },
  { branch: "pr-loaf-cart-handler", exit: 1 },
  { branch: "pr-noop-refactor", exit: 0 },
];

const files = existsSync(RESULTS) ? readdirSync(RESULTS).filter((f) => f.endsWith(".json")).sort() : [];
const slots = agendaOf(readFileSync(join(REPO, "PLAN.md"), "utf8"));
const where = (c) => `${c.file}:${c.line}`;
const minutes = (ms) => (ms / 60000).toFixed(1);

if (!files.length) {
  test("the claims of the guides against a rehearsal", { skip: "no results/*.json yet: run node rehearse.mjs on the reference machine, one profile at a time" }, () => {});
}

for (const name of files) {
  const results = JSON.parse(readFileSync(join(RESULTS, name), "utf8"));
  const unfinished = !results.complete && `${name} is from a rehearsal that did not finish`;
  const guide = planOf(REPO, { only: results.only ?? undefined });
  // The record of a command of the guide: the same file, the same place in it and the same command
  const recordOf = (planned) => results.commands.find((c) => c.file === planned.file && c.index === planned.index && c.command === planned.command);
  const ran = (planned) => recordOf(planned)?.status === "ran";

  test(`${name}: it rehearsed every command of the guides as they write it today`, { skip: unfinished }, () => {
    const key = (c) => `${where(c)} ${c.command}`;
    assert.deepEqual(results.commands.map(key), guide.map(key), "a guide changed after the rehearsal: run it again");
  });

  test(`${name}: the pass and fail counts that the guides print are the measured ones`, { skip: unfinished }, () => {
    const wrong = [];
    for (const planned of guide.filter(ran)) {
      for (const [label, count] of Object.entries(planned.claims)) {
        const measured = recordOf(planned).counts?.[label];
        if (measured !== count) wrong.push(`${where(planned)}: the guide prints ${label} ${count}, the rehearsal gave ${measured ?? "no count"}`);
      }
    }
    assert.deepEqual(wrong, []);
  });

  test(`${name}: each command exits with 1 when its guide prints failing tests, and with 0 otherwise`, { skip: unfinished }, () => {
    const wrong = guide
      .filter((planned) => ran(planned) && planned.marker !== "optional")
      .map((planned) => ({ planned, expected: (planned.claims.fail ?? 0) > 0 ? 1 : 0, exit: recordOf(planned).exitCode }))
      .filter(({ expected, exit }) => exit !== expected)
      .map(({ planned, expected, exit }) => `${where(planned)}: exit ${exit}, the guide implies ${expected}`);
    assert.deepEqual(wrong, []);
  });

  test(`${name}: the machine time of each step stays within ${SHARE * 100} % of its slot in the agenda`, { skip: unfinished }, () => {
    const over = Object.entries(stepTimesOf(results.commands))
      .filter(([step]) => step in slots)
      .filter(([step, ms]) => ms > SHARE * slots[step] * 60000)
      .map(([step, ms]) => `${step}: ${minutes(ms)} min of machine time, more than ${SHARE * 100} % of its ${slots[step]} min slot (${minutes(SHARE * slots[step] * 60000)} min)`);
    assert.deepEqual(over, []);
  });

  const step5 = results.commands.find((c) => c.step === "step-05" && c.status === "ran" && c.branchExits);
  test(`${name}: step 5 exits with 1, 1, 1 and 0`, { skip: unfinished || (!step5 && `${name} did not run the loop of step 5`) }, () => {
    assert.deepEqual(step5.branchExits, STEP_5);
  });

  test(
    `${name}: the output of each command has the lines its guide shows`,
    { skip: unfinished || (results.profile !== "llm" && "the guides show the output of the llm profile, and lite changes the lines of the Judge") },
    () => {
      const off = results.commands.filter((c) => c.matched === false).map((c) => `${where(c)}: missing ${c.missing.map((line) => JSON.stringify(line)).join(", ")}`);
      assert.deepEqual(off, []);
    },
  );
}
