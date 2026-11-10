// Records one trace of fixture/index.html with Chrome DevTools MCP (load, wait, click) and
// collects the text each tool gives an agent for it: the summary and insights of DevTools MCP,
// and the trace-engine-cli summaries of the same file.
// Usage: node compare.mjs
import { createServer } from "node:http";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { chromium } from "playwright";
import { CPU_THROTTLING } from "./record.mjs";
import { summarize } from "./summarize.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "out/compare");

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

export async function compare() {
  const html = await readFile(resolve(HERE, "fixture/index.html"));
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${server.address().port}/`;

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const trace = resolve(OUT, "trace.json");

  const client = new Client({ name: "experiment-trace-engine-cli", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: resolve(HERE, "node_modules/.bin/chrome-devtools-mcp"),
      args: [
        "--headless",
        "--isolated",
        `--executablePath=${chromium.executablePath()}`,
        "--usageStatistics=false",
        "--performanceCrux=false",
        "--no-page-id-routing",
        `--workspace=${OUT}`,
        ...(process.platform === "linux" ? ["--chromeArg=--no-sandbox"] : []),
      ],
      stderr: "ignore",
    }),
  );

  const devtools = {};
  const call = async (name, args = {}, key) => {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content.map((part) => part.text ?? "").join("\n");
    if (result.isError) throw new Error(`${name} failed: ${text}`);
    if (key) devtools[key] = text;
    return text;
  };

  try {
    // The same journey as record.mjs: load, wait for the banner, click and wait for the next frame
    await call("navigate_page", { type: "url", url });
    await call("emulate", { cpuThrottlingRate: CPU_THROTTLING, viewport: "412x823x1" });
    await call("performance_start_trace", { reload: true, autoStop: false });
    await sleep(1500);
    const snapshot = await call("take_snapshot");
    const uid = snapshot.match(/uid=(\S+) button "Add to cart"/)?.[1];
    if (!uid) throw new Error(`The snapshot has no "Add to cart" button:\n${snapshot}`);
    await call("click", { uid });
    await sleep(800);
    const summary = await call("performance_stop_trace", { filePath: trace }, "performance_stop_trace");

    // An agent would ask for the insights the summary lists
    const insightSetId = summary.match(/insight set id: (\S+)/)?.[1];
    for (const [, insightName] of summary.matchAll(/insight name: (\w+)/g)) {
      await call("performance_analyze_insight", { insightSetId, insightName }, `performance_analyze_insight ${insightName}`);
    }
  } finally {
    await client.close();
    server.close();
  }

  const { traceBytes, summaries } = summarize(trace);
  const traceEngine = Object.fromEntries(summaries.map(({ name, output }) => [name, output]));
  return { traceBytes, devtools, traceEngine };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { traceBytes, devtools, traceEngine } = await compare();
  const rows = (tool, outputs) => Object.entries(outputs).map(([name, text]) => [tool, name, Buffer.byteLength(text)]);
  const table = [...rows("Chrome DevTools MCP", devtools), ...rows("trace-engine-cli", traceEngine)];
  console.log("| Herramienta | Salida | Bytes |\n|---|---|---|");
  for (const [tool, name, bytes] of table) console.log(`| ${tool} | \`${name}\` | ${bytes} |`);
  const total = (outputs) => Object.values(outputs).reduce((sum, text) => sum + Buffer.byteLength(text), 0);
  console.log(`\nChrome DevTools MCP: ${total(devtools)} bytes. trace-engine-cli: ${total(traceEngine)} bytes.`);
  // The end of the performance_stop_trace summary explains its formats, the same text in every trace
  const summary = devtools.performance_stop_trace;
  const formats = Buffer.byteLength(summary.slice(summary.indexOf("## Details on call tree")));
  console.log(`Explicación fija de formatos en performance_stop_trace: ${formats} de ${Buffer.byteLength(summary)} bytes`);
  console.log(`Trace original: ${traceBytes} bytes`);
}
