// The first call to an MCP server, step 1 of the workshop: Chrome DevTools MCP opens a page and
// records a trace of its load to a file. The test records a local page with the real server, in
// the agents image.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordTrace } from "../../src/mcp/trace.ts";

const PAGE = `<!doctype html>
<html lang="en">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trace</title>
<h1 style="font-size: 48px">The first trace of the workshop</h1>
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

const eventsOf = async (file: string): Promise<Array<{ name?: string }>> => {
  const trace = JSON.parse(await readFile(file, "utf8"));
  return Array.isArray(trace) ? trace : trace.traceEvents;
};

test("records the load of a page to a file anyone can read, with its LCP", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "trace-")), "nested", "trace.json");
  await recordTrace(url, file);
  assert.equal((await stat(file)).mode & 0o777, 0o644);
  const events = await eventsOf(file);
  assert.ok(events.length > 100, `trace events: ${events.length}`);
  assert.ok(events.some((e) => e.name === "largestContentfulPaint::Candidate"), "the trace has an LCP candidate");
});

test("records with the throttling it is given, as the LCP subagent does", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "trace-")), "trace.json");
  await recordTrace(url, file, { cpuThrottlingRate: 4, networkConditions: "Fast 4G", viewport: "412x823x1,mobile,touch" });
  assert.ok((await eventsOf(file)).some((e) => e.name === "largestContentfulPaint::Candidate"));
});
