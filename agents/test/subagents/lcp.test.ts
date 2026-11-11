// The LCP subagent: the LCP of a page with its breakdown and the attributes of the LCP image,
// from WebPerf Snippets MCP, plus a trace from Chrome DevTools MCP. The fixtures are real answers
// of the MCP server on the home of main (baseline) and of pr/lcp-hero-lazy (candidate), with the
// conditions of the subagent. The last test measures the shops, so it runs only inside Compose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lcp, lcpReportOf } from "../../src/subagents/lcp.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/lcp/${name}.json`, import.meta.url), "utf8"));
const baseline = () => lcpReportOf(fixture("workflow-baseline"), fixture("subparts-baseline"));
const candidate = () => lcpReportOf(fixture("workflow-candidate"), fixture("subparts-candidate"));

test("the LCP comes with its element, its sub-parts and the slowest one", () => {
  const report = baseline();
  assert.equal(report.url, "http://shop-baseline:3000/");
  assert.deepEqual(report.conditions, { cpu: 4, network: "fast-4g", runs: 3 });
  assert.deepEqual(report.lcp, { value: 760, unit: "ms", rating: "good", runs: { median: 760, min: 760, max: 772, agreement: "consistent" } });
  assert.deepEqual(report.element, { selector: "img.hero__image", type: "Image", url: "http://shop-baseline:3000/images/hero-800.webp" });
  assert.deepEqual(report.subparts, { ttfb: 3, resourceLoadDelay: 188, resourceLoadTime: 309, elementRenderDelay: 260 });
  assert.equal(report.slowestPhase, "resourceLoadTime");
});

test("the sub-parts add up to the LCP of the same run", () => {
  for (const report of [baseline(), candidate()]) {
    const sum = Object.values(report.subparts).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - report.lcp.value) <= 4, `${sum} against ${report.lcp.value}`);
  }
});

test("an LCP image tells how it loads: preload, fetchpriority and loading", () => {
  assert.deepEqual(baseline().image, {
    format: "webp",
    loading: "(not set)",
    fetchpriority: "high",
    decoding: "(not set)",
    preloaded: true,
    issues: [{ code: "lcp-not-decoding-sync", severity: "warning", message: 'Consider decoding="sync" for the LCP image' }],
  });
});

test("on pr/lcp-hero-lazy the image waits: lazy, without preload and without fetchpriority", () => {
  const report = candidate();
  assert.equal(report.lcp.value, 1168);
  assert.equal(report.slowestPhase, "resourceLoadDelay");
  assert.equal(report.subparts.resourceLoadDelay, 741);
  assert.equal(report.image?.loading, "lazy");
  assert.equal(report.image?.fetchpriority, "(not set)");
  assert.equal(report.image?.preloaded, false);
  assert.deepEqual(report.image?.issues.map((i) => i.code), ["lcp-no-fetchpriority", "lcp-lazy", "lcp-not-decoding-sync", "lcp-not-preloaded"]);
});

test("an LCP that is not an image has no image attributes", () => {
  const workflow = fixture("workflow-baseline");
  workflow.results = workflow.results.filter((r: { script: string }) => r.script !== "Image-Element-Audit");
  assert.equal(lcpReportOf(workflow, fixture("subparts-baseline")).image, null);
});

test("a snippet that fails stops the subagent with its message", () => {
  const subparts = fixture("subparts-baseline");
  subparts.result = { script: "LCP-Subparts", status: "error", error: "No LCP entry" };
  assert.throws(() => lcpReportOf(fixture("workflow-baseline"), subparts), /LCP-Subparts: No LCP entry/);
});

const BASELINE_URL = process.env.BASELINE_URL;

test("inside Compose, it measures the home of the baseline shop and records its trace", { skip: !BASELINE_URL && "only inside Docker Compose", timeout: 180_000 }, async () => {
  const out = await mkdtemp(join(tmpdir(), "lcp-"));
  const report = await lcp.run({ side: "baseline", url: `${BASELINE_URL}/`, out });
  assert.equal(report.element.selector, "img.hero__image");
  assert.ok(report.lcp.value > 0);
  // Relative to out, so it reads the same inside and outside the container
  assert.equal(report.trace, "traces/lcp-baseline.json");
  const file = join(out, report.trace!);
  assert.equal((await stat(file)).mode & 0o777, 0o644, "readable like the JSON next to it");
  const trace = JSON.parse(await readFile(file, "utf8"));
  const events: Array<{ name?: string }> = Array.isArray(trace) ? trace : trace.traceEvents;
  assert.ok(events.some((e) => e.name === "largestContentfulPaint::Candidate"), "the trace has an LCP candidate");
});
