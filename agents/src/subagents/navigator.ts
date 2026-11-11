// The Navigator: runs the journeys of the workshop on a shop, step by step, with the throttling of the
// gate, through WebPerf Snippets MCP (open_page, interact, read_results). It tells the URL each step
// leaves the page on and the errors of the page, so the later subagents measure journeys that
// complete. A step whose element never appears stops it: a journey that breaks gives numbers that
// mean nothing.
// The journeys are JSON files in agents/journeys, one per page, with the steps of --interact-script
// of the WebPerf Snippets CLI; the gate measures add to cart with the same file.
import { readFileSync } from "node:fs";
import type { Client } from "@modelcontextprotocol/client";
import { callTool, connect } from "../mcp/client.ts";
import type { Subagent } from "./subagent.ts";

export type Step =
  | { action: "click" | "hover"; selector: string }
  | { action: "type"; selector: string; text: string }
  | { action: "scroll"; y?: number }
  | { action: "wait"; ms: number };

export interface Journey {
  name: string;
  path: string;
  interactions: Step[];
}

// In the order a person goes through the shop
const NAMES = ["home", "shop", "product", "add-to-cart"];

export const JOURNEYS: Journey[] = NAMES.map((name) =>
  JSON.parse(readFileSync(new URL(`../../journeys/${name}.json`, import.meta.url), "utf8")),
);

// The throttling of the gate, so a step that waits for an element waits as long as in the measurements
const CONDITIONS = { cpu: 4, network: "fast-4g" };

export interface JourneyRun {
  name: string;
  path: string;
  url: string;
  steps: Array<{ step: Step; url: string }>;
  pageErrors: string[];
}

export interface NavigatorReport {
  journeys: JourneyRun[];
}

const described = (step: Step) =>
  "selector" in step ? `${step.action} ${step.selector}` : step.action === "wait" ? `wait ${step.ms} ms` : `scroll ${step.y ?? 300}`;

async function runJourney(webperf: Client, origin: string, journey: Journey): Promise<JourneyRun> {
  // open_page needs a tracking snippet; INP records nothing until a click and costs nothing
  const opened = await callTool(webperf, "open_page", { url: `${origin}${journey.path}`, track: ["INP"], ...CONDITIONS });
  const { sessionId, url } = opened.structuredContent as { sessionId: string; url: string };
  try {
    // One step per call, so a step that breaks is known by its number
    const steps: JourneyRun["steps"] = [];
    for (const [index, step] of journey.interactions.entries()) {
      try {
        const done = await callTool(webperf, "interact", { sessionId, steps: [step] });
        steps.push({ step, url: (done.structuredContent as { url: string }).url });
      } catch (error) {
        throw new Error(`journey ${journey.name}, step ${index + 1} (${described(step)}): ${(error as Error).message}`);
      }
    }
    const read = await callTool(webperf, "read_results", { sessionId, detail: "summary" });
    const { pageErrors = [] } = read.structuredContent as { pageErrors?: string[] };
    return { name: journey.name, path: journey.path, url, steps, pageErrors };
  } finally {
    await callTool(webperf, "close_page", { sessionId }).catch(() => {});
  }
}

// Runs the journeys one after the other on the shop at origin
export async function runJourneys(origin: string, journeys: Journey[]): Promise<JourneyRun[]> {
  const webperf = await connect("webperf");
  try {
    const runs: JourneyRun[] = [];
    for (const journey of journeys) runs.push(await runJourney(webperf, origin, journey));
    return runs;
  } finally {
    await webperf.close();
  }
}

export const navigator: Subagent<NavigatorReport> = {
  name: "navigator",
  async run({ origin }) {
    return { journeys: await runJourneys(origin, JOURNEYS) };
  },
  summary({ journeys }) {
    const steps = journeys.map((j) => `${j.name} ${j.steps.length} steps`).join(", ");
    const errors = journeys.filter((j) => j.pageErrors.length).map((j) => `${j.name}: ${j.pageErrors.join(" | ")}`);
    return `${steps}; ${errors.length ? `page errors in ${errors.join("; ")}` : "no page errors"}`;
  },
};
