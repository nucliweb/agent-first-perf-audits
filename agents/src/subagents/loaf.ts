// The LoAF/INP subagent: what blocks the main thread on each journey of the Navigator.
//   - WebPerf Snippets MCP, run_workflow interaction with the steps the Navigator ran: the INP of the
//     click with its three phases, the long animation frames with the scripts that make them, and
//     the long tasks, under the conditions of the gate and the median of 3 runs.
//   - For a journey with a click, a trace of the click with the same code as the Judge (Playwright
//     under the throttling of the gate), summarized by trace-engine-cli: the snippets name the
//     script and its invoker, the trace names the function.
// It measures, it does not decide: the gate compares the sides and the Judge explains.
import { join } from "node:path";
import type { Client } from "@modelcontextprotocol/client";
import { chromium, type Browser } from "playwright";
import { TASKS } from "../judge/gate.ts";
import { record, summarize } from "../judge/traces.ts";
import { callTool, connect } from "../mcp/client.ts";
import type { NavigatorReport } from "./navigator.ts";
import { CONDITIONS, type Subagent } from "./subagent.ts";

const TRACE_ENGINE = join(import.meta.dirname, "../../node_modules/.bin/trace-engine-cli");
const SUMMARIES = { interactions: ["interactions"], tasks: TASKS };

export interface LoafJourney {
  name: string;
  url: string;
  // null on a journey without a click or a key press
  inp: {
    value: number;
    rating: string;
    runs: { median: number; min: number; max: number; agreement: string | null };
    event: string;
    phases: { inputDelay: number; processingTime: number; presentationDelay: number };
  } | null;
  longFrames: {
    count: number;
    withBlockingTime: number;
    totalBlockingTimeMs: number;
    worstBlockingMs: number;
    topScripts: Array<{ invoker: string; source: string; totalDurationMs: number; count: number }>;
  };
  longTasks: { totalBlockingTimeMs: number; worstTaskMs: number };
  // The trace of the click, relative to out, and what trace-engine-cli says of it
  trace: { file: string; summaries: Record<string, string> } | null;
}

export interface LoafReport {
  conditions: typeof CONDITIONS;
  journeys: LoafJourney[];
}

// One journey, from the answer of run_workflow interaction, without the trace
export function loafJourneyOf(name: string, answer: any): LoafJourney {
  const step = (id: string) => {
    const result = answer.results.find((r: { id: string }) => r.id === id);
    if (result?.status !== "ok" && !(id === "INP" && result?.status === "skipped")) {
      throw new Error(`${name}: ${id}: ${result?.error ?? result?.message ?? result?.status ?? "no result"}`);
    }
    return result;
  };
  const inp = step("INP");
  const frames = step("long-frames").details;
  const tasks = step("long-tasks").details;
  const runs = answer.runs.summary.INP;
  return {
    name,
    url: answer.url,
    inp:
      inp.status === "ok"
        ? {
            value: inp.value,
            rating: inp.rating,
            runs: { median: runs.median, min: runs.min, max: runs.max, agreement: runs.agreement ?? null },
            event: inp.details.worstEvent,
            phases: inp.details.phases,
          }
        : null,
    longFrames: {
      count: frames.totalLoAFs,
      withBlockingTime: frames.withBlockingTime,
      totalBlockingTimeMs: frames.totalBlockingTimeMs,
      worstBlockingMs: frames.worstBlockingMs,
      topScripts: frames.topScripts,
    },
    longTasks: { totalBlockingTimeMs: tasks.totalBlockingTimeMs, worstTaskMs: tasks.worstTaskMs },
    trace: null,
  };
}

type JourneyRun = NavigatorReport["journeys"][number];

async function measure(webperf: Client, origin: string, journey: JourneyRun) {
  const answer = await callTool(webperf, "run_workflow", {
    url: `${origin}${journey.path}`,
    workflow: "interaction",
    interactions: journey.steps.map((s) => s.step),
    ...CONDITIONS,
    detail: "full",
  });
  return loafJourneyOf(journey.name, answer.structuredContent);
}

// The trace of the first click of the journey, relative to out
async function traceOf(browser: Browser, origin: string, journey: JourneyRun, side: string, out: string) {
  const click = journey.steps.map((s) => s.step).find((step) => step.action === "click");
  if (!click || !("selector" in click)) return null;
  const file = `traces/loaf-${journey.name}-${side}.json`;
  await record(browser, `${origin}${journey.path}`, { name: journey.name, click: click.selector, summaries: SUMMARIES }, join(out, file));
  return { file, summaries: summarize(TRACE_ENGINE, join(out, file), SUMMARIES) };
}

export const loaf: Subagent<LoafReport> = {
  name: "loaf",
  needs: ["navigator"],
  async run({ side, origin, out, earlier }) {
    const navigator = earlier.navigator as NavigatorReport | undefined;
    if (!navigator) throw new Error("The LoAF/INP subagent needs the journeys of the Navigator");

    const journeys: LoafJourney[] = [];
    const webperf = await connect("webperf");
    try {
      for (const journey of navigator.journeys) journeys.push(await measure(webperf, origin, journey));
    } finally {
      await webperf.close();
    }

    // After the measurements, so two Chromiums never share the CPU
    const browser = await chromium.launch({ channel: "chromium" });
    try {
      for (const [index, journey] of navigator.journeys.entries()) {
        journeys[index].trace = await traceOf(browser, origin, journey, side, out);
      }
    } finally {
      await browser.close();
    }
    return { conditions: CONDITIONS, journeys };
  },
  summary({ journeys }) {
    const inps = journeys.map((j) => (j.inp ? `${j.name} INP ${j.inp.value} ms` : `${j.name} no click`)).join(", ");
    const worst = journeys.filter((j) => j.inp).sort((a, b) => b.inp!.value - a.inp!.value)[0];
    if (!worst) return inps;
    const script = worst.longFrames.topScripts[0];
    const by = script ? `, top script ${script.invoker} (${script.source}, ${script.totalDurationMs} ms)` : "";
    return `${inps}; slowest ${worst.name}: processing ${worst.inp!.phases.processingTime} ms${by}`;
  },
};
