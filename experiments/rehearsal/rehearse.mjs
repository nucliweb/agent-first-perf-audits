// The timed rehearsal of the workshop: it clones the repo clean, takes the bash blocks of the setup
// of README.es.md and of the Spanish guides of each step, in order, runs each one from the root of the
// clone as an attendee would, and writes what happened to results/<profile>.json: per command, its
// exit code, its time, the pass and fail counts of node --test and whether its output has the lines of
// the text block that follows it in the guide. The guide and reality cannot drift apart: the figures
// of the docs come from that file, and claims.test.mjs checks them.
//
// The profile is the one of COMPOSE_PROFILES, as for an attendee: llm by default, or lite. The markers
// that a guide can put above a block are in guide.mjs.
//
// Usage, from anywhere:
//   node rehearse.mjs [--source <path or URL>] [--ref main] [--only step-01,step-02] [--skip-optional]
//                     [--dir <empty folder>] [--timeout <minutes>]
//   node rehearse.mjs --profiles llm,lite ...   one rehearsal per profile, one after the other, each
//                                               with its lab stopped when it ends
//   node rehearse.mjs --dry-run [--only ...]    lists the commands of the guides of this checkout
//
// It measures: on the reference machine, nothing else runs at the same time. The lab it leaves up
// belongs to the Compose project of the clone, named after its folder like the one of an attendee.
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { rehearsalCommandsOf, withoutCloneLines } from "./guide.mjs";
import { branchExitsOf, matchOutput, stripAnsi, testCountsOf } from "./output.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const RESULTS = join(import.meta.dirname, "results");
// The folder the README clones into, which also names the Compose project of the lab
const CLONE = "agent-first-perf-audits";
const GUIDES = "docs/src/content/docs/es/workshop";
const TAIL = 20;

// Where the commands come from, in the order of the workshop: the setup at home, then each step
export const SOURCES = [
  { file: "README.es.md", step: "setup", section: "Puesta en marcha" },
  ...["01", "02", "03", "04", "05", "06"].map((n) => ({ file: `${GUIDES}/step-${n}.md`, step: `step-${n}` })),
];

// The variables of the lab that a shell may have set and an attendee who follows the guides has not
const LAB_VARIABLES = ["CANDIDATE", "BASELINE", "OUT", "COMPOSE_PROJECT_NAME", "COMPOSE_FILE"];

// The profiles of the workshop. llm is the one the .env of the repo sets, so its rehearsal goes
// without the variable, as for an attendee who changes nothing
export const PROFILES = ["llm", "lite"];

export function envOf(profile, env) {
  const { COMPOSE_PROFILES: _, ...rest } = env;
  return profile === "llm" ? rest : { ...rest, COMPOSE_PROFILES: profile };
}

export const profileOf = (env) => ((env.COMPOSE_PROFILES ?? "").split(",").includes("lite") ? "lite" : "llm");

// The commands of the sources under root, in order, each with its step and its file
export function planOf(root, { sources = SOURCES, only } = {}) {
  const steps = sources.map((s) => s.step);
  for (const step of only ?? []) if (!steps.includes(step)) throw new Error(`unknown step "${step}"; one of ${steps.join(", ")}`);
  return sources
    .filter((s) => !only || only.includes(s.step))
    .flatMap((s) => rehearsalCommandsOf(readFileSync(join(root, s.file), "utf8"), { section: s.section }).map((c) => ({ step: s.step, file: s.file, ...c })));
}

// What runs of a command: a block that clones runs without the lines the clone of the rehearsal did
export const runnableOf = (planned) => (planned.marker === "clone" ? withoutCloneLines(planned.command) : planned.command);

// The plan as the dry run prints it: a line per command with its step, its place and its marker, and
// the command indented below
export function describePlan(plan) {
  const width = Math.max(0, ...plan.map((c) => `${c.file}:${c.line}`.length));
  return plan
    .map((c) => {
      const marker = c.marker ? (c.note ? `${c.marker}: ${c.note}` : c.marker) : "";
      const head = `${c.step.padEnd(8)} ${`${c.file}:${c.line}`.padEnd(width)}  ${marker}`.trimEnd();
      return [head, ...runnableOf(c).split("\n").map((line) => `    ${line}`)].join("\n");
    })
    .join("\n\n");
}

// Runs a command with bash in cwd, its output to the terminal when echo, and resolves with its exit
// code, its time and its output. A timeout or an abort stops its whole process group.
export function runCommand(command, { cwd, env, timeoutMs = 0, echo = true, signal } = {}) {
  return new Promise((resolveRun) => {
    const start = performance.now();
    const child = spawn("bash", ["-c", command], { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let output = "";
    let timedOut = false;
    const take = (stream) => (chunk) => {
      output += chunk;
      if (echo) stream.write(chunk);
    };
    child.stdout.setEncoding("utf8").on("data", take(process.stdout));
    child.stderr.setEncoding("utf8").on("data", take(process.stderr));
    const stop = () => {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // the group has already exited
      }
    };
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          stop();
        }, timeoutMs)
      : null;
    signal?.addEventListener("abort", stop, { once: true });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      resolveRun({ exitCode: code, timedOut, durationMs: Math.round(performance.now() - start), output });
    });
  });
}

// The paths of this machine that an output may print, each with the name the results file gives it:
// the longest first, and each one also as the system resolves it (/var is /private/var on macOS)
export function hiddenPathsOf(named) {
  return Object.entries(named)
    .flatMap(([name, path]) => [...new Set([path, existsSync(path) ? realpathSync(path) : path])].map((p) => [p, `<${name}>`]))
    .sort((a, b) => b[0].length - a[0].length);
}

// The last lines of an output that are not blank, without colours and without the paths of this machine
const tailOf = (output, hidden) =>
  stripAnsi(output)
    .split(/\r\n|\r|\n/)
    .map((line) => hidden.reduce((text, [path, name]) => text.replaceAll(path, name), line.trimEnd()))
    .filter(Boolean)
    .slice(-TAIL);

// What the results file keeps of a command: what the guide says and, when it ran, what happened
export function recordOf(planned, run, hidden = []) {
  const { step, file, index, line, command, marker, note } = planned;
  const expected = planned.expected != null;
  if (!run) return { step, file, index, line, command, marker, note, status: "skipped", exitCode: null, durationMs: null, counts: null, expected, matched: null, missing: [] };
  const { matched, missing } = matchOutput(run.output, planned.expected);
  const branchExits = branchExitsOf(run.output);
  return {
    step,
    file,
    index,
    line,
    command,
    marker,
    note,
    status: "ran",
    exitCode: run.exitCode,
    timedOut: run.timedOut,
    durationMs: run.durationMs,
    counts: testCountsOf(run.output),
    expected,
    matched,
    missing,
    ...(branchExits.length ? { branchExits } : {}),
    tail: tailOf(run.output, hidden),
  };
}

// The machine time of each step, without its optional commands, in ms
export function stepTimesOf(commands) {
  const times = {};
  for (const c of commands.filter((c) => c.status === "ran" && c.marker !== "optional")) times[c.step] = (times[c.step] ?? 0) + c.durationMs;
  return times;
}

const git = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function save(file, results) {
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(results, null, 2) + "\n");
  renameSync(`${file}.tmp`, file);
}

const minutes = (ms) => `${(ms / 60000).toFixed(1)} min`;

export async function rehearse({
  source = REPO,
  ref = "main",
  dir,
  only,
  skipOptional = false,
  timeoutMs = 30 * 60 * 1000,
  sources = SOURCES,
  resultsDir = RESULTS,
  env = process.env,
  echo = true,
  log = console.log,
}) {
  const profile = profileOf(env);
  const runEnv = Object.fromEntries(Object.entries(env).filter(([name]) => !LAB_VARIABLES.includes(name)));
  const folder = dir ?? mkdtempSync(join(tmpdir(), "rehearsal-"));
  const clone = join(folder, CLONE);
  if (existsSync(clone)) throw new Error(`${clone} already exists: the rehearsal starts from a clean clone, pass another --dir`);
  const file = join(resultsDir, `${profile}${only ? `-${only.join("-")}` : ""}.json`);
  const transcript = join(folder, "rehearsal.log");

  log(`[rehearsal] cloning ${source} at ${ref} into ${clone}`);
  const cloneStart = performance.now();
  mkdirSync(folder, { recursive: true });
  git(["clone", "--quiet", source, clone]);
  git(["-C", clone, "checkout", "--quiet", ref]);
  const remote = /^(https?:|ssh:|git@)/.test(source);
  const hidden = hiddenPathsOf({ clone, dir: folder, ...(remote ? {} : { source: resolve(source) }) });
  const results = {
    profile,
    date: new Date().toISOString(),
    source: remote ? source : "local",
    ref,
    commit: git(["-C", clone, "rev-parse", "HEAD"]),
    only: only ?? null,
    skipOptional,
    host: { platform: process.platform, arch: process.arch, cpus: availableParallelism(), memoryGb: Math.round(totalmem() / 2 ** 30), node: process.version },
    clone: { durationMs: Math.round(performance.now() - cloneStart) },
    complete: false,
    commands: [],
  };

  const plan = planOf(clone, { sources, only });
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    for (const [n, planned] of plan.entries()) {
      if (abort.signal.aborted) break;
      const where = `${planned.file}:${planned.line}`;
      const skip = planned.marker === "skip" || (planned.marker === "optional" && skipOptional);
      if (skip) {
        log(`[rehearsal] ${n + 1}/${plan.length} ${planned.step}, ${where}: skipped${planned.note ? ` (${planned.note})` : ""}`);
        results.commands.push(recordOf(planned, null));
        save(file, results);
        continue;
      }
      const command = runnableOf(planned);
      log(`[rehearsal] ${n + 1}/${plan.length} ${planned.step}, ${where}${planned.marker ? ` (${planned.marker})` : ""}\n$ ${command.replaceAll("\n", "\n$ ")}`);
      const run = await runCommand(command, { cwd: clone, env: runEnv, timeoutMs, echo, signal: abort.signal });
      appendFileSync(transcript, `### ${planned.step}, ${where}\n$ ${command}\n${run.output}\n[exit ${run.exitCode}${run.timedOut ? ", timed out" : ""}, ${run.durationMs} ms]\n\n`);
      const record = recordOf(planned, run, hidden);
      results.commands.push(record);
      save(file, results);
      const match = record.matched === null ? "" : record.matched ? ", output as in the guide" : `, ${record.missing.length} expected line(s) missing`;
      log(`[rehearsal] exit ${run.exitCode}${run.timedOut ? " (timed out)" : ""} in ${(run.durationMs / 1000).toFixed(1)} s${match}`);
    }
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
  results.complete = !abort.signal.aborted && results.commands.length === plan.length;
  save(file, results);

  for (const [step, ms] of Object.entries(stepTimesOf(results.commands))) {
    const commands = results.commands.filter((c) => c.step === step && c.status === "ran");
    const off = commands.filter((c) => c.matched === false).length;
    log(`[rehearsal] ${step}: ${minutes(ms)} of machine time, ${commands.length} command(s)${off ? `, ${off} with output unlike the guide` : ""}`);
  }
  log(`[rehearsal] ${results.complete ? "done" : "interrupted"}: ${file}\n[rehearsal] the clone, its lab and the transcript (${transcript}) stay; docker compose down from the clone stops the lab`);
  if (abort.signal.aborted) throw new Error("the rehearsal was interrupted; its results file says complete: false");
  return { file, results, clone };
}

// Stops the lab that a rehearsal leaves up, from its clone
async function stopLabOf(clone, env) {
  const { exitCode, output } = await runCommand("docker compose --profile llm down", { cwd: clone, env, echo: false });
  if (exitCode !== 0) throw new Error(`could not stop the lab of ${clone}:\n${output}`);
}

// One rehearsal per profile, one after the other: each in its own clone, a folder per profile when
// dir is given, and with its lab stopped when it ends, because the clones share the name of their
// Compose project and the next one needs the machine alone
export async function rehearseProfiles(profiles, options, { stopLab = stopLabOf } = {}) {
  for (const profile of profiles) if (!PROFILES.includes(profile)) throw new Error(`unknown profile "${profile}"; one of ${PROFILES.join(", ")}`);
  const files = [];
  for (const profile of profiles) {
    const env = envOf(profile, options.env ?? process.env);
    const { file, clone } = await rehearse({ ...options, env, dir: options.dir && join(options.dir, profile) });
    (options.log ?? console.log)(`[rehearsal] stopping the lab of ${clone}`);
    await stopLab(clone, env);
    files.push(file);
  }
  return files;
}

function optionsOf(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      source: { type: "string", default: REPO },
      ref: { type: "string", default: "main" },
      only: { type: "string" },
      dir: { type: "string" },
      timeout: { type: "string", default: "30" },
      profiles: { type: "string" },
      "skip-optional": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const timeout = Number(values.timeout);
  if (!(timeout > 0)) throw new Error(`--timeout takes minutes, not "${values.timeout}"`);
  return {
    source: values.source,
    ref: values.ref,
    only: values.only ? values.only.split(",").map((s) => s.trim()) : undefined,
    dir: values.dir,
    profiles: values.profiles ? values.profiles.split(",").map((s) => s.trim()) : undefined,
    timeoutMs: timeout * 60 * 1000,
    skipOptional: values["skip-optional"],
    dryRun: values["dry-run"],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = optionsOf(process.argv.slice(2));
    if (options.dryRun) {
      const plan = planOf(REPO, { only: options.only });
      console.log(describePlan(plan));
      console.log(
        `\n${plan.length} commands from the guides of this checkout, profile ${profileOf(process.env)}. ` +
          `A real run clones ${options.source} at ${options.ref} and takes them from the clone.`,
      );
    } else if (options.profiles) {
      const { profiles, dryRun, ...rest } = options;
      await rehearseProfiles(profiles, rest);
    } else {
      const { profiles, dryRun, ...rest } = options;
      await rehearse(rest);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}
