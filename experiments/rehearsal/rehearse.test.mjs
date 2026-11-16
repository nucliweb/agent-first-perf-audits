// The rehearsal: which commands it takes from the README and the guides, how it runs one, and a whole
// rehearsal of a small repo made for the test, from the clone to the results file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describePlan, planOf, profileOf, rehearse, rehearseProfiles, runCommand } from "./rehearse.mjs";

const REPO = resolve(import.meta.dirname, "../..");

test("the plan of the repo: the setup of README.es.md, then the commands of the Spanish guides in order", () => {
  const plan = planOf(REPO);
  const setup = plan.filter((c) => c.step === "setup");
  assert.ok(setup.every((c) => c.file === "README.es.md"));
  assert.deepEqual(
    setup.map((c) => c.marker),
    ["clone", "skip", "optional"],
    "the clone and the preflight, the downloads by hand and the gate on one branch",
  );
  assert.match(setup[0].command, /scripts\/preflight\.sh/);
  assert.deepEqual([...new Set(plan.map((c) => c.step))], ["setup", "step-01", "step-02", "step-03", "step-04", "step-05"]);
  assert.equal(plan.find((c) => c.step === "step-01").command, "git fetch origin workshop --tags\ngit switch -c taller workshop-start\ndocker compose up -d");
  assert.ok(plan.filter((c) => c.step !== "setup").every((c) => c.file.startsWith("docs/src/content/docs/es/workshop/")));
});

test("the optional CLS of step 3 is marked, so its minutes do not count in the slot of the step", () => {
  const optional = planOf(REPO).filter((c) => c.step === "step-03" && c.marker === "optional");
  assert.equal(optional.length, 1);
  assert.match(optional[0].command, /CANDIDATE=pr-cls-promo-banner/);
});

test("the plan of a subset of the steps, and a step that does not exist is an error with the list", () => {
  assert.deepEqual([...new Set(planOf(REPO, { only: ["step-01", "step-05"] }).map((c) => c.step))], ["step-01", "step-05"]);
  assert.throws(() => planOf(REPO, { only: ["step-07"] }), /unknown step "step-07"; one of setup, step-01, step-02, step-03, step-04, step-05, step-06/);
});

test("the dry run lists each command with its step, its place in the guide and its marker", () => {
  const lines = describePlan(planOf(REPO, { only: ["setup"] })).split("\n");
  assert.match(lines[0], /^setup\s+README\.es\.md:\d+\s+clone\s*$/);
  assert.match(lines[1], /^ {4}scripts\/preflight\.sh\s+#/, "the commands without the lines the clone stands for");
  assert.ok(!lines.some((l) => /git clone|^\s+cd /.test(l)));
  assert.ok(lines.some((l) => /^setup\s+README\.es\.md:\d+\s+skip: /.test(l)), "a skipped command says why");
});

test("the profile is the one of COMPOSE_PROFILES, llm by default as the .env of the repo", () => {
  assert.equal(profileOf({}), "llm");
  assert.equal(profileOf({ COMPOSE_PROFILES: "llm" }), "llm");
  assert.equal(profileOf({ COMPOSE_PROFILES: "lite" }), "lite");
});

test("runs a command with bash in a folder and keeps its exit code, its time and both outputs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rehearsal-run-"));
  try {
    const run = await runCommand('for n in 1 2; do echo "out $n"; done\necho err >&2\npwd\nexit 3', { cwd: dir, env: process.env, echo: false });
    assert.equal(run.exitCode, 3);
    assert.equal(run.timedOut, false);
    assert.ok(run.durationMs >= 0);
    assert.match(run.output, /out 1\nout 2\n/);
    assert.match(run.output, /err\n/);
    assert.match(run.output, /rehearsal-run-/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a command that takes longer than the timeout is stopped, children included", async () => {
  const run = await runCommand("sleep 5 & wait", { cwd: tmpdir(), env: process.env, timeoutMs: 200, echo: false });
  assert.equal(run.timedOut, true);
  assert.ok(run.durationMs < 4000, `${run.durationMs} ms`);
});

// A repo with a README and one guide, the way the real ones write their commands
function sourceRepo() {
  const root = mkdtempSync(join(tmpdir(), "rehearsal-source-"));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  write(
    "README.es.md",
    [
      "# Repo",
      "",
      "## Puesta en marcha",
      "",
      "<!-- rehearsal: clone -->",
      "```bash",
      "git clone https://example.com/repo.git",
      "cd repo",
      'echo "profile $COMPOSE_PROFILES, candidate ${CANDIDATE:-unset}"',
      "```",
      "",
      "```text",
      "profile lite, candidate unset",
      "```",
      "",
      "<!-- rehearsal: skip, the same downloads by hand -->",
      "```bash",
      "exit 3",
      "```",
      "",
      "## Otra cosa",
      "",
      "```bash",
      "exit 5",
      "```",
      "",
    ].join("\n"),
  );
  write(
    "guide/step-01.md",
    [
      "1. Run the tests:",
      "",
      "   ```bash",
      "   cat only-in-the-ref.txt",
      "   printf 'ℹ pass 2\\nℹ fail 0\\n'",
      "   ```",
      "",
      "   They pass (`pass 2`):",
      "",
      "   ```text",
      "   the file of the ref",
      "   ```",
      "",
      "2. Optional:",
      "",
      "   <!-- rehearsal: optional -->",
      "   ```bash",
      "   echo \"optional in $PWD\"; exit 4",
      "   ```",
      "",
    ].join("\n"),
  );
  write("only-in-the-ref.txt", "the file of the ref\n");
  git("init", "--quiet", "-b", "main");
  git("add", ".");
  git("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "first");
  git("tag", "v1");
  git("rm", "--quiet", "only-in-the-ref.txt");
  git("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "second");
  return { root, commit: execFileSync("git", ["-C", root, "rev-parse", "v1"], { encoding: "utf8" }).trim() };
}

const SOURCES = [
  { file: "README.es.md", step: "setup", section: "Puesta en marcha" },
  { file: "guide/step-01.md", step: "step-01" },
];

test("a rehearsal clones the ref, runs each command from the root of the clone and writes what happened", async () => {
  const source = sourceRepo();
  const dir = mkdtempSync(join(tmpdir(), "rehearsal-dir-"));
  const results = mkdtempSync(join(tmpdir(), "rehearsal-results-"));
  try {
    const { file } = await rehearse({
      source: source.root,
      ref: "v1",
      dir,
      sources: SOURCES,
      resultsDir: results,
      env: { ...process.env, COMPOSE_PROFILES: "lite", CANDIDATE: "pr-from-my-shell" },
      echo: false,
      log: () => {},
    });
    assert.equal(file, join(results, "lite.json"));
    const saved = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(saved.profile, "lite");
    assert.equal(saved.ref, "v1");
    assert.equal(saved.commit, source.commit);
    assert.equal(saved.source, "local");
    assert.equal(saved.complete, true);
    assert.ok(saved.clone.durationMs >= 0);

    const [clone, skipped, tests, optional] = saved.commands;
    assert.equal(saved.commands.length, 4, "only the section of the README");
    assert.deepEqual(
      { step: clone.step, file: clone.file, index: clone.index, marker: clone.marker, exitCode: clone.exitCode, matched: clone.matched },
      { step: "setup", file: "README.es.md", index: 0, marker: "clone", exitCode: 0, matched: true },
      "the profile of the rehearsal and none of the variables of the lab of the shell",
    );
    assert.deepEqual({ status: skipped.status, note: skipped.note, exitCode: skipped.exitCode }, { status: "skipped", note: "the same downloads by hand", exitCode: null });
    assert.deepEqual(
      { status: tests.status, exitCode: tests.exitCode, counts: tests.counts, matched: tests.matched, missing: tests.missing, line: tests.line },
      { status: "ran", exitCode: 0, counts: { pass: 2, fail: 0 }, matched: true, missing: [], line: 3 },
      "the file that only the ref has, read from the root of the clone",
    );
    assert.deepEqual({ marker: optional.marker, exitCode: optional.exitCode, expected: optional.expected, matched: optional.matched }, { marker: "optional", exitCode: 4, expected: false, matched: null });
    assert.deepEqual(optional.tail, ["optional in <clone>"], "the paths of this machine stay out of the results file");
    const text = readFileSync(file, "utf8");
    for (const path of [source.root, dir, realpathSync(source.root), realpathSync(dir)]) assert.ok(!text.includes(path), `the results file has the path ${path}`);
  } finally {
    for (const path of [source.root, dir, results]) rmSync(path, { recursive: true, force: true });
  }
});

test("a rehearsal of some steps, without the optional commands, goes to its own results file", async () => {
  const source = sourceRepo();
  const dir = mkdtempSync(join(tmpdir(), "rehearsal-dir-"));
  const results = mkdtempSync(join(tmpdir(), "rehearsal-results-"));
  try {
    const { file } = await rehearse({
      source: source.root,
      ref: "v1",
      dir,
      only: ["step-01"],
      skipOptional: true,
      sources: SOURCES,
      resultsDir: results,
      env: { ...process.env, COMPOSE_PROFILES: "llm" },
      echo: false,
      log: () => {},
    });
    assert.equal(file, join(results, "llm-step-01.json"));
    const saved = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(saved.only, ["step-01"]);
    assert.deepEqual(
      saved.commands.map((c) => [c.step, c.status]),
      [
        ["step-01", "ran"],
        ["step-01", "skipped"],
      ],
    );
  } finally {
    for (const path of [source.root, dir, results]) rmSync(path, { recursive: true, force: true });
  }
});

test("a rehearsal of several profiles runs one after the other, each in its own clone, and stops the lab of each one when it ends", async () => {
  const source = sourceRepo();
  const dir = mkdtempSync(join(tmpdir(), "rehearsal-dir-"));
  const results = mkdtempSync(join(tmpdir(), "rehearsal-results-"));
  const stopped = [];
  try {
    const files = await rehearseProfiles(
      ["llm", "lite"],
      // The shell has the profile of another day: each rehearsal takes its own
      { source: source.root, ref: "v1", dir, sources: SOURCES, resultsDir: results, env: { ...process.env, COMPOSE_PROFILES: "lite" }, echo: false, log: () => {} },
      { stopLab: (clone) => stopped.push({ clone, saved: ["llm", "lite"].filter((profile) => existsSync(join(results, `${profile}.json`))) }) },
    );
    assert.deepEqual(files, [join(results, "llm.json"), join(results, "lite.json")]);
    for (const profile of ["llm", "lite"]) {
      const saved = JSON.parse(readFileSync(join(results, `${profile}.json`), "utf8"));
      assert.deepEqual({ profile: saved.profile, complete: saved.complete, matched: saved.commands[0].matched }, { profile, complete: true, matched: profile === "lite" }, "the first command prints the profile it runs with");
    }
    assert.deepEqual(
      stopped,
      [
        { clone: join(dir, "llm", "agent-first-perf-audits"), saved: ["llm"] },
        { clone: join(dir, "lite", "agent-first-perf-audits"), saved: ["llm", "lite"] },
      ],
      "the lab of llm stops before lite starts",
    );
  } finally {
    for (const path of [source.root, dir, results]) rmSync(path, { recursive: true, force: true });
  }
});

test("a rehearsal of several profiles refuses a profile the workshop does not have", async () => {
  await assert.rejects(rehearseProfiles(["llm", "gpu"], {}), /unknown profile "gpu"; one of llm, lite/);
});
