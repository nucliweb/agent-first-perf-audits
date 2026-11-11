// The CLS subagent: the layout shifts of each journey of the Navigator, load included, with the
// selectors of the nodes that move, from WebPerf Snippets MCP. The fixtures are real answers of the
// MCP server on main (baseline) and on pr/cls-promo-banner (candidate), with the conditions of the
// subagent. The last test measures the baseline shop, so it runs only inside Compose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { cls, clsJourneyOf } from "../../src/subagents/cls.ts";
import { JOURNEYS, type NavigatorReport } from "../../src/subagents/navigator.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/cls/${name}.json`, import.meta.url), "utf8"));

test("a journey without layout shifts has a CLS of 0 and no nodes", () => {
  assert.deepEqual(clsJourneyOf("home", fixture("home-baseline")), {
    name: "home",
    url: "http://shop-baseline:3000/",
    cls: { value: 0, rating: "good", runs: { median: 0, min: 0, max: 0, agreement: null } },
    shifts: { counted: 0, excluded: 0 },
    elements: [],
  });
});

test("on pr/cls-promo-banner the page moves down, and the nodes that move come with their selectors", () => {
  const journey = clsJourneyOf("product", fixture("product-candidate"));
  assert.deepEqual(journey.cls, { value: 0.0547, rating: "good", runs: { median: 0.0547, min: 0.0547, max: 0.0547, agreement: "consistent" } });
  assert.deepEqual(journey.shifts, { counted: 1, excluded: 0 });
  assert.deepEqual(journey.elements, [
    { selector: "main.main", shiftCount: 1, totalImpact: 0.0547 },
    { selector: "label.chip:nth-of-type(1)", shiftCount: 1, totalImpact: 0.0547 },
    { selector: "label.chip:nth-of-type(2)", shiftCount: 1, totalImpact: 0.0547 },
  ]);
});

test("on the home of pr/cls-promo-banner the names of the product cards move too", () => {
  const selectors = clsJourneyOf("home", fixture("home-candidate")).elements.map((e) => e.selector);
  assert.equal(selectors[0], "main.main");
  assert.ok(selectors.slice(1).every((s) => s.endsWith("h3.card__name")), selectors.join("\n"));
});

test("a snippet that fails stops the subagent with the journey and the message", () => {
  const answer = fixture("home-baseline");
  answer.result = { script: "Layout-Shift-Loading-and-Interaction", status: "error", error: "No layout shift support" };
  assert.throws(() => clsJourneyOf("home", answer), /home: Layout-Shift-Loading-and-Interaction: No layout shift support/);
});

test("it needs the journeys of the Navigator", async () => {
  assert.deepEqual(cls.needs, ["navigator"]);
  await assert.rejects(cls.run({ side: "baseline", origin: "http://shop-baseline:3000", out: tmpdir(), earlier: {} }), /needs the journeys of the Navigator/);
});

const BASELINE_URL = process.env.BASELINE_URL;

test("inside Compose, it measures the journey of the home on the baseline shop with the steps the Navigator ran", { skip: !BASELINE_URL && "only inside Docker Compose", timeout: 180_000 }, async () => {
  const home = JOURNEYS.find((j) => j.name === "home")!;
  const navigator: NavigatorReport = {
    journeys: [{ name: home.name, path: home.path, url: `${BASELINE_URL}/`, steps: home.interactions.map((step) => ({ step, url: `${BASELINE_URL}/` })), pageErrors: [] }],
  };
  const report = await cls.run({ side: "baseline", origin: BASELINE_URL!, out: tmpdir(), earlier: { navigator } });
  assert.deepEqual(report.conditions, { cpu: 4, network: "fast-4g", runs: 3 });
  assert.deepEqual(report.journeys.map((j) => [j.name, j.url, j.cls.value]), [["home", `${BASELINE_URL}/`, 0]]);
});
