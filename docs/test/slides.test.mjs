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
      res.writeHead(200, { "content-type": types[extname(target)] ?? "application/octet-stream" });
      res.end(await readFile(target));
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
