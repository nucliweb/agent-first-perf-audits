// The diff that the Judge reads: the branch of the shop image under comparison, and its changes in
// apps/shop without the tests that the branch adjusts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { branchOf, diffOf, refOfTag } from "../../src/judge/diff.ts";

const REFS = ["main", "pr/lcp-hero-lazy", "origin/pr/cls-promo-banner", "origin/main"];

test("finds the ref of a shop image by its tag, as scripts/build-shop.sh names it", () => {
  assert.equal(refOfTag("main", REFS), "main");
  assert.equal(refOfTag("pr-lcp-hero-lazy", REFS), "pr/lcp-hero-lazy");
});

test("finds a branch that only exists on the remote", () => {
  assert.equal(refOfTag("pr-cls-promo-banner", REFS), "origin/pr/cls-promo-banner");
});

test("prefers the local branch to the remote one", () => {
  assert.equal(refOfTag("main", ["origin/main", "main"]), "main");
});

test("fails with the tag when no ref matches it", () => {
  assert.throws(() => refOfTag("pr-unknown", REFS), /pr-unknown/);
});

// The repo of the workshop: the working tree on the host, /repo inside the ci service
const REPO = [process.env.REPO, new URL("../../..", import.meta.url).pathname].find((dir) => dir && existsSync(`${dir}/.git`));

// pr/lcp-hero-lazy adjusts server.test.mjs, as the author of the change would
test("the diff of a regression branch leaves out the tests of the shop", { skip: !REPO && "needs the git repo" }, () => {
  const diff = diffOf(REPO!, "main", "pr/lcp-hero-lazy");
  assert.match(diff, /^\+\+\+ b\/apps\/shop\//m);
  assert.doesNotMatch(diff, /\.test\.(ts|mjs)/);
});

// In a fresh clone, such as the checkout of GitHub Actions, the branches are only remote; the
// report and the prompt name them as the branch, without the remote
test("names a ref as its branch, without the remote", () => {
  assert.equal(branchOf("origin/pr/lcp-hero-lazy"), "pr/lcp-hero-lazy");
  assert.equal(branchOf("origin/main"), "main");
  assert.equal(branchOf("pr/lcp-hero-lazy"), "pr/lcp-hero-lazy");
});
