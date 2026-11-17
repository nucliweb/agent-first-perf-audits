import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { findOverflows } from "./overflow.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(root, "public");
const fixturesDir = join(root, "test", "fixtures");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg" };

const decks = { es: "/slides/", ca: "/slides/ca/", en: "/slides/en/" };

let server, browser, base;

before(async () => {
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
    const isFixture = path.startsWith("/fixtures/");
    const file = isFixture ? join(fixturesDir, path.slice("/fixtures/".length)) : join(publicDir, path);
    try {
      const target = file.endsWith("/") ? join(file, "index.html") : file;
      // The file first: a missing one has to answer 404, not leave the page waiting for it
      const content = await readFile(target);
      res.writeHead(200, { "content-type": types[extname(target)] ?? "application/octet-stream" });
      res.end(content);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

async function openDeck(path) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto(base + path, { waitUntil: "load" });
  return { page, errors };
}

async function slideCount(page) {
  return page.locator(".slide").count();
}

test("the overflow detection flags the slide that overflows in the fixture", async () => {
  const { page } = await openDeck("/fixtures/overflow-deck.html");
  try {
    const overflows = await findOverflows(page);
    assert.deepEqual(overflows.map((o) => o.slide), [2]);
  } finally {
    await page.close();
  }
});

for (const [lang, path] of Object.entries(decks)) {
  test(`deck ${lang}: no slide has content outside its canvas`, async () => {
    const { page } = await openDeck(path);
    try {
      assert.deepEqual(await findOverflows(page), []);
    } finally {
      await page.close();
    }
  });

  test(`deck ${lang}: raises no JavaScript errors`, async () => {
    const { page, errors } = await openDeck(path);
    try {
      await page.keyboard.press("End");
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  });

  test(`deck ${lang}: the keyboard reaches the last slide`, async () => {
    const { page } = await openDeck(path);
    try {
      const total = await slideCount(page);
      for (let i = 1; i < total; i++) await page.keyboard.press("ArrowRight");
      assert.equal(await page.locator(".slide.is-current").count(), 1);
      assert.equal(await page.evaluate(() => location.hash), `#${total}`);
      assert.equal(await page.evaluate((n) => document.querySelectorAll(".slide")[n - 1].classList.contains("is-current"), total), true);
    } finally {
      await page.close();
    }
  });
}

test("the three decks have the same number of slides", async () => {
  const counts = {};
  for (const [lang, path] of Object.entries(decks)) {
    const { page } = await openDeck(path);
    counts[lang] = await slideCount(page);
    await page.close();
  }
  assert.equal(new Set(Object.values(counts)).size, 1, `slide counts differ: ${JSON.stringify(counts)}`);
});

// Notes and the presenter view

const fixture = "/fixtures/presenter-deck.html";
const START = new Date("2026-01-01T10:00:00Z");

async function openAt(context, path, { clocked = false, init } = {}) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (init) await page.addInitScript(init);
  if (clocked) await page.clock.install({ time: START });
  await page.goto(base + path, { waitUntil: "load" });
  // Pause the clock so the elapsed times are exact
  if (clocked) await page.clock.pauseAt(new Date(START.getTime() + 1000));
  return { page, errors };
}

async function withContext(run) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  try {
    await run(context);
  } finally {
    await context.close();
  }
}

const text = (page, selector) => page.locator(selector).innerText();

test("notes never show in the deck and never count as overflow", async () => {
  await withContext(async (context) => {
    const { page } = await openAt(context, fixture);
    const notes = page.locator(".notes");
    assert.equal(await notes.count(), 3);
    for (let i = 0; i < 5; i++) {
      for (const note of await notes.all()) assert.equal(await note.isVisible(), false);
      await page.keyboard.press("ArrowRight");
    }
    assert.deepEqual(await findOverflows(page), []);
  });
});

test("presenter: shows the current notes, the next slide and the counter, and follows the keyboard", async () => {
  await withContext(async (context) => {
    const { page, errors } = await openAt(context, `${fixture}?presenter`);
    assert.match(await text(page, "[data-presenter-notes]"), /Notes of intro/);
    assert.match(await text(page, "[data-presenter-next]"), /Context/);
    assert.equal(await text(page, "[data-presenter-counter]"), "1 / 5");
    assert.match(await text(page, "[data-presenter-current]"), /Intro/);
    await page.keyboard.press("ArrowRight");
    assert.equal(await text(page, "[data-presenter-notes]"), "No notes for this slide");
    assert.equal(await text(page, "[data-presenter-counter]"), "2 / 5");
    await page.keyboard.press("ArrowRight");
    assert.match(await text(page, "[data-presenter-notes]"), /Long note paragraph 60/);
    await page.keyboard.press("ArrowRight");
    assert.match(await text(page, "[data-presenter-notes]"), /Notes of step one/);
    assert.match(await text(page, "[data-presenter-next]"), /Wrap up/);
    await page.keyboard.press("ArrowRight");
    assert.equal(await text(page, "[data-presenter-next]"), "End of the deck");
    await page.keyboard.press("Home");
    assert.equal(await text(page, "[data-presenter-counter]"), "1 / 5");
    await page.keyboard.press("End");
    assert.equal(await text(page, "[data-presenter-counter]"), "5 / 5");
    assert.deepEqual(errors, []);
  });
});

test("presenter: opens on the slide of the hash and the title of the document stays", async () => {
  await withContext(async (context) => {
    const { page } = await openAt(context, `${fixture}?presenter#4`);
    assert.equal(await text(page, "[data-presenter-counter]"), "4 / 5");
    assert.equal(await page.title(), "Step one · Presenter fixture");
  });
});

test("presenter: the labels come from data attributes on body, with English defaults", async () => {
  await withContext(async (context) => {
    const { page } = await openAt(context, `${fixture}?presenter#5`);
    assert.equal(await page.locator("[data-presenter-label=next]").textContent(), "Next");
    assert.equal(await page.locator("[data-presenter-label=notes]").textContent(), "Notes");
    assert.equal(await page.locator("[data-presenter-label=clock]").textContent(), "Time");
  });
  await withContext(async (context) => {
    const { page } = await openAt(context, `${fixture}?presenter#5`, {
      init: () => {
        const observer = new MutationObserver(() => {
          if (!document.body) return;
          Object.assign(document.body.dataset, { labelNext: "Siguiente", labelNotes: "Notas", labelNoNotes: "Sin notas", labelEnd: "Fin", labelClock: "Tiempo" });
          observer.disconnect();
        });
        observer.observe(document, { childList: true, subtree: true });
      },
    });
    assert.equal(await page.locator("[data-presenter-label=next]").textContent(), "Siguiente");
    assert.equal(await page.locator("[data-presenter-label=notes]").textContent(), "Notas");
    assert.equal(await page.locator("[data-presenter-label=clock]").textContent(), "Tiempo");
    assert.equal(await text(page, "[data-presenter-notes]"), "Sin notas");
    assert.equal(await text(page, "[data-presenter-next]"), "Fin");
  });
});

test("presenter: the clock starts on the first slide change, advances and resets with r", async () => {
  await withContext(async (context) => {
    const { page } = await openAt(context, `${fixture}?presenter`, { clocked: true });
    await page.clock.fastForward(30_000);
    assert.equal(await text(page, "[data-presenter-clock]"), "0:00");
    await page.keyboard.press("ArrowRight");
    assert.equal(await text(page, "[data-presenter-clock]"), "0:00");
    await page.clock.fastForward(65_000);
    assert.equal(await text(page, "[data-presenter-clock]"), "1:05");
    await page.keyboard.press("r");
    assert.equal(await text(page, "[data-presenter-clock]"), "0:00");
    await page.clock.fastForward(5_000);
    assert.equal(await text(page, "[data-presenter-clock]"), "0:05");
  });
});

test("presenter: the block timer shows label, time and plan, resets per block and warns when over", async () => {
  await withContext(async (context) => {
    const { page } = await openAt(context, `${fixture}?presenter`, { clocked: true });
    const block = page.locator("[data-presenter-block]");
    assert.equal(await block.isVisible(), false, "no block on the first slide");
    await page.keyboard.press("ArrowRight");
    assert.equal(await block.innerText(), "Context · 0:00 / 2:00");
    await page.clock.fastForward(90_000);
    assert.equal(await block.innerText(), "Context · 1:30 / 2:00");
    assert.equal(await block.evaluate((el) => el.classList.contains("is-over")), false);
    await page.keyboard.press("ArrowRight");
    await page.clock.fastForward(40_000);
    assert.equal(await block.innerText(), "Context · 2:10 / 2:00");
    assert.equal(await block.evaluate((el) => el.classList.contains("is-over")), true);
    await page.keyboard.press("ArrowRight");
    assert.equal(await block.innerText(), "Step 1 · 0:00 / 4:00", "the label of the block when its first slide gives one, and not its title");
    assert.equal(await block.evaluate((el) => el.classList.contains("is-over")), false);
    await page.keyboard.press("ArrowRight");
    assert.equal(await block.isVisible(), false, "no block on the last slide");
  });
});

test("the deck and the presenter view follow each other in both directions", async () => {
  await withContext(async (context) => {
    const { page: deck } = await openAt(context, `${fixture}#1`);
    const { page: presenter } = await openAt(context, `${fixture}?presenter#1`);
    await deck.keyboard.press("ArrowRight");
    await presenter.waitForFunction(() => document.querySelector("[data-presenter-counter]").textContent === "2 / 5");
    assert.equal(await presenter.evaluate(() => location.hash), "#2");
    await presenter.keyboard.press("End");
    await deck.waitForFunction(() => location.hash === "#5");
    assert.equal(await deck.locator(".slide.is-current h2").innerText(), "Wrap up");
    assert.equal(await deck.title(), "Wrap up · Presenter fixture");
    await presenter.keyboard.press("PageUp");
    await deck.waitForFunction(() => location.hash === "#4");
    await deck.locator("[data-prev]").click();
    await presenter.waitForFunction(() => document.querySelector("[data-presenter-counter]").textContent === "3 / 5");
  });
});

test("the key n opens the presenter view on the same slide", async () => {
  await withContext(async (context) => {
    const { page } = await openAt(context, `${fixture}#3`);
    const [popup] = await Promise.all([page.waitForEvent("popup"), page.keyboard.press("n")]);
    await popup.waitForLoadState("load");
    const url = new URL(popup.url());
    assert.equal(url.search, "?presenter");
    assert.equal(url.hash, "#3");
    assert.equal(await text(popup, "[data-presenter-counter]"), "3 / 5");
    assert.equal(await page.locator(".presenter").count(), 0, "the deck window stays a deck");
  });
});

test("the key n switches the window to the presenter view when the popup is blocked", async () => {
  await withContext(async (context) => {
    const { page } = await openAt(context, `${fixture}#2`, { init: () => (window.open = () => null) });
    await page.keyboard.press("n");
    await page.waitForURL(/\?presenter#2$/);
    assert.equal(await text(page, "[data-presenter-counter]"), "2 / 5");
  });
});

test("print: one slide per page, without notes and without the presenter interface", async () => {
  for (const path of [fixture, `${fixture}?presenter`]) {
    await withContext(async (context) => {
      const { page } = await openAt(context, path);
      await page.emulateMedia({ media: "print" });
      const visible = await page.evaluate(() => ({
        slides: [...document.querySelectorAll(".deck .slide")].filter((el) => getComputedStyle(el).display !== "none").length,
        notes: [...document.querySelectorAll(".notes")].filter((el) => getComputedStyle(el).display !== "none").length,
        presenter: [...document.querySelectorAll(".presenter")].filter((el) => getComputedStyle(el).display !== "none").length,
      }));
      assert.deepEqual(visible, { slides: 5, notes: 0, presenter: 0 }, path);
      const pdf = await page.pdf({ width: "1600px", height: "900px" });
      assert.equal((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length, 5, path);
    });
  }
});

for (const [lang, path] of Object.entries(decks)) {
  test(`deck ${lang}: opens with ?presenter without JavaScript errors`, async () => {
    await withContext(async (context) => {
      const { page, errors } = await openAt(context, `${path}?presenter`);
      const total = await page.locator(".deck .slide").count();
      assert.equal(await text(page, "[data-presenter-counter]"), `1 / ${total}`);
      await page.keyboard.press("End");
      assert.equal(await text(page, "[data-presenter-counter]"), `${total} / ${total}`);
      assert.deepEqual(errors, []);
    });
  });
}
