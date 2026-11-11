// The Navigator runs the journeys of the workshop on a shop, step by step, through WebPerf Snippets
// MCP, and tells where each step leaves the page. The tests run it on a local page with the real
// MCP server, inside the agents image; the last one runs the journeys of the workshop on the
// baseline shop, so it runs only inside Compose.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { JOURNEYS, navigator, runJourneys, type Journey } from "../../src/subagents/navigator.ts";
import { SCENARIOS } from "../../src/judge/gate.ts";

// A page of one route that moves to /next without a reload, as the shop does, and a button that throws
const PAGE = `<!doctype html>
<html lang="en">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Navigator</title>
<h1>Navigator test</h1>
<button id="next" onclick="history.pushState({}, '', '/next')">Next</button>
<button id="boom" onclick="setTimeout(() => { throw new Error('boom from the page') })">Boom</button>
</html>`;

let server: Server;
let origin: string;

before(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  origin = `http://127.0.0.1:${address.port}`;
});

after(() => server.close());

const journey = (interactions: Journey["interactions"]): Journey => ({ name: "test", path: "/", interactions });

test("each step comes back with the URL it leaves the page on", async () => {
  const [run] = await runJourneys(origin, [journey([{ action: "wait", ms: 100 }, { action: "click", selector: "#next" }])]);
  assert.equal(run.url, `${origin}/`);
  assert.deepEqual(run.steps.map((s) => s.url), [`${origin}/`, `${origin}/next`]);
  assert.deepEqual(run.pageErrors, []);
});

test("a step whose element never appears stops the Navigator with the journey, the step and its selector", async () => {
  await assert.rejects(
    runJourneys(origin, [journey([{ action: "wait", ms: 100 }, { action: "click", selector: "#missing" }])]),
    /journey test, step 2 \(click #missing\): .*Timeout/,
  );
});

test("the errors of the page during a journey are reported", async () => {
  const [run] = await runJourneys(origin, [journey([{ action: "click", selector: "#boom" }, { action: "wait", ms: 300 }])]);
  assert.ok(run.pageErrors.some((e) => e.includes("boom from the page")), JSON.stringify(run.pageErrors));
});

test("the workshop has four journeys, one per page, in the order a person goes through the shop", () => {
  assert.deepEqual(JOURNEYS.map((j) => [j.name, j.path]), [
    ["home", "/"],
    ["shop", "/shop"],
    ["product", "/product/kenya-aa"],
    ["add-to-cart", "/product/kenya-aa"],
  ]);
  const files = readdirSync(new URL("../../journeys/", import.meta.url)).filter((f) => f.endsWith(".json")).sort();
  assert.deepEqual(files, JOURNEYS.map((j) => `${j.name}.json`).sort());
  for (const j of JOURNEYS) assert.ok(j.interactions.length > 0, j.name);
});

test("the gate measures add to cart on the path of its journey", () => {
  const scenario = SCENARIOS.find((s) => s.id === "add-to-cart")!;
  assert.equal(scenario.path, JOURNEYS.find((j) => j.name === "add-to-cart")!.path);
});

const BASELINE_URL = process.env.BASELINE_URL;

test("inside Compose, every journey of the workshop completes on the baseline shop", { skip: !BASELINE_URL && "only inside Docker Compose", timeout: 180_000 }, async () => {
  const report = await navigator.run({ side: "baseline", origin: BASELINE_URL!, out: tmpdir(), earlier: {} });
  assert.deepEqual(
    report.journeys.map((j) => [j.name, j.steps.length, j.steps.at(-1)!.url, j.pageErrors.length]),
    JOURNEYS.map((j) => [j.name, j.interactions.length, `${BASELINE_URL}${j.path}`, 0]),
  );
});
