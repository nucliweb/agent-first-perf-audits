// The shop on Vercel: static pages with the same HTML the server gives each route, and the
// third-party mocks as a function under /thirdparty, on the same origin.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeStaticPages } from "./static-pages.mjs";
import thirdparty from "./api/thirdparty.mjs";
import { PRODUCTS } from "./src/products.ts";

const TEMPLATE =
  '<head><!-- lcp-preload --><script async src="__THIRDPARTY_ORIGIN__/analytics.js?delay=100&cpu=30"></script></head><div id="root"></div>';

const build = async () => {
  const dist = await mkdtemp(join(tmpdir(), "shop-dist-"));
  await writeFile(join(dist, "index.html"), TEMPLATE);
  await writeFile(join(dist, "favicon.svg"), "<svg/>");
  const out = join(await mkdtemp(join(tmpdir(), "shop-static-")), "dist-static");
  await writeStaticPages(dist, out, "/thirdparty");
  const page = (file) => readFile(join(out, file), "utf8");
  page.dist = (file) => readFile(join(dist, file), "utf8");
  return page;
};

test("the home gets the preload of the hero and the third parties under /thirdparty", async () => {
  const page = await build();
  const home = await page("index.html");
  assert.match(home, /<link rel="preload" as="image" href="\/images\/hero-1200\.webp"/);
  assert.match(home, /src="\/thirdparty\/analytics\.js\?delay=100&cpu=30"/);
  assert.doesNotMatch(home, /__THIRDPARTY_ORIGIN__|lcp-preload/);
});

test("each product page gets the preload of its own photo", async () => {
  const page = await build();
  for (const { slug } of PRODUCTS) {
    assert.match(await page(`product/${slug}.html`), new RegExp(`href="/images/products/${slug}-800\\.webp"`), slug);
  }
});

test("the build stays as it was, so server.mjs can still serve it", async () => {
  const page = await build();
  assert.equal(await page.dist("index.html"), TEMPLATE);
  assert.equal(await page("favicon.svg"), "<svg/>");
});

test("any other route gets the app without a preload", async () => {
  const app = await (await build())("app.html");
  assert.doesNotMatch(app, /rel="preload"/);
  assert.match(app, /src="\/thirdparty\/analytics\.js/);
});

let server;
let origin;

before(async () => {
  server = createServer(thirdparty);
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test("the function serves a mock script with its delay, as the rewrite of /thirdparty/:path calls it", async () => {
  const start = performance.now();
  const res = await fetch(`${origin}/api/thirdparty?path=chat.js&delay=200&cpu=10`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/javascript/);
  assert.match(await res.text(), /\+ 10;/);
  assert.ok(performance.now() - start >= 200, `took ${performance.now() - start} ms`);
});

test("the function also takes the original path, in case the platform passes it", async () => {
  const res = await fetch(`${origin}/thirdparty/ab.js?cpu=150`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /\+ 150;/);
});

test("the function accepts the beacons of the analytics mock and rejects unknown scripts", async () => {
  assert.equal((await fetch(`${origin}/api/thirdparty?path=collect`, { method: "POST", body: "{}" })).status, 204);
  assert.equal((await fetch(`${origin}/api/thirdparty?path=tag-manager.js`)).status, 404);
});
