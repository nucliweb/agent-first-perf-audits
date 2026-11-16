// The LoAF/INP subagent: for each journey of the Navigator, the INP with its phases, the long
// animation frames with the scripts that make them, and the long tasks, from the interaction
// workflow of WebPerf Snippets MCP; for a journey with a click, a trace of the click summarized by
// trace-engine-cli, which names the functions. The fixtures are real answers of the MCP server on
// main (baseline) and on pr/loaf-cart-handler (candidate). The last test measures the baseline
// shop, so it runs only inside Compose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loaf, loafJourneyOf, type LoafJourney } from "../../src/subagents/loaf.ts";
import { JOURNEYS, type NavigatorReport } from "../../src/subagents/navigator.ts";
import { CONDITIONS } from "../../src/subagents/subagent.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/loaf/${name}.json`, import.meta.url), "utf8"));

test("the INP of a click comes with the event, its three phases and its runs", () => {
  const journey = loafJourneyOf("add-to-cart", fixture("add-to-cart-baseline"));
  assert.equal(journey.url, "http://shop-baseline:3000/product/kenya-aa");
  assert.deepEqual(journey.inp, {
    value: 32,
    rating: "good",
    runs: { median: 32, min: 24, max: 40, agreement: "consistent" },
    event: "click → button.button",
    phases: { inputDelay: 7, processingTime: 10, presentationDelay: 15 },
  });
});

test("on pr/loaf-cart-handler the click spends its time in the handler, and the long frames name its script", () => {
  const journey = loafJourneyOf("add-to-cart", fixture("add-to-cart-candidate"));
  assert.equal(journey.inp?.value, 192);
  assert.deepEqual(journey.inp?.phases, { inputDelay: 7, processingTime: 169, presentationDelay: 16 });
  assert.deepEqual(journey.longFrames.topScripts[0], { invoker: "DIV#root.onclick", source: "index-BsVNkX21.js", totalDurationMs: 166, count: 1 });
  assert.deepEqual(
    { count: journey.longFrames.count, blocking: journey.longFrames.totalBlockingTimeMs, worst: journey.longFrames.worstBlockingMs },
    { count: 6, blocking: 329, worst: 129 },
  );
  assert.deepEqual(journey.longTasks, { totalBlockingTimeMs: 287, worstTaskMs: 175 });
});

test("a journey without a click has no INP, and its long frames still show the scripts of the load", () => {
  const journey = loafJourneyOf("home", fixture("home-candidate"));
  assert.equal(journey.inp, null);
  assert.equal(journey.longFrames.topScripts[0].source, "ab.js");
});

test("a step of the workflow that fails stops the subagent with the journey and the message", () => {
  const answer = fixture("add-to-cart-baseline");
  answer.results.find((r: { id: string }) => r.id === "long-frames").status = "error";
  answer.results.find((r: { id: string }) => r.id === "long-frames").error = "LoAF is not supported";
  assert.throws(() => loafJourneyOf("add-to-cart", answer), /add-to-cart: long-frames: LoAF is not supported/);
});

const summaryOf = (...journeys: LoafJourney[]) => loaf.summary({ conditions: CONDITIONS, journeys });

test("the summary names the handler of the slowest click with the time it takes", () => {
  const journey = loafJourneyOf("add-to-cart", fixture("add-to-cart-candidate"));
  assert.equal(summaryOf(journey), "add-to-cart INP 192 ms; slowest add-to-cart: processing 169 ms, top script DIV#root.onclick (index-BsVNkX21.js, 166 ms)");
});

test("on a faster machine the handler takes less than the A/B testing script of the load, and the summary still names the handler", () => {
  // The A/B testing script burns a fixed time while the page loads; the handler does a fixed amount
  // of work, so a faster CPU shortens it. The figures are the ones of a session on the reference Mac
  const journey = loafJourneyOf("add-to-cart", fixture("add-to-cart-candidate"));
  const [handler, ab, ...rest] = journey.longFrames.topScripts;
  journey.inp!.value = 96;
  journey.inp!.phases.processingTime = 87;
  journey.longFrames.topScripts = [ab, { ...handler, totalDurationMs: 85 }, ...rest];
  assert.equal(summaryOf(journey), "add-to-cart INP 96 ms; slowest add-to-cart: processing 87 ms, top script DIV#root.onclick (index-BsVNkX21.js, 85 ms)");
});

test("when the long frames of the slowest click only have scripts of the load, the summary names none", () => {
  const journey = loafJourneyOf("add-to-cart", fixture("add-to-cart-baseline"));
  journey.longFrames.topScripts = journey.longFrames.topScripts.filter((script) => script.invoker.startsWith("http"));
  assert.equal(summaryOf(journey), "add-to-cart INP 32 ms; slowest add-to-cart: processing 10 ms");
});

test("it needs the journeys of the Navigator", async () => {
  assert.deepEqual(loaf.needs, ["navigator"]);
  await assert.rejects(loaf.run({ side: "baseline", origin: "http://shop-baseline:3000", out: tmpdir(), earlier: {} }), /needs the journeys of the Navigator/);
});

const BASELINE_URL = process.env.BASELINE_URL;

test("inside Compose, it measures add to cart on the baseline shop and summarizes the trace of the click", { skip: !BASELINE_URL && "only inside Docker Compose", timeout: 180_000 }, async () => {
  const journey = JOURNEYS.find((j) => j.name === "add-to-cart")!;
  const url = `${BASELINE_URL}${journey.path}`;
  const navigator: NavigatorReport = { journeys: [{ name: journey.name, path: journey.path, url, steps: journey.interactions.map((step) => ({ step, url })), pageErrors: [] }] };
  const out = await mkdtemp(join(tmpdir(), "loaf-"));
  const [report] = (await loaf.run({ side: "baseline", origin: BASELINE_URL!, out, earlier: { navigator } })).journeys;
  assert.ok(report.inp && report.inp.value > 0);
  assert.equal(report.trace?.file, "traces/loaf-add-to-cart-baseline.json");
  assert.ok(statSync(join(out, report.trace!.file)).size > 0);
  // The one interaction of the click, which trace-engine-cli names by its longest event, pointerdown
  assert.match(report.trace!.summaries.interactions, /^interactions\[1\]\{eventType.*\n\s+pointerdown,/);
  assert.match(report.trace!.summaries.tasks, /functionName/);
});
