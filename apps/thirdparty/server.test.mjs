import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { createThirdPartyServer } from "./server.mjs";

let server;
let origin;

before(async () => {
  server = createThirdPartyServer();
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const SCRIPTS = ["analytics.js", "chat.js", "promo.js", "ab.js"];

test("serves the four third-party scripts as JavaScript", async () => {
  for (const script of SCRIPTS) {
    const res = await fetch(`${origin}/${script}`);
    assert.equal(res.status, 200, script);
    assert.match(res.headers.get("content-type"), /^text\/javascript/, script);
    assert.ok((await res.text()).length > 0, script);
  }
});

test("delays the response by the delay parameter", async () => {
  const start = performance.now();
  const res = await fetch(`${origin}/analytics.js?delay=300`);
  await res.text();
  assert.ok(performance.now() - start >= 300, `took ${performance.now() - start} ms`);
});

test("the script blocks the thread it runs on for the cpu parameter", async () => {
  const code = await (await fetch(`${origin}/ab.js?cpu=120`)).text();
  const documentElement = { dataset: {} };
  const start = performance.now();
  runInNewContext(code, { performance, document: { documentElement, currentScript: null } });
  const elapsed = performance.now() - start;
  assert.ok(elapsed >= 120, `ran for ${elapsed} ms`);
  assert.equal(documentElement.dataset.abVariant, "b");
});

test("rejects a delay or cpu that is not a number in range", async () => {
  for (const query of ["delay=-1", "delay=abc", "cpu=5001", "delay=10001"]) {
    const res = await fetch(`${origin}/chat.js?${query}`);
    assert.equal(res.status, 400, query);
  }
});

test("answers 404 for an unknown path", async () => {
  assert.equal((await fetch(`${origin}/tag-manager.js`)).status, 404);
});

test("accepts analytics beacons", async () => {
  const res = await fetch(`${origin}/collect`, { method: "POST", body: JSON.stringify({ type: "pageview", path: "/" }) });
  assert.equal(res.status, 204);
});
