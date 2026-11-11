// The orchestrator runs each subagent on the baseline and on the candidate, one measurement at a
// time, and writes what each one returns to the output folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { orchestrate } from "../src/orchestrator.ts";
import type { Page, Subagent } from "../src/subagents/subagent.ts";

const PAGES = { baseline: "http://shop-baseline:3000/", candidate: "http://shop-candidate:3000/" };

// A subagent that records when each of its measurements starts and ends
function recording(name: string, calls: string[]): Subagent<{ url: string }> {
  return {
    name,
    async run(page: Page) {
      calls.push(`start ${name} ${page.side}`);
      await new Promise((ok) => setTimeout(ok, 10));
      calls.push(`end ${name} ${page.side}`);
      return { url: page.url };
    },
    summary: (result) => `measured ${result.url}`,
  };
}

test("each subagent measures both sides, one after the other", async () => {
  const calls: string[] = [];
  const out = await mkdtemp(join(tmpdir(), "orchestrator-"));
  await orchestrate([recording("lcp", calls), recording("cls", calls)], PAGES, out, () => {});
  assert.deepEqual(calls, [
    "start lcp baseline", "end lcp baseline", "start lcp candidate", "end lcp candidate",
    "start cls baseline", "end cls baseline", "start cls candidate", "end cls candidate",
  ]);
});

test("what each subagent returns goes to <subagent>-<side>.json, and the log gets its summary", async () => {
  const out = await mkdtemp(join(tmpdir(), "orchestrator-"));
  const lines: string[] = [];
  const results = await orchestrate([recording("lcp", [])], PAGES, out, (line) => lines.push(line));
  assert.deepEqual(JSON.parse(await readFile(join(out, "lcp-candidate.json"), "utf8")), { url: PAGES.candidate });
  assert.deepEqual(results, { lcp: { baseline: { url: PAGES.baseline }, candidate: { url: PAGES.candidate } } });
  assert.ok(lines.includes(`lcp, baseline: measured ${PAGES.baseline}`), lines.join("\n"));
});

test("a subagent that fails stops the orchestrator", async () => {
  const out = await mkdtemp(join(tmpdir(), "orchestrator-"));
  const failing: Subagent<never> = { name: "lcp", run: async () => Promise.reject(new Error("no LCP")), summary: () => "" };
  await assert.rejects(orchestrate([failing], PAGES, out, () => {}), /lcp, baseline: no LCP/);
});
