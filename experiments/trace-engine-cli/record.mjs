// Graba un trace de Chromium de fixture/index.html: carga, espera y un click en el botón.
// Uso: node record.mjs [salida]   (por defecto out/trace.json)
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// Las mismas categorías que graba el panel Performance de DevTools
const CATEGORIES = [
  "-*",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-devtools.timeline.stack",
  "disabled-by-default-devtools.timeline.invalidationTracking",
  "disabled-by-default-v8.cpu_profiler",
  "disabled-by-default-lighthouse",
  "v8.execute",
  "v8",
  "blink.user_timing",
  "blink.console",
  "loading",
  "latencyInfo",
  "toplevel",
  "rail",
  "__metadata",
];

export const CPU_THROTTLING = 4;

export async function record(output = resolve(HERE, "out/trace.json")) {
  const html = await readFile(resolve(HERE, "fixture/index.html"));
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${server.address().port}/`;

  await mkdir(dirname(output), { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 412, height: 823 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLING });

    await browser.startTracing(page, { path: output, screenshots: false, categories: CATEGORIES });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1500); // el banner del CLS llega a los 600 ms
    await page.click("#buy");
    await page.waitForTimeout(800); // deja que se pinte el siguiente frame del INP
    await browser.stopTracing();
  } finally {
    await browser.close();
    server.close();
  }
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = await record(process.argv[2] && resolve(process.argv[2]));
  console.log(`Trace guardado en ${output}`);
}
