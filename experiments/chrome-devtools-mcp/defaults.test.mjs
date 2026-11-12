// Documents the defaults of Chrome DevTools MCP, and of the stdio client that starts it, that the
// agents of the workshop change.
// If a new version changes one of them, its test fails and the Learnings page needs an update.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, "node_modules/.bin/chrome-devtools-mcp");

const BASE_ARGS = [
  "--headless",
  "--isolated",
  `--executablePath=${chromium.executablePath()}`,
  "--usageStatistics=false",
  "--performanceCrux=false",
  // A Linux container has no usable Chromium sandbox without extra privileges
  ...(process.platform === "linux" ? ["--chromeArg=--no-sandbox"] : []),
];

let server;
let url;

before(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>Defaults</title><h1>Chrome DevTools MCP defaults</h1>");
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  url = `http://127.0.0.1:${server.address().port}/`;
});

after(() => server.close());

// Starts the server with the given flags, runs fn with a call helper and closes the server.
async function withServer(flags, fn) {
  const client = new Client({ name: "experiment-chrome-devtools-mcp", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: SERVER, args: [...BASE_ARGS, ...flags], stderr: "ignore" }));
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content.map((part) => part.text ?? "").join("\n");
    return { ok: !result.isError, text };
  };
  try {
    return await fn(call);
  } finally {
    await client.close();
  }
}

// A trace path outside the OS temp directory, inside the experiment
async function outsideTemp() {
  const dir = resolve(HERE, "out");
  await rm(dir, { recursive: true, force: true });
  return join(dir, "trace.json");
}

// The stdio client starts the server with a few variables only (HOME, PATH...), without
// TMPDIR, so the temp directory of the server can differ from the one of the client.
const SERVER_TMPDIR = execFileSync(process.execPath, ["-p", "require('node:os').tmpdir()"], {
  env: getDefaultEnvironment(),
  encoding: "utf8",
}).trim();

const tracePathIn = async (dir) => join(await mkdtemp(join(dir, "devtools-mcp-")), "trace.json");

// Where Playwright looks for Chromium in a Node process started with the given environment
const chromiumPathWith = (env) =>
  execFileSync(process.execPath, ["-p", "require('playwright').chromium.executablePath()"], { cwd: HERE, env, encoding: "utf8" }).trim();

// The same happens to WebPerf Snippets MCP, which launches the Chromium of Playwright: a browser
// installed in a custom path is not found by a server started over stdio
test("the stdio client does not pass PLAYWRIGHT_BROWSERS_PATH, so the server looks for Chromium in the default path", () => {
  const custom = join(tmpdir(), "custom-ms-playwright");
  const previous = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = custom;
  try {
    const serverEnv = getDefaultEnvironment();
    assert.equal(serverEnv.PLAYWRIGHT_BROWSERS_PATH, undefined);
    assert.ok(chromiumPathWith(process.env).startsWith(custom));
    assert.ok(!chromiumPathWith(serverEnv).startsWith(custom));
  } finally {
    if (previous === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = previous;
  }
});

test("by default, page tools require a pageId", async () => {
  await withServer([], async (call) => {
    const { ok, text } = await call("navigate_page", { type: "url", url });
    assert.equal(ok, false);
    assert.match(text, /pageId/);
  });
});

test("with --no-page-id-routing, page tools work without a pageId", async () => {
  await withServer(["--no-page-id-routing"], async (call) => {
    const { ok, text } = await call("navigate_page", { type: "url", url });
    assert.ok(ok, text);
  });
});

test("by default, a trace can be saved in the temp directory of the server", async () => {
  const filePath = await tracePathIn(SERVER_TMPDIR);
  await withServer(["--no-page-id-routing"], async (call) => {
    await call("navigate_page", { type: "url", url });
    const { ok, text } = await call("performance_start_trace", { reload: true, autoStop: true, filePath });
    assert.ok(ok, text);
  });
  assert.ok((await stat(filePath)).size > 0);
});

test(
  "by default, a trace cannot be saved in the temp directory of the client when TMPDIR moves it",
  { skip: tmpdir() === SERVER_TMPDIR && "the client and the server share the temp directory" },
  async () => {
    const filePath = await tracePathIn(tmpdir());
    await withServer(["--no-page-id-routing"], async (call) => {
      await call("navigate_page", { type: "url", url });
      const { ok, text } = await call("performance_start_trace", { reload: true, autoStop: true, filePath });
      assert.equal(ok, false);
      assert.match(text, /Access denied/);
    });
  },
);

test("by default, a trace cannot be saved outside the OS temp directory", async () => {
  const filePath = await outsideTemp();
  await withServer(["--no-page-id-routing"], async (call) => {
    await call("navigate_page", { type: "url", url });
    const { ok } = await call("performance_start_trace", { reload: true, autoStop: true, filePath });
    assert.equal(ok, false);
  });
  await assert.rejects(stat(filePath), { code: "ENOENT" });
});

// The temp directory of the server stays allowed: --workspace adds a directory, it does not replace it
test("with --workspace, a trace can be saved in that directory but not in a sibling", async () => {
  const filePath = await outsideTemp();
  const workspace = join(dirname(filePath), "workspace");
  await mkdir(workspace, { recursive: true }); // the server ignores a workspace that does not exist
  await withServer(["--no-page-id-routing", `--workspace=${workspace}`], async (call) => {
    await call("navigate_page", { type: "url", url });
    const inside = await call("performance_start_trace", { reload: true, autoStop: true, filePath: join(workspace, "trace.json") });
    assert.ok(inside.ok, inside.text);
    const sibling = await call("performance_start_trace", { reload: true, autoStop: true, filePath });
    assert.equal(sibling.ok, false);
  });
  await assert.rejects(stat(filePath), { code: "ENOENT" });
  const trace = JSON.parse(await readFile(join(workspace, "trace.json"), "utf8"));
  assert.ok((trace.traceEvents ?? trace).length > 0);
});

test("with --workspace, a trace can still be saved in the temp directory of the server", async () => {
  const workspace = join(dirname(await outsideTemp()), "workspace");
  await mkdir(workspace, { recursive: true });
  const filePath = await tracePathIn(SERVER_TMPDIR);
  await withServer(["--no-page-id-routing", `--workspace=${workspace}`], async (call) => {
    await call("navigate_page", { type: "url", url });
    const { ok, text } = await call("performance_start_trace", { reload: true, autoStop: true, filePath });
    assert.ok(ok, text);
  });
  const trace = JSON.parse(await readFile(filePath, "utf8"));
  assert.ok((trace.traceEvents ?? trace).length > 0);
});
