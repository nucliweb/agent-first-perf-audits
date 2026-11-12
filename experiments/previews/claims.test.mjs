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

test("on pr/loaf-cart-handler the click spends its extra time in processing, the handler", () => {
  const main = site("main", "cpu-4x-fast-4g");
  const loaf = site("pr/loaf-cart-handler", "cpu-4x-fast-4g");
  const sum = (phases) => phases.inputDelay + phases.processing + phases.presentation;
  for (const entry of [main, loaf]) assert.ok(Math.abs(sum(entry.phases) - entry.median.click) <= 24, JSON.stringify(entry.phases));
  const growth = loaf.median.click - main.median.click;
  assert.ok(loaf.phases.processing - main.phases.processing >= growth * 0.7, `processing ${main.phases.processing} to ${loaf.phases.processing}, click +${growth} ms`);
});

// The evidence of the page and the slides: evidence.json, written by evidence.mjs with the images
const evidence = JSON.parse(readFileSync(new URL("./evidence.json", import.meta.url), "utf8"));
const IMAGES = ["lcp-filmstrip.jpg", "cls-shift.jpg", "inp-phases.png"];

test("in the filmstrip the LCP of pr/lcp-hero-lazy lands later than the one of main", () => {
  assert.ok(evidence.lcp["pr/lcp-hero-lazy"] > evidence.lcp.main * 1.2, JSON.stringify(evidence.lcp));
});

test("the layout shift of pr/cls-promo-banner moves the content down, and main has none", () => {
  assert.equal(evidence.cls.main, 0);
  assert.ok(evidence.cls.branch >= 0.05, `CLS ${evidence.cls.branch}`);
  assert.ok(evidence.cls.px > 0, `${evidence.cls.px} px`);
});

for (const lang of Object.keys(PAGES)) {
  test(`the images of the evidence exist in ${lang}, and the page and the slides show them`, () => {
    const slides = readFileSync(new URL(`../../docs/public/slides/${SLIDES[lang]}`, import.meta.url), "utf8");
    for (const image of IMAGES) {
      const file = image.replace(".", `-${lang}.`);
      const bytes = readFileSync(new URL(`../../docs/public/evidence/${file}`, import.meta.url)).length;
      assert.ok(bytes > 10_000 && bytes < 400_000, `${file}: ${bytes} bytes`);
      assert.ok(page(lang).includes(`/evidence/${file}`), `the page shows ${file}`);
      assert.ok(slides.includes(`/evidence/${file}`), `the slides show ${file}`);
    }
  });
}

// The captions of the evidence on the page: the LCP of the filmstrip, the pixels of the shift and
// the processing of the click, with the decimal separator of the language
const secondsOf = (ms, lang) => `${(ms / 1000).toFixed(2)} s`.replace(".", lang === "en" ? "." : ",");

for (const lang of Object.keys(PAGES)) {
  test(`the captions of the evidence in ${lang} cite evidence.json and results.json`, () => {
    const text = page(lang);
    const processing = (name) => `${site(name, "cpu-4x-fast-4g").phases.processing} ms`;
    for (const figure of [secondsOf(evidence.lcp.main, lang), secondsOf(evidence.lcp["pr/lcp-hero-lazy"], lang), `${evidence.cls.px} px`, processing("main"), processing("pr/loaf-cart-handler")]) {
      assert.ok(text.includes(figure), figure);
    }
  });
}
