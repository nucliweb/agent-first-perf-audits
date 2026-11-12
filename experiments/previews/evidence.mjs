// The evidence of each regression, as images for the page "Las ramas en el navegador" and the slides,
// in Spanish, Catalan and English, with the conditions of the gate (CPU 4x and fast-4g):
//   LCP: a filmstrip of the load of the home of main and of pr/lcp-hero-lazy, from a trace with
//        screenshots, with the frame where each LCP lands: of RUNS loads, the one with the median LCP
//   CLS: the home of pr/cls-promo-banner right after its layout shift, with where the content was and
//        where it went, next to main, which reserves the space of the banner
//   INP: the three phases of the add to cart click of main and of pr/loaf-cart-handler, the medians
//        of results.json
// evidence.json keeps the figures the captions cite. Usage: node evidence.mjs (after measure.mjs)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { CONDITIONS, RUNS, SITES, openPage } from "./sites.mjs";

const OUT = new URL("../../docs/public/evidence/", import.meta.url);
const GATE = CONDITIONS["cpu-4x-fast-4g"];
const FRAMES = [0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000];

const TEXT = {
  es: {
    lcpTitle: "La carga de la home, con CPU 4x y Fast 4G",
    lcpMark: "LCP",
    clsBefore: "antes",
    clsAfter: "después",
    clsMain: "main: el banner tiene su espacio",
    clsBranch: (px) => `pr/cls-promo-banner: el contenido baja ${px} px`,
    inpTitle: "El click en “Add to cart”, con CPU 4x y Fast 4G",
    phases: { inputDelay: "Retraso de entrada", processing: "Procesamiento", presentation: "Retraso de presentación" },
  },
  ca: {
    lcpTitle: "La càrrega de la home, amb CPU 4x i Fast 4G",
    lcpMark: "LCP",
    clsBefore: "abans",
    clsAfter: "després",
    clsMain: "main: el bàner té el seu espai",
    clsBranch: (px) => `pr/cls-promo-banner: el contingut baixa ${px} px`,
    inpTitle: "El clic a “Add to cart”, amb CPU 4x i Fast 4G",
    phases: { inputDelay: "Retard d’entrada", processing: "Processament", presentation: "Retard de presentació" },
  },
  en: {
    lcpTitle: "The load of the home page, with 4x CPU and Fast 4G",
    lcpMark: "LCP",
    clsBefore: "before",
    clsAfter: "after",
    clsMain: "main: the banner has its space",
    clsBranch: (px) => `pr/cls-promo-banner: the content moves down ${px} px`,
    inpTitle: "The “Add to cart” click, with 4x CPU and Fast 4G",
    phases: { inputDelay: "Input delay", processing: "Processing", presentation: "Presentation delay" },
  },
};

const seconds = (ms, lang) => `${(ms / 1000).toFixed(2).replace(/0$/, "")} s`.replace(".", lang === "en" ? "." : ",");

// The trace of the load of the home: a frame for each moment of FRAMES and the time of the LCP
async function filmstrip(browser, origin) {
  const { context, page } = await openPage(browser, GATE);
  try {
    await browser.startTracing(page, { screenshots: true, categories: ["devtools.timeline", "disabled-by-default-devtools.screenshot", "blink.user_timing", "loading"] });
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const { traceEvents } = JSON.parse((await browser.stopTracing()).toString());
    const navigation = traceEvents.filter((e) => e.name === "navigationStart" && e.args?.data?.documentLoaderURL?.startsWith(origin)).at(-1);
    const start = navigation.ts;
    const candidates = traceEvents.filter((e) => e.name === "largestContentfulPaint::Candidate" && e.ts >= start);
    const lcp = Math.round((candidates.at(-1).ts - start) / 1000);
    const shots = traceEvents.filter((e) => e.name === "Screenshot" && e.args?.snapshot).sort((a, b) => a.ts - b.ts);
    const frames = FRAMES.map((ms) => shots.filter((s) => s.ts <= start + ms * 1000).at(-1)?.args.snapshot ?? null);
    return { lcp, frames };
  } finally {
    await context.close();
  }
}

// The home right after its largest layout shift, at twice the pixels so its text reads well, and
// where the content that moved started and ended
async function shift(browser, origin) {
  const { context, page } = await openPage(browser, GATE, 2);
  try {
    await page.addInitScript(() => {
      window.__shifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          const sources = entry.sources.map((s) => ({ previous: s.previousRect.toJSON(), current: s.currentRect.toJSON() }));
          window.__shifts.push({ value: entry.value, sources });
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const largest = await page.evaluate(() => window.__shifts.sort((a, b) => b.value - a.value)[0] ?? null);
    let moved = null;
    if (largest) {
      // The source that covers the most of the page is the content that the banner pushes down
      const area = (r) => r.width * r.height;
      const main = largest.sources.sort((a, b) => area(b.previous) - area(a.previous))[0];
      moved = { before: main.previous.y, after: main.current.y };
    }
    const image = (await page.screenshot({ type: "jpeg", quality: 85 })).toString("base64");
    const px = moved ? Math.round(moved.after - moved.before) : 0;
    return { value: largest?.value ?? 0, px, moved, image };
  } finally {
    await context.close();
  }
}

// Renders a small HTML document to a PNG of its body
async function render(browser, html, file, width) {
  const context = await browser.newContext({ viewport: { width, height: 400 }, deviceScaleFactor: 2 });
  try {
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#f6f7f2;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#17221c">${html}</body></html>`);
    const jpeg = file.endsWith(".jpg");
    await page.locator("body > div").screenshot({ path: new URL(file, OUT).pathname, ...(jpeg ? { type: "jpeg", quality: 72 } : {}) });
  } finally {
    await context.close();
  }
}

const filmstripHtml = (lang, rows) => {
  const t = TEXT[lang];
  const head = FRAMES.map((ms) => `<div style="font:600 15px system-ui;color:#4a5a50;text-align:center">${seconds(ms, lang)}</div>`).join("");
  const row = ({ name, lcp, frames }) => {
    const landed = FRAMES.findIndex((ms) => ms >= lcp);
    const cells = frames.map((snapshot, i) => {
      const border = i === landed ? "4px solid #1f7a3e" : "1px solid #d6e0d8";
      const img = snapshot ? `<img src="data:image/jpeg;base64,${snapshot}" style="width:100%;display:block">` : `<div style="aspect-ratio:412/823;background:#fff"></div>`;
      const mark = i === landed ? `<div style="font:700 14px system-ui;color:#1f7a3e;text-align:center;margin-top:4px">${t.lcpMark} ${seconds(lcp, lang)}</div>` : `<div style="height:21px"></div>`;
      return `<div><div style="border:${border};border-radius:6px;overflow:hidden;background:#fff">${img}</div>${mark}</div>`;
    });
    return `<div style="font:700 18px ui-monospace,Menlo,monospace;margin:18px 0 8px">${name}</div><div style="display:grid;grid-template-columns:repeat(${FRAMES.length},1fr);gap:10px">${cells.join("")}</div>`;
  };
  return `<div style="padding:28px 32px;width:1336px"><div style="font:700 24px system-ui;margin-bottom:12px">${t.lcpTitle}</div><div style="display:grid;grid-template-columns:repeat(${FRAMES.length},1fr);gap:10px">${head}</div>${rows.map(row).join("")}</div>`;
};

const shiftHtml = (lang, main, branch) => {
  const t = TEXT[lang];
  // Lines across the screenshot, thin enough not to cover its text, and their labels outside it
  const marks = ({ before, after }) => `
    <div style="position:absolute;left:0;width:412px;top:${before}px;border-top:2px dashed #c2410c"></div>
    <div style="position:absolute;left:0;width:412px;top:${after}px;border-top:2px solid #c2410c"></div>
    <div style="position:absolute;left:424px;top:${before - 12}px;font:700 16px system-ui;color:#c2410c">${t.clsBefore}</div>
    <div style="position:absolute;left:424px;top:${after - 12}px;font:700 16px system-ui;color:#c2410c">${t.clsAfter}</div>
    <div style="position:absolute;left:520px;top:${before}px;height:${after - before}px;border-left:3px solid #c2410c"></div>
    <div style="position:absolute;left:532px;top:${(before + after) / 2 - 12}px;font:700 18px system-ui;color:#c2410c">${branch.px} px</div>`;
  const phone = (shot, caption, withMarks) =>
    `<div style="display:flex;flex-direction:column;gap:12px"><div style="position:relative;width:${withMarks ? 600 : 412}px"><img src="data:image/jpeg;base64,${shot.image}" style="width:412px;display:block;border:1px solid #d6e0d8;border-radius:12px">${withMarks ? marks(shot.moved) : ""}</div><div style="font:700 18px system-ui;max-width:412px">${caption}</div></div>`;
  return `<div style="padding:28px 32px;display:flex;gap:56px;width:min-content">${phone(main, t.clsMain, false)}${phone(branch, t.clsBranch(branch.px), true)}</div>`;
};

const phasesHtml = (lang, rows) => {
  const t = TEXT[lang];
  const colors = { inputDelay: "#3e4fc1", processing: "#c2410c", presentation: "#4a5a50" };
  const max = Math.max(...rows.map((r) => Object.values(r.phases).reduce((a, b) => a + b, 0)));
  const scale = 900 / max;
  const bar = ({ name, phases, click }) => {
    const parts = Object.entries(phases)
      .map(([k, ms]) => `<div style="width:${Math.max(ms * scale, 2)}px;background:${colors[k]};color:#fff;font:700 15px system-ui;display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap">${ms * scale >= 60 ? `${ms} ms` : ""}</div>`)
      .join("");
    // The median of the click, as in the tables: each phase is its own median, so they need not add up to it
    const total = click;
    return `<div style="display:grid;grid-template-columns:260px 1fr;align-items:center;gap:16px;margin:14px 0"><div style="font:700 18px ui-monospace,Menlo,monospace">${name}</div><div style="display:flex;align-items:center;gap:12px"><div style="display:flex;height:48px;border-radius:6px;overflow:hidden">${parts}</div><div style="font:600 16px system-ui;color:#4a5a50">${total} ms</div></div></div>`;
  };
  const legend = Object.entries(t.phases)
    .map(([k, label]) => `<div style="display:flex;align-items:center;gap:8px;font:600 16px system-ui"><span style="width:18px;height:18px;border-radius:4px;background:${colors[k]}"></span>${label}</div>`)
    .join("");
  return `<div style="padding:28px 32px;width:1336px"><div style="font:700 24px system-ui;margin-bottom:8px">${t.inpTitle}</div>${rows.map(bar).join("")}<div style="display:flex;gap:28px;margin-top:12px">${legend}</div></div>`;
};

const results = JSON.parse(readFileSync(new URL("./results.json", import.meta.url), "utf8"));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const lcpRows = [];
  for (const name of ["main", "pr/lcp-hero-lazy"]) {
    const loads = [];
    for (let i = 0; i < RUNS; i++) loads.push(await filmstrip(browser, SITES[name]));
    loads.sort((a, b) => a.lcp - b.lcp);
    lcpRows.push({ name, ...loads[Math.floor(loads.length / 2)], runs: loads.map((l) => l.lcp) });
  }
  const shifts = { main: await shift(browser, SITES.main), branch: await shift(browser, SITES["pr/cls-promo-banner"]) };
  const inpRows = ["main", "pr/loaf-cart-handler"].map((name) => {
    const { phases, median } = results.sites[name]["cpu-4x-fast-4g"];
    return { name, phases, click: median.click };
  });

  for (const lang of Object.keys(TEXT)) {
    await render(browser, filmstripHtml(lang, lcpRows), `lcp-filmstrip-${lang}.jpg`, 1400);
    await render(browser, shiftHtml(lang, shifts.main, shifts.branch), `cls-shift-${lang}.jpg`, 1200);
    await render(browser, phasesHtml(lang, inpRows), `inp-phases-${lang}.png`, 1400);
  }

  const evidence = {
    measuredAt: new Date().toISOString(),
    lcp: Object.fromEntries(lcpRows.map(({ name, lcp }) => [name, lcp])),
    lcpRuns: Object.fromEntries(lcpRows.map(({ name, runs }) => [name, runs])),
    cls: { main: Number(shifts.main.value.toFixed(4)), branch: Number(shifts.branch.value.toFixed(4)), px: shifts.branch.px },
  };
  writeFileSync(new URL("./evidence.json", import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
