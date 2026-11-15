// The figures that the docs give about how the gate decides are the ones of the code: the p-values
// of the tolerance table in the READMEs of this experiment and in the page of concepts, and the
// thresholds, the conditions and the network preset that the page of concepts quotes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_THRESHOLDS } from "webperf-snippets/src/baseline.js";
import { NETWORK_PRESETS } from "webperf-snippets/src/throttling.js";
import { CONDITIONS } from "../../agents/src/judge/gate.ts";
import { slowBaselineP } from "./policies.mjs";
import { policiesOf, summaryOf } from "./report.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const READMES = { es: "README.es.md", ca: "README.ca.md", en: "README.md" };
const LANGS = Object.keys(READMES);

// A figure as each language writes it: a decimal comma in Spanish and Catalan
const local = (text, lang) => (lang === "en" ? text : text.replace(".", ","));
const p = (runs, slow, lang) => {
  const value = slowBaselineP(runs, slow);
  return value < 0.0001 ? `< ${local("0.0001", lang)}` : local(String(Number(value.toFixed(4))), lang);
};
const row = (runs, lang) => `| ${runs} | ${[0, 1, 2].map((slow) => p(runs, slow, lang)).join(" | ")} |`;

for (const lang of LANGS) {
  test(`the tolerance table of the README in ${lang} is what the test of the CLI gives`, () => {
    const text = read(READMES[lang]);
    for (const runs of [5, 7, 9]) assert.ok(text.includes(row(runs, lang)), row(runs, lang));
  });

  test(`the tolerance table of the page of concepts in ${lang} is what the test of the CLI gives`, () => {
    const text = read(`../../docs/src/content/docs/${lang}/concepts.md`);
    for (const runs of [5, 7, 9]) assert.ok(text.includes(row(runs, lang)), row(runs, lang));
  });

  test(`the page of concepts in ${lang} quotes the thresholds, the conditions and the network of the gate`, () => {
    const text = read(`../../docs/src/content/docs/${lang}/concepts.md`);
    const has = (figure) => assert.ok(text.includes(local(figure, lang)), `${lang}: ${figure}`);
    const percent = (share) => (lang === "en" ? `${share * 100}%` : `${share * 100} %`);

    // What a change has to beat: the larger of a share of the baseline and a minimum
    for (const [metric, minimum] of [["LCP", "100 ms"], ["INP", "50 ms"]]) {
      assert.equal(`${DEFAULT_THRESHOLDS[metric].absolute} ms`, minimum);
      has(percent(DEFAULT_THRESHOLDS[metric].relative));
      has(minimum);
    }
    has(String(DEFAULT_THRESHOLDS.CLS.absolute));

    // The conditions of the gate
    const condition = (flag) => CONDITIONS[CONDITIONS.indexOf(flag) + 1];
    has(`CPU ${condition("--cpu")}x`);
    has(`--runs ${condition("--runs")}`);
    const network = NETWORK_PRESETS[condition("--network")];
    has(network.title);
    has(`${(network.download * 8) / 1e6} Mbps`);
    has(`${(network.upload * 8) / 1e6} Mbps`);
    has(`${network.latency} ms`);
  });
}

// --- The two nights of measurement ------------------------------------------------------------------

const NIGHTS = { idle: JSON.parse(read("results/idle.json")), loaded: JSON.parse(read("results/loaded.json")) };
const SPECS = ["5", "7", "9", "5-7", "5-9"];
const summary = (night) => summaryOf(NIGHTS[night], { policies: policiesOf(SPECS.join(",")) });
const pick = (night, order, spec) => summary(night).find((s) => s.order === order && s.policy === policiesOf(spec)[0].name);

const WORDS = {
  es: { adjacent: "Adyacente", interleaved: "Intercalado", of: "de", escalating: (a, b) => `${a}, y ${b} si no es concluyente` },
  ca: { adjacent: "Adjacent", interleaved: "Intercalat", of: "de", escalating: (a, b) => `${a}, i ${b} si no és concloent` },
  en: { adjacent: "Adjacent", interleaved: "Interleaved", of: "of", escalating: (a, b) => `${a}, and ${b} when inconclusive` },
};
const policyLabel = (spec, lang) => (spec.includes("-") ? WORDS[lang].escalating(...spec.split("-")) : spec);
const nightRow = (night, order, spec, lang) => {
  const s = pick(night, order, spec);
  const w = WORDS[lang];
  return `| ${w[order]} | ${policyLabel(spec, lang)} | ${s.regressions.missed} ${w.of} ${s.regressions.rounds} | ${s.control.failed} ${w.of} ${s.control.rounds} | ${local(s.runs.toFixed(2), lang)} |`;
};

for (const lang of LANGS) {
  test(`the tables of the two nights in the README in ${lang} are the summary of the results`, () => {
    const text = read(READMES[lang]);
    for (const night of ["idle", "loaded"]) {
      for (const order of ["adjacent", "interleaved"]) {
        for (const spec of SPECS) assert.ok(text.includes(nightRow(night, order, spec, lang)), `${night}: ${nightRow(night, order, spec, lang)}`);
      }
    }
  });
}

test("idle, the gate of 5 runs a side misses a regression and no other policy does", () => {
  for (const order of ["adjacent", "interleaved"]) {
    assert.equal(pick("idle", order, "5").regressions.missed, 1);
    for (const spec of ["7", "9", "5-7", "5-9"]) assert.equal(pick("idle", order, spec).regressions.missed, 0, `${order} ${spec}`);
    for (const spec of SPECS) assert.equal(pick("idle", order, spec).control.failed, 0, `${order} ${spec}`);
  }
});

test("with ollama generating, measuring the baseline first makes the control fail with every policy", () => {
  for (const spec of SPECS) assert.ok(pick("loaded", "adjacent", spec).control.failed >= 3, spec);
  for (const spec of ["5", "7", "5-7"]) assert.equal(pick("loaded", "interleaved", spec).control.failed, 0, spec);
});

test("with ollama generating, the gate of today misses 4 regressions of 60, 3 of them the LCP of the hero", () => {
  assert.deepEqual(pick("loaded", "adjacent", "5").regressions, { rounds: 60, missed: 4 });
  const hero = NIGHTS.loaded.records.filter((r) => r.branch === "pr/lcp-hero-lazy" && r.order === "adjacent");
  const missed = hero.filter((r) => !policiesOf("5")[0].decide(r.baseline, r.candidate).regressed.includes("LCP"));
  assert.deepEqual([hero.length, missed.length], [20, 3]);
});

test("the policy that meets the rule: interleaved, 5 runs a side and 7 when inconclusive", () => {
  const idle = pick("idle", "interleaved", "5-7");
  const loaded = pick("loaded", "interleaved", "5-7");
  assert.equal(idle.regressions.missed, 0);
  assert.ok(loaded.regressions.missed / loaded.regressions.rounds <= 0.1);
  assert.deepEqual([idle.control.failed, loaded.control.failed], [0, 0]);
  // The only cheaper one, 5 fixed runs, misses a regression idle; the others that meet the rule spend more
  assert.ok(idle.runs < 5.1 && loaded.runs < 5.1);
  assert.equal(pick("loaded", "interleaved", "5-9").control.failed, 1);
  assert.equal(pick("loaded", "interleaved", "9").control.failed, 1);
});

test("with ollama generating, the machine runs at about half its speed", () => {
  const index = (night) => {
    const all = NIGHTS[night].records.flatMap((r) => [...r.baseline, ...r.candidate]).map((run) => run.conditions.machine.benchmarkIndex).sort((a, b) => a - b);
    return all[Math.floor(all.length / 2)];
  };
  assert.deepEqual([index("idle"), index("loaded")], [2154, 1059]);
  for (const lang of LANGS) for (const figure of ["2154", "1059"]) assert.ok(read(READMES[lang]).includes(figure), `${lang}: ${figure}`);
});
