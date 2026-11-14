// What each policy of the gate gives on the runs of a night: for each branch, scenario and order,
// how many rounds fail, how many stay inconclusive, how many get the expected verdict of BRANCHES
// right, and how many runs a side the policy spends on average.
// Usage: node report.mjs <label> [--policies 5,7,9,5-9]
//   a number is that many runs a side; a range a-b takes a runs, and b when a leaves a metric inconclusive
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { BRANCHES, SCENARIOS } from "../regressions/measure.mjs";
import { escalating, fixed, rateOf } from "./policies.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ORDERS = ["adjacent", "interleaved"];

export function policiesOf(spec) {
  return spec.split(",").map((part) => {
    const range = /^(\d+)-(\d+)$/.exec(part.trim());
    if (range) return escalating(Number(range[1]), Number(range[2]));
    if (/^\d+$/.test(part.trim())) return fixed(Number(part));
    throw new Error(`Unknown policy "${part}": give a number of runs, such as 5, or a range, such as 5-9`);
  });
}

// The verdict the workshop expects of a branch in a scenario: a regression fails in the scenario of its
// metric, and the control passes everywhere. BRANCHES says nothing of the other scenarios.
export function expectedOf(ref, scenario, branches = BRANCHES) {
  const branch = branches.find((b) => b.ref === ref);
  if (!branch) return null;
  if (!branch.expect) return { verdict: "pass" };
  return branch.expect.scenario === scenario ? { verdict: "fail", metric: branch.expect.metric } : null;
}

const isRight = (expected, result) => (expected.verdict === "fail" ? result.regressed.includes(expected.metric) : result.verdict === "pass");

// One row per branch, scenario, order and policy, over the rounds measured
export function reportRows(results, { branches = BRANCHES, policies = policiesOf("5,7,9,5-9") } = {}) {
  const groups = new Map();
  for (const record of results.records) {
    const key = `${record.branch}\u0000${record.scenario}\u0000${record.order}`;
    if (!groups.has(key)) groups.set(key, { branch: record.branch, scenario: record.scenario, order: record.order, rounds: [] });
    groups.get(key).rounds.push({ baseline: record.baseline, candidate: record.candidate });
  }
  const rank = (list, value) => (list.includes(value) ? list.indexOf(value) : list.length);
  const sorted = [...groups.values()].sort(
    (a, b) =>
      rank(branches.map((x) => x.ref), a.branch) - rank(branches.map((x) => x.ref), b.branch) ||
      rank(SCENARIOS.map((s) => s.id), a.scenario) - rank(SCENARIOS.map((s) => s.id), b.scenario) ||
      rank(ORDERS, a.order) - rank(ORDERS, b.order),
  );

  return sorted.flatMap(({ branch, scenario, order, rounds }) => {
    const expected = expectedOf(branch, scenario, branches);
    return policies.map((policy) => {
      const row = { branch, scenario, order, expected, policy: policy.name, rounds: rounds.length };
      try {
        const rate = rateOf(policy, rounds);
        const right = expected ? rounds.filter((r) => isRight(expected, policy.decide(r.baseline, r.candidate))).length : null;
        return { ...row, fail: rate.fail, inconclusive: rate.inconclusive, right, runs: rate.runs };
      } catch (err) {
        // The policy needs more runs a side than the night measured
        if (!/^The policy needs/.test(err.message)) throw err;
        return { ...row, fail: null, inconclusive: null, right: null, runs: null };
      }
    });
  });
}

const describeExpected = (expected) => (!expected ? "not set" : expected.verdict === "fail" ? `fail (${expected.metric})` : "pass");
const cell = (value, format = String) => (value === null ? "-" : format(value));

export function formatTable(rows) {
  return [
    "| Branch | Scenario | Order | Expected | Policy | Rounds | Fail | Inconclusive | Right | Runs a side |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| \`${r.branch}\` | ${r.scenario} | ${r.order} | ${describeExpected(r.expected)} | ${r.policy} | ${r.rounds} | ${cell(r.fail)} | ${cell(r.inconclusive)} | ${cell(r.right)} | ${cell(r.runs, (n) => n.toFixed(1))} |`,
    ),
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { policies: { type: "string", default: "5,7,9,5-9" } } });
  const [label] = positionals;
  if (!label) {
    console.error("Usage: node report.mjs <label> [--policies 5,7,9,5-9]");
    process.exit(2);
  }
  const results = JSON.parse(await readFile(join(HERE, "results", `${label}.json`), "utf8"));
  console.log(formatTable(reportRows(results, { policies: policiesOf(values.policies) })));
  const c = results.conditions;
  if (c) {
    console.log(
      `\n${results.label}: ${results.runs} runs a side${results.load ? ", with ollama generating" : ""}. ${c.args.join(" ")}, ${c.browser.build} ${c.browser.version}, CLI ${c.cliVersion}, ${c.machine.arch} with ${c.machine.cores} cores and ${c.machine.memoryGB} GB`,
    );
  }
}
