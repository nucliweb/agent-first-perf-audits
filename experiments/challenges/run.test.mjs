// The run of the challenges: which edit goes before which command of the page, how an edit changes a
// file, and where the gate of a command leaves its reports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { planOf } from "../rehearsal/rehearse.mjs";
import { EDITS, SOURCES, applyEdit, editsFor, reportDirsOf, summaryOf } from "./run.mjs";

const REPO = resolve(import.meta.dirname, "../..");

test("each edit goes before one command of the page, in the order of the page", () => {
  const plan = planOf(REPO, { sources: SOURCES });
  const places = EDITS.map((edit) => plan.filter((c) => editsFor(c.command).includes(edit)).map((c) => c.index));
  assert.ok(places.every((indexes) => indexes.length === 1), `an edit without its command, or with several: ${JSON.stringify(places)}`);
  const order = places.flat();
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.deepEqual(EDITS.map((e) => e.id), ["fix-attribute", "fix-preload", "unthrottled", "no-defer", "slow-defer", "slow-async"]);
});

test("a command without an edit has none", () => {
  assert.deepEqual(editsFor("docker compose up -d"), []);
});

test("an edit replaces the one place of the file that has its text, relative to the root", () => {
  const root = mkdtempSync(join(tmpdir(), "challenges-edit-"));
  try {
    mkdirSync(join(root, "clone"));
    mkdirSync(join(root, "branch"));
    writeFileSync(join(root, "branch", "page.html"), '<script defer src="chat.js"></script>\n<script async src="promo.js"></script>\n');
    const edit = { id: "test", file: "../branch/page.html", from: '<script defer src="chat.js">', to: '<script src="chat.js">' };
    applyEdit(join(root, "clone"), edit);
    assert.equal(readFileSync(join(root, "branch", "page.html"), "utf8"), '<script src="chat.js"></script>\n<script async src="promo.js"></script>\n');
    assert.throws(() => applyEdit(join(root, "clone"), edit), /test: .*page\.html has its text 0 times, not once/, "the shop changed: the page and the edit have to change too");
    assert.throws(() => applyEdit(join(root, "clone"), { ...edit, from: "<script", to: "<x" }), /has its text 2 times, not once/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the folders of out/ where the gate of a command leaves its reports, a loop written out", () => {
  assert.deepEqual(reportDirsOf('scripts/build-shop.sh fix-lcp-hero\nCANDIDATE=fix-lcp-hero docker compose run --rm -e OUT=/out/ci/fix-lcp-hero ci\necho "exit $?"'), ["ci/fix-lcp-hero"]);
  assert.deepEqual(
    reportDirsOf('for branch in pr-a pr-b; do\n  CANDIDATE=$branch docker compose run --rm -e OUT=/out/unthrottled/$branch ci\n  echo "$branch: exit $?"\ndone'),
    ["unthrottled/pr-a", "unthrottled/pr-b"],
  );
  assert.deepEqual(reportDirsOf("git worktree add -b fix-lcp-hero ../fix-lcp-hero origin/pr/lcp-hero-lazy"), []);
});

test("what the results keep of a report of the gate: the verdict, the conditions, each metric and the facts of the rules", () => {
  const report = {
    branch: "fix-lcp-hero",
    baseline: "main",
    profile: "llm",
    conditions: "--runs 5 --max-runs 7",
    verdict: "fail",
    gate: {
      verdict: "fail",
      scenarios: [{ scenario: "home", exitCode: 1, metrics: { LCP: { baseline: 650, candidate: 1040, deltaPercent: 60, threshold: 100, p: 0.006, verdict: "regressed" } } }],
    },
    explanations: [{ metric: "LCP", scenario: "home", source: "llm", answer: { suspected_cause: "a long text of the model" } }],
    explainedBy: "llama3.2:3b",
    ruleFacts: [{ metric: "LCP", scenario: "home", facts: ["apps/shop/src/products.ts, in lcpImageFor, removes a line"] }],
  };
  assert.deepEqual(summaryOf("ci/fix-lcp-hero", report), {
    dir: "ci/fix-lcp-hero",
    branch: "fix-lcp-hero",
    verdict: "fail",
    conditions: "--runs 5 --max-runs 7",
    metrics: { home: { LCP: { baseline: 650, candidate: 1040, deltaPercent: 60, p: 0.006, verdict: "regressed" } } },
    explained: [{ metric: "LCP", scenario: "home", source: "llm" }],
    ruleFacts: [{ metric: "LCP", scenario: "home", facts: ["apps/shop/src/products.ts, in lcpImageFor, removes a line"] }],
  });
});
