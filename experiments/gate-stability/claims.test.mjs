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
