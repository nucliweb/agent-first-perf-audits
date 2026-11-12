// Measures the shop of main and the four previews on Vercel, as a person would see them in their
// browser: the LCP and the CLS of the home, the LCP image, and the duration of the add to cart click
// on a product page. Each site, under each condition, RUNS times in a fresh browser context, one at
// a time; results.json keeps every run and the medians.
// Usage: node measure.mjs
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { CONDITIONS, RUNS, SITES } from "./sites.mjs";

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// Installed before any script of the page: the layout shifts without a recent input (the ones CLS
// counts), the last LCP candidate and the longest click or pointerdown
function observe() {
  window.__cls = 0;
  window.__lcp = null;
  window.__click = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => {
    window.__lcp = list.getEntries().at(-1).startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === "click" || entry.name === "pointerdown") window.__click = Math.max(window.__click, entry.duration);
    }
  }).observe({ type: "event", durationThreshold: 16, buffered: true });
}

async function measureOnce(browser, origin, { cpu, network }) {
  const context = await browser.newContext({ viewport: { width: 412, height: 823 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    if (network) {
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", network);
    }
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(observe);

    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const home = await page.evaluate(() => {
      const hero = document.querySelector("img.hero__image");
      return {
        lcp: Math.round(window.__lcp),
        cls: Number(window.__cls.toFixed(4)),
        hero: { loading: hero?.getAttribute("loading") ?? "(not set)", fetchpriority: hero?.getAttribute("fetchpriority") ?? "(not set)" },
      };
    });

    await page.goto(`${origin}/product/kenya-aa`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.click('button:has-text("Add to cart")');
    await page.waitForTimeout(800);
    const click = await page.evaluate(() => Math.round(window.__click));
    return { ...home, click, errors };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch();
const results = { measuredAt: new Date().toISOString(), runs: RUNS, conditions: Object.keys(CONDITIONS), sites: {} };
try {
  for (const [condition, settings] of Object.entries(CONDITIONS)) {
    for (const [site, origin] of Object.entries(SITES)) {
      const runs = [];
      for (let i = 0; i < RUNS; i++) runs.push(await measureOnce(browser, origin, settings));
      const entry = {
        origin,
        hero: runs[0].hero,
        median: { lcp: median(runs.map((r) => r.lcp)), cls: median(runs.map((r) => r.cls)), click: median(runs.map((r) => r.click)) },
        errors: runs.flatMap((r) => r.errors),
        runs: runs.map(({ lcp, cls, click }) => ({ lcp, cls, click })),
      };
      (results.sites[site] ??= {})[condition] = entry;
      console.log(`${condition.padEnd(15)} ${site.padEnd(21)} LCP ${entry.median.lcp} ms, CLS ${entry.median.cls}, click ${entry.median.click} ms`);
    }
  }
} finally {
  await browser.close();
}
writeFileSync(new URL("./results.json", import.meta.url), `${JSON.stringify(results, null, 2)}\n`);
