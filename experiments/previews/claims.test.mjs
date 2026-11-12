// The claims of the page "Las ramas en el navegador", checked on the saved results.json: what each
// preview changes, which regressions show with and without network throttling, and the figures of
// the page in its three languages. It does not measure: npm run measure rewrites results.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const results = JSON.parse(readFileSync(new URL("./results.json", import.meta.url), "utf8"));
const site = (name, condition) => results.sites[name][condition];
const median = (name, condition) => site(name, condition).median;

const PAGES = { es: "es", ca: "ca", en: "en" };
const page = (lang) => readFileSync(new URL(`../../docs/src/content/docs/${PAGES[lang]}/previews.md`, import.meta.url), "utf8");

test("every site loads without errors in every run", () => {
  for (const [name, conditions] of Object.entries(results.sites)) {
    for (const [condition, entry] of Object.entries(conditions)) {
      assert.deepEqual(entry.errors, [], `${name}, ${condition}`);
      assert.equal(entry.runs.length, results.runs, `${name}, ${condition}`);
    }
  }
});

test("only pr/lcp-hero-lazy lazy-loads the hero and drops its fetchpriority", () => {
  for (const name of Object.keys(results.sites)) {
    const expected = name === "pr/lcp-hero-lazy" ? { loading: "lazy", fetchpriority: "(not set)" } : { loading: "(not set)", fetchpriority: "high" };
    assert.deepEqual(site(name, "cpu-4x-fast-4g").hero, expected, name);
  }
});

test("with fast-4g, each branch regresses its metric against main, and the refactor does not", () => {
  const main = median("main", "cpu-4x-fast-4g");
  assert.ok(median("pr/lcp-hero-lazy", "cpu-4x-fast-4g").lcp > main.lcp * 1.3, "the LCP of the lazy hero");
  assert.equal(main.cls, 0);
  assert.ok(median("pr/cls-promo-banner", "cpu-4x-fast-4g").cls >= 0.05, "the CLS of the promo banner");
  const loaf = median("pr/loaf-cart-handler", "cpu-4x-fast-4g");
  assert.ok(loaf.click > main.click * 2, "the add to cart click of the heavy handler");
  assert.ok(loaf.lcp > main.lcp * 1.15, "the LCP behind the synchronous A/B testing script");
  const noop = median("pr/noop-refactor", "cpu-4x-fast-4g");
  assert.ok(Math.abs(noop.lcp - main.lcp) <= main.lcp * 0.15, "the LCP of the refactor");
  assert.equal(noop.cls, 0);
  assert.ok(noop.click <= main.click * 1.25, "the click of the refactor");
});

test("without network throttling the lazy hero does not show, and the other two regressions do", () => {
  const main = median("main", "cpu-4x");
  assert.ok(Math.abs(median("pr/lcp-hero-lazy", "cpu-4x").lcp - main.lcp) <= main.lcp * 0.15, "the LCP of the lazy hero");
  assert.ok(median("pr/cls-promo-banner", "cpu-4x").cls >= 0.05, "the CLS of the promo banner");
  assert.ok(median("pr/loaf-cart-handler", "cpu-4x").click > main.click * 2, "the add to cart click of the heavy handler");
});

// A row of the tables of the page: the branch, the LCP, the CLS and the click, with the decimal
// separator of the language
const row = (name, condition, lang) => {
  const { lcp, cls, click } = median(name, condition);
  const score = lang === "en" ? String(cls) : String(cls).replace(".", ",");
  return `| \`${name}\` | ${lcp} ms | ${score} | ${click} ms |`;
};

for (const lang of Object.keys(PAGES)) {
  test(`the figures of the page in ${lang} are the medians of results.json`, () => {
    const text = page(lang);
    for (const condition of results.conditions) {
      for (const name of Object.keys(results.sites)) assert.ok(text.includes(row(name, condition, lang)), `${condition}: ${row(name, condition, lang)}`);
    }
  });
}

// The slide of the previews: the figures with fast-4g, the conditions of the gate
const SLIDES = { es: "index.html", ca: "ca/index.html", en: "en/index.html" };
const slideRow = (name, lang) => {
  const { lcp, cls, click } = median(name, "cpu-4x-fast-4g");
  const score = lang === "en" ? String(cls) : String(cls).replace(".", ",");
  return `<code>${name}</code></a></td><td>${lcp} ms</td><td>${score}</td><td>${click} ms</td>`;
};

for (const [lang, file] of Object.entries(SLIDES)) {
  test(`the figures of the slides in ${lang} are the medians of results.json with fast-4g`, () => {
    const text = readFileSync(new URL(`../../docs/public/slides/${file}`, import.meta.url), "utf8");
    for (const name of Object.keys(results.sites)) assert.ok(text.includes(slideRow(name, lang)), slideRow(name, lang));
  });
}
