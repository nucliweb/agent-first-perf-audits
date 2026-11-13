import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createShopServer } from "./server.mjs";

let server;
let origin;

before(async () => {
  const root = await mkdtemp(join(tmpdir(), "shop-dist-"));
  await mkdir(join(root, "assets"));
  await mkdir(join(root, "images"));
  await writeFile(
    join(root, "index.html"),
    '<head><!-- lcp-preload --><script async src="__THIRDPARTY_ORIGIN__/analytics.js"></script></head><div id="root"></div>',
  );
  await writeFile(join(root, "assets", "index-abc123.js"), "console.log('app')");
  await writeFile(join(root, "images", "hero-800.webp"), "webp");
  server = createShopServer({ root, thirdPartyOrigin: "http://thirdparty:4000" });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test("serves index.html with the third-party origin in place", async () => {
  const res = await fetch(`${origin}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/html/);
  assert.equal(res.headers.get("cache-control"), "no-cache");
  assert.match(await res.text(), /src="http:\/\/thirdparty:4000\/analytics\.js"/);
});

test("answers the routes of the app with index.html", async () => {
  for (const path of ["/shop", "/product/chemex", "/cart"]) {
    const res = await fetch(`${origin}${path}`);
    assert.equal(res.status, 200, path);
    assert.match(await res.text(), /id="root"/, path);
  }
});

const preloadOf = (html) => html.match(/<link rel="preload" as="image"[^>]*>/)?.[0];

test("preloads the product image on a product page", async () => {
  const preload = preloadOf(await (await fetch(`${origin}/product/chemex`)).text());
  assert.ok(preload, "no image preload");
  assert.match(preload, /imagesrcset="\/images\/products\/chemex-400\.webp 400w, \/images\/products\/chemex-800\.webp 800w"/);
});

test("preloads no image on pages without a known LCP image", async () => {
  for (const path of ["/", "/shop", "/cart", "/product/unknown"]) {
    assert.equal(preloadOf(await (await fetch(`${origin}${path}`)).text()), undefined, path);
  }
});

test("serves hashed assets with long-lived caching", async () => {
  const res = await fetch(`${origin}/assets/index-abc123.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/javascript/);
  assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
});

test("compresses text with gzip when the client accepts it", async () => {
  const res = await fetch(`${origin}/assets/index-abc123.js`, { headers: { "accept-encoding": "gzip" } });
  assert.equal(res.headers.get("content-encoding"), "gzip");
  assert.equal(res.headers.get("vary"), "accept-encoding");
  assert.equal(await res.text(), "console.log('app')");
});

test("does not compress images, which are compressed already", async () => {
  const res = await fetch(`${origin}/images/hero-800.webp`, { headers: { "accept-encoding": "gzip" } });
  assert.equal(res.headers.get("content-encoding"), null);
});

test("serves images with their content type", async () => {
  const res = await fetch(`${origin}/images/hero-800.webp`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/webp");
});

test("answers 404 for a missing file, not index.html", async () => {
  assert.equal((await fetch(`${origin}/assets/missing.js`)).status, 404);
  assert.equal((await fetch(`${origin}/images/missing.webp`)).status, 404);
});

test("does not serve files outside the root", async () => {
  const res = await fetch(`${origin}/..%2f..%2fetc%2fpasswd`);
  assert.notEqual(res.status, 200);
});
