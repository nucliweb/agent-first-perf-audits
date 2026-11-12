#!/usr/bin/env node
// Builds the workshop branch from main. In main, the code that attendees write in each step sits
// between two markers:
//   // workshop: step 2, shape the answers into the LCP report (test/subagents/lcp.test.ts)
//   ...
//   // workshop: end
// The branch starts with every region as a throw that names its step, its task and its tests
// (tag workshop-start), and gets one commit per step that brings its code back (tags
// step-01-solution, step-02-solution...). Every state must typecheck; in the agents image, the
// tests of the solved steps must pass and those of the steps to come must fail.
//   node scripts/workshop.mjs
// It works in a temporary worktree and leaves the branch and the tags local; it prints how to push
// them.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// The markers, shared with the check of each step
import { END, regionsOf, START } from "../agents/src/workshop.ts";

export { regionsOf };

// The file with the regions of the steps after solved replaced by a throw
export function stubbed(text, solved) {
  const out = [];
  let open = null;
  for (const line of text.split("\n")) {
    const start = line.match(START);
    if (start) {
      if (open) throw new Error(`A workshop marker inside another: ${line.trim()}`);
      const [, indent, step, task, tests] = start;
      open = { stub: Number(step) > solved };
      out.push(line);
      if (open.stub) out.push(`${indent}throw new Error("Step ${step} of the workshop: ${task}. Its tests: ${tests}");`);
      continue;
    }
    if (END.test(line)) {
      if (!open) throw new Error("A workshop: end without a start");
      open = null;
      out.push(line);
      continue;
    }
    if (!open?.stub) out.push(line);
  }
  if (open) throw new Error("A workshop marker without its end");
  return out.join("\n");
}

const REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));
const IMAGE = "ghcr.io/nucliweb/agent-first-perf-audits/agents:main";

const run = (command, args, options = {}) => execFileSync(command, args, { encoding: "utf8", ...options });
const git = (cwd, ...args) => run("git", ["-C", cwd, ...args]).trim();

// Runs test files in the agents image with the code of the worktree, outside Compose: the tests
// that measure the shops skip, the ones with a local page and the real MCP servers run
function testsPass(worktree, files) {
  const mounts = ["src", "test", "journeys"].flatMap((dir) => ["-v", `${join(worktree, "agents", dir)}:/app/${dir}:ro`]);
  try {
    run("docker", ["run", "--rm", ...mounts, IMAGE, "node", "--test", ...files], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const base = git(REPO, "rev-parse", "--short", "main");
  const files = git(REPO, "grep", "-l", "// workshop: step", "main", "--", "agents/src")
    .split("\n")
    .map((line) => line.replace(/^main:/, ""));
  const sources = Object.fromEntries(files.map((file) => [file, git(REPO, "show", `main:${file}`) + "\n"]));
  const regions = Object.values(sources).flatMap(regionsOf);
  const steps = [...new Set(regions.map((r) => r.step))].sort((a, b) => a - b);
  const testsOf = (step) => [...new Set(regions.filter((r) => r.step === step).map((r) => r.tests))];
  console.error(`[workshop] main ${base}: ${regions.length} regions in ${files.length} files, steps ${steps.join(", ")}`);

  const worktree = mkdtempSync(join(tmpdir(), "workshop-"));
  git(REPO, "worktree", "add", "--force", "-B", "workshop", worktree, "main");
  const modules = join(worktree, "agents", "node_modules");
  symlinkSync(join(REPO, "agents", "node_modules"), modules);
  const tags = [];
  try {
    for (const solved of [0, ...steps]) {
      for (const [file, text] of Object.entries(sources)) writeFileSync(join(worktree, file), stubbed(text, solved));
      run(join(modules, ".bin", "tsc"), ["--noEmit", "-p", join(worktree, "agents")]);
      for (const step of steps) {
        const pass = testsPass(worktree, testsOf(step));
        if (pass !== step <= solved) {
          throw new Error(`With step ${solved} solved, the tests of step ${step} ${pass ? "pass" : "fail"}: ${testsOf(step).join(" ")}`);
        }
      }
      git(worktree, "add", "agents/src");
      const message = solved
        ? `Solution of step ${solved}\n\nThe code of step ${solved} of the workshop, from main ${base}.`
        : `Start of the workshop\n\nThe code that attendees write in steps ${steps.join(", ")} is a throw that names the step, its task and its tests, between the workshop markers of main ${base}.`;
      git(worktree, "commit", "--quiet", "-m", message);
      const tag = solved ? `step-${String(solved).padStart(2, "0")}-solution` : "workshop-start";
      git(worktree, "tag", "--force", tag);
      tags.push(tag);
      console.error(`[workshop] ${tag}: typecheck, and the tests of steps 1 to ${solved} pass and the rest fail`);
    }
  } finally {
    unlinkSync(modules);
    git(REPO, "worktree", "remove", "--force", worktree);
  }
  console.error(`[workshop] the workshop branch and its tags are local. To publish them:`);
  console.error(`  git push --force origin workshop ${tags.map((t) => `refs/tags/${t}`).join(" ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
