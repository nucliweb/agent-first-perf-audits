// Smoke test of the MCP layer: both servers start over stdio, find the Chromium of
// Playwright and measure a local page. It runs inside the agents image.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callTool, connect } from "../src/mcp/client.ts";

const PAGE = `<!doctype html>
<html lang="en">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Smoke</title>
<h1 style="font-size: 48px">PerfReviews smoke test</h1>
<p>A local page with a text LCP element.</p>
</html>`;

let server: Server;
let url: string;

before(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  url = `http://127.0.0.1:${address.port}/`;
});

after(() => server.close());

test("WebPerf Snippets MCP measures the LCP of a local page", async () => {
  const client = await connect("webperf");
  try {
    const { structuredContent } = await callTool(client, "run_snippet", { url, snippet: "LCP", waitMs: 500 });
    const result = (structuredContent as { result: Record<string, unknown> }).result;
    assert.equal(result.status, "ok");
    assert.equal(result.metric, "LCP");
    assert.ok(typeof result.value === "number" && result.value > 0, `LCP value: ${result.value}`);
  } finally {
    await client.close();
  }
});

test("Chrome DevTools MCP records a trace of a local page to a file", async () => {
  const filePath = join(await mkdtemp(join(tmpdir(), "smoke-")), "trace.json");
  const client = await connect("devtools");
  try {
    await callTool(client, "navigate_page", { type: "url", url });
    await callTool(client, "performance_start_trace", { reload: true, autoStop: true, filePath });
  } finally {
    await client.close();
  }
  const trace = JSON.parse(await readFile(filePath, "utf8"));
  const events: Array<{ name?: string }> = Array.isArray(trace) ? trace : trace.traceEvents;
  assert.ok(events.length > 100, `trace events: ${events.length}`);
  assert.ok(events.some((e) => e.name === "largestContentfulPaint::Candidate"), "the trace has an LCP candidate");
});
