// The traces of the Judge: one per scenario and side, recorded with the conditions of the gate,
// and summarized by trace-engine-cli for the attribution. The callers pass their own Playwright
// browser and trace-engine-cli, so this module has no dependencies of its own at run time.
import { execFileSync } from "node:child_process";
import type { Browser } from "playwright";
import { normalizeSummary } from "./normalize.ts";
import type { GateScenario } from "./gate.ts";

// The same conditions as the gate: 4x CPU and the fast-4g preset of WebPerf Snippets
const CPU_RATE = 4;
const FAST_4G = { offline: false, latency: 60 * 2.75, downloadThroughput: ((9 * 1e6) / 8) * 0.9, uploadThroughput: ((1.5 * 1e6) / 8) * 0.9 };

const CATEGORIES = [
  "-*", "devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-devtools.timeline.stack", "disabled-by-default-devtools.timeline.invalidationTracking",
  "disabled-by-default-v8.cpu_profiler", "disabled-by-default-lighthouse", "v8.execute", "v8", "blink.user_timing",
  "blink.console", "loading", "latencyInfo", "toplevel", "rail", "__metadata",
];

export async function record(browser: Browser, url: string, scenario: GateScenario, file: string) {
  const context = await browser.newContext({ viewport: { width: 412, height: 823 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", FAST_4G);
  if (scenario.click) {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1000);
    await browser.startTracing(page, { path: file, categories: CATEGORIES });
    await page.click(scenario.click);
    await page.waitForTimeout(800);
  } else {
    await browser.startTracing(page, { path: file, categories: CATEGORIES });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1500); // the promo banner arrives after 800 ms
  }
  await browser.stopTracing();
  await context.close();
}

// The summaries of a trace with the trace-engine-cli at bin. names replaces the origins of the trace
// with the names of the services, so the baseline and the candidate read the same everywhere.
export function summarize(bin: string, file: string, summaries: Record<string, string[]>, names: [string, string][] = []) {
  const out: Record<string, string> = {};
  for (const [name, args] of Object.entries(summaries)) {
    let text = execFileSync(bin, [...args, file], { encoding: "utf8" }).trim();
    for (const [origin, service] of names) text = text.replaceAll(origin, service);
    out[name] = normalizeSummary(text);
  }
  return out;
}
