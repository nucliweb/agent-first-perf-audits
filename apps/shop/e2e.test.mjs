// End-to-end journey of the shop in Chromium: the production build (dist/, run npm run build
// first) and the third-party mocks, both on local ports.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createShopServer } from "./server.mjs";
import { createThirdPartyServer } from "../thirdparty/server.mjs";

const listen = (server) =>
  new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(`http://127.0.0.1:${server.address().port}`)));

let thirdParty;
let shop;
let shopOrigin;
let browser;

before(async () => {
  thirdParty = createThirdPartyServer();
  const thirdPartyOrigin = await listen(thirdParty);
  shop = createShopServer({ root: fileURLToPath(new URL("./dist", import.meta.url)), thirdPartyOrigin });
  shopOrigin = await listen(shop);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  shop?.close();
  thirdParty?.close();
});

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 412, height: 823 } });
  const page = await context.newPage();
  // Records the LCP element and the layout shifts from the start of the load
  await page.addInitScript(() => {
    window.__lcp = null;
    window.__cls = 0;
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      window.__lcp = last.element ? last.element.getAttribute("data-lcp") ?? last.element.tagName : null;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  return page;
}

test("the hero image is the LCP element of the home page", async () => {
  const page = await newPage();
  await page.goto(shopOrigin, { waitUntil: "load" });
  await page.getByRole("img", { name: /coffee/i }).first().waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__lcp), "hero");
  await page.context().close();
});

test("the promo banner shows on the home page", async () => {
  const page = await newPage();
  await page.goto(shopOrigin, { waitUntil: "load" });
  await page.locator('[data-third-party="promo"]').waitFor();
  await page.context().close();
});

test("a visitor goes from the home page to the cart", async () => {
  const page = await newPage();
  await page.goto(shopOrigin, { waitUntil: "load" });

  await page.getByRole("link", { name: "Shop", exact: true }).click();
  await page.waitForURL("**/shop");
  assert.equal(await page.getByRole("article").count(), 8);

  await page.getByRole("link", { name: "Chemex" }).first().click();
  await page.waitForURL("**/product/chemex");
  await page.getByRole("heading", { level: 1, name: "Chemex" }).waitFor();

  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: /Cart, 1 item/ }).waitFor();

  await page.getByRole("link", { name: /Cart, 1 item/ }).click();
  await page.waitForURL("**/cart");
  await page.getByRole("heading", { name: "Chemex" }).waitFor();
  await page.context().close();
});

test("a product page works on a hard load", async () => {
  const page = await newPage();
  const res = await page.goto(`${shopOrigin}/product/kenya-aa`, { waitUntil: "load" });
  assert.equal(res.status(), 200);
  await page.getByRole("heading", { level: 1, name: "Kenya AA" }).waitFor();
  await page.context().close();
});
