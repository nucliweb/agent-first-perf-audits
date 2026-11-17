// The claims of the page of the challenges, checked on the saved run of results.json: the commands are
// the ones the page writes today, each gate exits as the page shows, and what the page says of each
// report (which metric fails, which one stops failing without throttling, what the rules point at) is
// what the reports said. It does not run anything: node run.mjs writes results.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { planOf } from "../rehearsal/rehearse.mjs";
import { EDITS, PAGE, PRELOAD, SOURCES, THROTTLED, UNTHROTTLED, chat } from "./run.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const FILE = join(import.meta.dirname, "results.json");
const results = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : null;
const skip = !results ? "no results.json yet: run node run.mjs on the reference machine" : !results.complete && "results.json is from a run that did not finish";

// The reports of the gate that follows an edit: the ones of the first command, from the one the edit
// goes before, that ran a gate
function gatesAfter(edit) {
  const at = results.commands.findIndex((c) => c.edits?.includes(edit));
  assert.notEqual(at, -1, `no command with the edit ${edit}`);
  const gate = results.commands.slice(at).find((c) => c.reports);
  assert.ok(gate, `no gate after the edit ${edit}`);
  return gate.reports;
}
const gateAfter = (edit) => gatesAfter(edit)[0];
const verdicts = (report) => Object.fromEntries(Object.entries(report.metrics).flatMap(([scenario, metrics]) => Object.entries(metrics).map(([metric, m]) => [`${scenario} ${metric}`, m.verdict])));
const regressed = (report) => Object.entries(verdicts(report)).filter(([, verdict]) => verdict === "regressed").map(([name]) => name);

test("the run took every command of the page as it writes it today", { skip }, () => {
  const key = (c) => `${c.index} ${c.command}`;
  assert.deepEqual(results.commands.map(key), planOf(REPO, { sources: SOURCES }).map(key), "the page changed after the run: run it again");
});

test("every command of the page ends well, and its output has the lines the page shows, the exit code of each gate among them", { skip }, () => {
  assert.deepEqual(results.commands.filter((c) => c.status !== "ran" || c.exitCode !== 0).map((c) => `${c.file}:${c.line}: ${c.status}, exit ${c.exitCode}`), []);
  assert.deepEqual(results.commands.filter((c) => c.matched === false).map((c) => `${c.file}:${c.line}: missing ${c.missing.join(", ")}`), []);
  assert.equal(results.commands.filter((c) => c.matched === true).length, 6, "the six blocks of the page that show an exit code");
});

test("challenge 1: with the attribute fixed the LCP still fails and the rules point at the preload; with the preload back, the gate passes and no model is asked", { skip }, () => {
  const half = gateAfter("fix-attribute");
  assert.equal(half.verdict, "fail");
  assert.deepEqual(regressed(half), ["home LCP"]);
  assert.ok(half.ruleFacts.some((f) => f.metric === "LCP" && f.facts.some((fact) => fact.includes("lcpImageFor"))), "a fact of the rules names lcpImageFor");
  const whole = gateAfter("fix-preload");
  assert.equal(whole.verdict, "pass");
  assert.deepEqual(regressed(whole), []);
  assert.ok(whole.explained.every((e) => e.source === "rules"), "the answer of the rules, not of the LLM");
});

test("challenge 3: without throttling the LCP of the hero passes, the CLS fails the same and the cart handler still fails for the LCP", { skip }, () => {
  const [hero, banner, cart] = gatesAfter("unthrottled");
  for (const report of [hero, banner, cart]) assert.match(report.conditions, /^--runs 5 --max-runs 7(,|$)/, `${report.branch}: no --cpu and no --network`);
  assert.deepEqual([hero.branch, hero.verdict, regressed(hero)], ["pr/lcp-hero-lazy", "pass", []]);
  assert.equal(banner.verdict, "fail");
  assert.ok(regressed(banner).includes("home CLS"));
  assert.equal(cart.verdict, "fail");
  assert.ok(regressed(cart).includes("home LCP"));
  // The INP of the branch is still worse and the statistics see it. Whether the change beats its
  // threshold depends on the speed of the machine, so the page does not say it and this does not check it
  const inp = cart.metrics["add-to-cart"].INP;
  assert.ok(inp.candidate > inp.baseline && inp.p < 0.05, JSON.stringify(inp));
});

test("challenge 4: without defer the gate passes, a slow chat with defer fails for the LCP, and with async it passes with a better LCP than main", { skip }, () => {
  const blocking = gateAfter("no-defer");
  assert.deepEqual([blocking.verdict, verdicts(blocking)["home LCP"]], ["pass", "unchanged"]);
  const slow = gateAfter("slow-defer");
  assert.deepEqual([slow.verdict, regressed(slow)], ["fail", ["home LCP"]]);
  const async = gateAfter("slow-async");
  assert.equal(async.verdict, "pass");
  const lcp = async.metrics.home.LCP;
  assert.ok(lcp.candidate < lcp.baseline, `the LCP of the branch, ${lcp.candidate} ms, against ${lcp.baseline} ms of main`);
});

for (const lang of ["es", "ca", "en"]) {
  test(`the page in ${lang} shows the lines that the run changes by hand`, () => {
    const text = readFileSync(join(REPO, PAGE.replace("/es/", `/${lang}/`)), "utf8");
    for (const line of [PRELOAD, THROTTLED, UNTHROTTLED, chat("defer", 300), chat("defer", 1500), chat("async", 1500), 'loading="lazy"', 'fetchPriority="high"']) {
      assert.ok(text.includes(line), `${lang}: ${line}`);
    }
  });
}

// The table of the READMEs of the experiment: a row for each gate of the run, with the challenge and the
// edit it follows, its branch, its exit code and the metrics that regress
const READMES = { "README.md": "None", "README.es.md": "Ninguna", "README.ca.md": "Cap" };

for (const [name, none] of Object.entries(READMES)) {
  test(`the table of results of ${name} is the one of the run`, { skip }, () => {
    const text = readFileSync(join(import.meta.dirname, name), "utf8");
    const rows = EDITS.flatMap((edit) =>
      gatesAfter(edit.id).map((report) => {
        const worse = Object.entries(report.metrics).flatMap(([scenario, metrics]) => Object.entries(metrics).filter(([, m]) => m.verdict === "regressed").map(([metric]) => `${scenario}: ${metric}`));
        return `| ${edit.challenge} | \`${edit.id}\` | \`${report.branch}\` | exit ${report.verdict === "fail" ? 1 : 0} | ${worse.join(", ") || none} |`;
      }),
    );
    assert.equal(rows.length, 8);
    assert.deepEqual(rows.filter((row) => !text.includes(row)), []);
  });
}
