// The workshop markers of the code. In main, the code that attendees write in each step sits
// between two of them:
//   // workshop: step 2, shape the answers into the LCP report (test/subagents/lcp.test.ts)
//   ...
//   // workshop: end
// scripts/workshop.mjs turns the regions into stubs on the workshop branch, and the check of each
// step finds its tests in them.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const START = /^(\s*)\/\/ workshop: step (\d+), (.+) \((\S+)\)$/;
export const END = /^\s*\/\/ workshop: end$/;

export interface Region {
  step: number;
  task: string;
  // A test file, relative to agents/
  tests: string;
}

export function regionsOf(text: string): Region[] {
  return text
    .split("\n")
    .map((line) => line.match(START))
    .filter((match) => match !== null)
    .map(([, , step, task, tests]) => ({ step: Number(step), task, tests }));
}

// The regions of every TypeScript file under dir
export function regionsIn(dir: string): Region[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .flatMap((file) => regionsOf(readFileSync(join(dir, file), "utf8")));
}
