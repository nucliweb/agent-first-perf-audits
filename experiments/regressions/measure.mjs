// Builds main and every regression branch of the shop, serves them side by side and runs the gate
// of the workshop on each branch: the WebPerf Snippets CLI against a baseline measured on main.
// The measurements run one after the other, so two Chromium never share the CPU.
// Usage: node measure.mjs   (writes out/results.json and prints a table)
import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = join(HERE, "out");
const CLI = join(HERE, "node_modules/.bin/webperf-snippets");
const JOURNEY = join(REPO, "agents/journeys/add-to-cart.json");

// The conditions of the gate
export const CONDITIONS = ["--cpu", "4", "--network", "fast-4g", "--runs", "5"];

export const SCENARIOS = [
  { id: "home", path: "/", args: [] },
  { id: "add-to-cart", path: "/product/kenya-aa", args: ["--workflow", "interaction", "--interact-script", JOURNEY] },
];

export const BASELINE = "main";

export const BRANCHES = [
  { ref: "pr/lcp-hero-lazy", expect: { scenario: "home", metric: "LCP" } },
  { ref: "pr/cls-promo-banner", expect: { scenario: "home", metric: "CLS" } },
  { ref: "pr/loaf-cart-handler", expect: { scenario: "add-to-cart", metric: "INP" } },
  { ref: "pr/noop-refactor", expect: null },
];

const git = (...args) => execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8" }).trim();

// A branch of a fresh clone may exist only on the remote
function resolveRef(ref) {
  for (const candidate of [ref, `origin/${ref}`]) {
    try {
      git("rev-parse", "--verify", "--quiet", `${candidate}^{commit}`);
      return candidate;
    } catch {}
  }
  throw new Error(`The ref ${ref} does not exist. Fetch the branches of the repo first.`);
}

function run(command, args, options = {}) {
  return new Promise((ok, fail) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", fail);
    child.on("close", (code) => ok({ code, stdout, stderr }));
  });
}

const freePort = () =>
  new Promise((ok) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => ok(port));
    });
  });

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error(`${url} did not start`);
}

// Extracts apps/ of a ref and builds the shop, with the dependencies installed in apps/shop
async function build(ref) {
  const dir = join(OUT, "refs", ref.replaceAll("/", "-"));
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  execFileSync("sh", ["-c", `git -C "${REPO}" archive "${ref}" apps | tar -x -C "${dir}"`]);

  const lockOf = (r) => git("show", `${r}:apps/shop/package-lock.json`);
  if (lockOf(ref) !== (await readFile(join(REPO, "apps/shop/package-lock.json"), "utf8")).trim()) {
    throw new Error(`${ref} has other dependencies than the working tree; this script reuses apps/shop/node_modules`);
  }
  if (!existsSync(join(REPO, "apps/shop/node_modules"))) throw new Error("Run npm ci in apps/shop first");
  await symlink(join(REPO, "apps/shop/node_modules"), join(dir, "apps/shop/node_modules"));

  const { code, stderr } = await run("npm", ["run", "build"], { cwd: join(dir, "apps/shop") });
  if (code !== 0) throw new Error(`The build of ${ref} failed:\n${stderr}`);
  return dir;
}

function serve(script, cwd, env) {
  const child = spawn(process.execPath, [script], { cwd, env: { ...process.env, ...env }, stdio: "ignore" });
  return child;
}

async function gate(url, scenario, baselineFile) {
  const args = [url, ...scenario.args, ...CONDITIONS, "--json"];
  if (baselineFile) args.push("--baseline", baselineFile, "--fail-on-regression");
  const { code, stdout, stderr } = await run(CLI, args);
  if (code > 1) throw new Error(`The CLI exited with ${code} on ${url}:\n${stderr}`);
  return { exitCode: code, report: JSON.parse(stdout) };
}

export async function measure() {
  await mkdir(OUT, { recursive: true });
  const refs = [BASELINE, ...BRANCHES.map((b) => b.ref)].map((ref) => ({ ref, resolved: resolveRef(ref) }));

  const dirs = {};
  for (const { ref, resolved } of refs) dirs[ref] = await build(resolved);

  const children = [];
  try {
    const thirdPartyPort = await freePort();
    const thirdPartyOrigin = `http://127.0.0.1:${thirdPartyPort}`;
    children.push(serve("server.mjs", join(dirs[BASELINE], "apps/thirdparty"), { PORT: String(thirdPartyPort) }));
    await waitFor(`${thirdPartyOrigin}/ab.js`);

    const origins = {};
    for (const { ref } of refs) {
      const port = await freePort();
      children.push(serve("server.mjs", join(dirs[ref], "apps/shop"), { PORT: String(port), THIRDPARTY_ORIGIN: thirdPartyOrigin }));
      origins[ref] = `http://127.0.0.1:${port}`;
      await waitFor(origins[ref]);
    }

    const results = [];
    for (const scenario of SCENARIOS) {
      const baselineFile = join(OUT, `baseline-${scenario.id}.json`);
      const { report } = await gate(origins[BASELINE] + scenario.path, scenario);
      await writeFile(baselineFile, JSON.stringify(report));

      for (const { ref } of BRANCHES) {
        const { exitCode, report: candidate } = await gate(origins[ref] + scenario.path, scenario, baselineFile);
        results.push({ ref, scenario: scenario.id, exitCode, metrics: candidate.baseline?.metrics ?? {} });
      }
    }
    await writeFile(join(OUT, "results.json"), JSON.stringify(results, null, 2));
    return results;
  } finally {
    for (const child of children) child.kill();
  }
}

const formatValue = (metric, value) =>
  value === undefined ? "" : metric === "CLS" ? value.toFixed(3).replace(".", ",") : `${Math.round(value)} ms`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = await measure();
  console.log("| Rama | Escenario | Métrica | main | Rama | Cambio | p | Veredicto | Exit |\n|---|---|---|---|---|---|---|---|---|");
  for (const { ref, scenario, exitCode, metrics } of results) {
    for (const [metric, m] of Object.entries(metrics)) {
      const change = m.deltaPercent == null ? "" : `${m.deltaPercent > 0 ? "+" : ""}${String(m.deltaPercent).replace(".", ",")} %`;
      const p = m.stats?.p == null ? "" : String(m.stats.p).replace(".", ",");
      console.log(
        `| \`${ref}\` | ${scenario} | ${metric} | ${formatValue(metric, m.baseline)} | ${formatValue(metric, m.current)} | ${change} | ${p} | ${m.verdict} | ${exitCode} |`,
      );
    }
  }
  console.log(`\nCondiciones: ${CONDITIONS.join(" ")}. Resultados en ${join(OUT, "results.json")}`);
}
