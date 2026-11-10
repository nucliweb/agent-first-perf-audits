// Checks the measurement layer of Docker Compose from inside the agents container: both shops
// and the third-party mocks answer by their service names, the MCP servers measure both shops,
// and the lab network has no way out to the internet. Outside Compose, the tests are skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { callTool, connect } from "../src/mcp/client.ts";

const SHOPS = { baseline: process.env.BASELINE_URL, candidate: process.env.CANDIDATE_URL };
const THIRDPARTY_URL = process.env.THIRDPARTY_URL;
const skip = !SHOPS.baseline || !SHOPS.candidate || !THIRDPARTY_URL ? "only inside Docker Compose" : false;

test("both shops load the third-party mocks by their service name", { skip }, async () => {
  for (const [name, url] of Object.entries(SHOPS)) {
    const html = await (await fetch(url!)).text();
    assert.ok(html.includes(`src="${THIRDPARTY_URL}/promo.js`), `${name} does not point to ${THIRDPARTY_URL}`);
  }
  assert.equal((await fetch(`${THIRDPARTY_URL}/promo.js`)).status, 200);
});

test("WebPerf Snippets MCP measures the LCP of both shops", { skip }, async () => {
  const client = await connect("webperf");
  try {
    for (const [name, url] of Object.entries(SHOPS)) {
      const { structuredContent } = await callTool(client, "run_snippet", { url, snippet: "LCP", waitMs: 1000 });
      const result = (structuredContent as { result: Record<string, any> }).result;
      assert.equal(result.status, "ok", `${name}: ${JSON.stringify(result)}`);
      assert.match(String(result.details?.element), /hero__image/, `${name}: the LCP element is the hero`);
    }
  } finally {
    await client.close();
  }
});

test("the lab network has no access to the internet", { skip }, async () => {
  await assert.rejects(fetch("https://example.com", { signal: AbortSignal.timeout(3000) }));
});
