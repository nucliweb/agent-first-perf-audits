// The claims of the guides, checked on the saved rehearsals of results/: the commands are the ones the
// guides write today, the pass and fail counts they print are the measured ones, each command exits as
// its guide says, the machine time of each step fits in its slot of the agenda of PLAN.md, step 5 gives
// three failures and a pass, and the output of each command has the lines its guide shows. It does not
// run anything: node rehearse.mjs writes results/<profile>.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { agendaOf, agendaRowsOf, pointOf } from "./guide.mjs";
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

// The table of the READMEs of the experiment: the machine time of each step with each profile, next
// to its slot in the agenda, with the decimal mark of each language
const READMES = { "README.md": ".", "README.es.md": ",", "README.ca.md": "," };
const full = Object.fromEntries(
  ["llm", "lite"].filter((profile) => files.includes(`${profile}.json`)).map((profile) => [profile, JSON.parse(readFileSync(join(RESULTS, `${profile}.json`), "utf8"))]),
);
const bothFull = full.llm?.complete && full.lite?.complete;

test("the table of machine times of the three READMEs is the one of the two rehearsals", { skip: !bothFull && "it needs a finished rehearsal of each profile" }, () => {
  const times = { llm: stepTimesOf(full.llm.commands), lite: stepTimesOf(full.lite.commands) };
  const steps = Object.keys(slots).filter((step) => step in times.llm && step in times.lite);
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const missing = [];
  for (const [name, mark] of Object.entries(READMES)) {
    const text = readFileSync(join(import.meta.dirname, name), "utf8");
    const min = (ms) => `${minutes(ms).replace(".", mark)} min`;
    const rows = [
      ...steps.map((step) => `| ${Number(step.slice(5))} | ${min(times.llm[step])} | ${min(times.lite[step])} | ${slots[step]} min |`),
      `| Total | ${min(sum(steps.map((step) => times.llm[step])))} | ${min(sum(steps.map((step) => times.lite[step])))} | ${sum(steps.map((step) => slots[step]))} min |`,
    ];
    for (const row of rows) if (!text.includes(row)) missing.push(`${name}: ${row}`);
  }
  assert.deepEqual(missing, []);
});

// The table of times of the guide of each step, in the three languages: its slot in the agenda, the
// machine time of the step with each profile and a row for each command that takes a minute or more
const GUIDES = {
  es: { mark: ",", minutes: "minutos", total: "Tiempo de máquina del paso", point: "Punto" },
  ca: { mark: ",", minutes: "minuts", total: "Temps de màquina del pas", point: "Punt" },
  en: { mark: ".", minutes: "minutes", total: "Machine time of the step", point: "Point" },
};
const LONG = 60_000;
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("the table of times of each step guide is the one of the two rehearsals, in the three languages", { skip: !bothFull && "it needs a finished rehearsal of each profile" }, () => {
  const times = { llm: stepTimesOf(full.llm.commands), lite: stepTimesOf(full.lite.commands) };
  const steps = Object.keys(slots).filter((step) => step in times.llm && step in times.lite);
  // Where each command is in the guides today: the lines of a rehearsal are the ones of its day
  const today = planOf(REPO);
  const missing = [];
  for (const [language, words] of Object.entries(GUIDES)) {
    const min = (ms) => `${minutes(ms).replace(".", words.mark)} min`;
    for (const step of steps) {
      const file = `docs/src/content/docs/${language}/workshop/${step}.md`;
      const text = readFileSync(join(REPO, file), "utf8");
      const spanish = readFileSync(join(REPO, `docs/src/content/docs/es/workshop/${step}.md`), "utf8");
      if (!text.includes(`${slots[step]} ${words.minutes}`)) missing.push(`${file}: its slot, ${slots[step]} ${words.minutes}`);
      const total = `| ${words.total} | ${min(times.llm[step])} | ${min(times.lite[step])} |`;
      if (!text.includes(total)) missing.push(`${file}: ${total}`);
      const long = full.llm.commands.filter((c) => c.step === step && c.status === "ran" && c.marker !== "optional" && c.durationMs >= LONG);
      for (const command of long) {
        const lite = full.lite.commands.find((c) => c.file === command.file && c.index === command.index);
        const point = pointOf(spanish, today.find((c) => c.file === command.file && c.index === command.index)?.line ?? command.line);
        const row = new RegExp(`^\\| ${words.point} ${point}\\b[^|]*\\| ${escaped(min(command.durationMs))} \\| ${escaped(min(lite.durationMs))} \\|$`, "m");
        if (!row.test(text)) missing.push(`${file}: | ${words.point} ${point}, ... | ${min(command.durationMs)} | ${min(lite.durationMs)} |`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

// The agenda of the page that says how to follow the workshop, in the three languages: a row for each
// row of the agenda of PLAN.md, with when it starts, its minutes and the machine time of its step with
// each profile, and a last row with the two totals
const INDEX = { es: ",", ca: ",", en: "." };

test("the agenda of the page that says how to follow the workshop is the one of PLAN.md, with the times of the two rehearsals", { skip: !bothFull && "it needs a finished rehearsal of each profile" }, () => {
  const times = { llm: stepTimesOf(full.llm.commands), lite: stepTimesOf(full.lite.commands) };
  const rows = agendaRowsOf(readFileSync(join(REPO, "PLAN.md"), "utf8"));
  const sum = (profile) => rows.reduce((total, row) => total + (times[profile][row.step] ?? 0), 0);
  const missing = [];
  for (const [language, mark] of Object.entries(INDEX)) {
    const file = `docs/src/content/docs/${language}/workshop/index.md`;
    const text = readFileSync(join(REPO, file), "utf8");
    const min = (ms) => (ms === undefined ? "" : `${minutes(ms).replace(".", mark)} min`);
    const cells = (...values) => values.map((value) => (value ? ` ${escaped(value)} ` : " ?")).join("\\|");
    for (const row of rows) {
      const name = row.step ? `\\[${Number(row.step.slice(5))}\\. [^|]*` : "[^|[]*";
      const line = new RegExp(`^\\| ${row.start} \\| ${name}\\|${cells(`${row.slot} min`, min(times.llm[row.step]), min(times.lite[row.step]))}\\|$`, "m");
      if (!line.test(text)) missing.push(`${file}: | ${row.start} | ${row.step ?? "no step"} | ${row.slot} min | ${min(times.llm[row.step])} | ${min(times.lite[row.step])} |`);
    }
    const total = new RegExp(`^\\| +\\| [^|]*\\|${cells(`${rows.reduce((all, row) => all + row.slot, 0)} min`, min(sum("llm")), min(sum("lite")))}\\|$`, "m");
    if (!total.test(text)) missing.push(`${file}: the row of the totals, ${min(sum("llm"))} and ${min(sum("lite"))}`);
  }
  assert.deepEqual(missing, []);
});

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
