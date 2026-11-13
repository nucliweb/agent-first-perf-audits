// Checks the claims of the map page about the alternatives it discards: without network throttling
// or without the preload of the hero in main, the gate does not see the LCP regression of
// pr/lcp-hero-lazy; without keepNames, the Judge finds the handler of pr/loaf-cart-handler but
// cannot relate it to the diff. It builds and measures every variant, so it takes a few minutes.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { measure } from "./discarded.mjs";

let results;

before(async () => {
  results = await measure();
});

const lcpOf = (id) => results.lcp.find((r) => r.id === id);
const attributionOf = (id) => results.attribution.find((r) => r.id === id);

test("with the conditions of the gate, the LCP of pr/lcp-hero-lazy regresses", () => {
  const { exitCode, LCP } = lcpOf("gate");
  assert.equal(LCP.verdict, "regressed", JSON.stringify(LCP));
  assert.equal(exitCode, 1);
});

test("without network throttling, the gate does not see the LCP regression", () => {
  const { exitCode, LCP } = lcpOf("without network throttling");
  assert.notEqual(LCP.verdict, "regressed", JSON.stringify(LCP));
  assert.equal(exitCode, 0);
});

test("without the preload of the hero in main, the gate does not see the LCP regression", () => {
  const { exitCode, LCP } = lcpOf("without preload in main");
  assert.notEqual(LCP.verdict, "regressed", JSON.stringify(LCP));
  assert.equal(exitCode, 0);
});

test("with keepNames, the suspect of the INP is recommendFor and matches the line of the diff that calls it", () => {
  const { suspects, matches } = attributionOf("keepNames");
  assert.ok(suspects.some((s) => s.name === "recommendFor"), JSON.stringify(suspects));
  const match = matches.find((m) => m.name === "recommendFor");
  assert.ok(match, JSON.stringify(matches));
  assert.match(match.line, /recommendFor\(/);
});

test("without keepNames, the Judge still finds a suspect but cannot relate it to the diff", () => {
  const { suspects, matches } = attributionOf("without keepNames");
  assert.ok(suspects.length > 0, "the handler still runs for long in the branch");
  assert.ok(!suspects.some((s) => s.name === "recommendFor"), JSON.stringify(suspects));
  assert.ok(!matches.some((m) => m.line.includes("recommendFor")), JSON.stringify(matches));
});
