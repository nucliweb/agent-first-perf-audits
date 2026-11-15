// The CLS subagent: the layout shifts of each journey of the Navigator, from the load of its page to
// its last step, with the selectors of the nodes that move. WebPerf Snippets MCP runs the snippet
// Layout-Shift-Loading-and-Interaction with the steps the Navigator ran, under the conditions of the
// gate. It measures, it does not decide: the gate compares the sides and the Judge explains.
import type { Client } from "@modelcontextprotocol/client";
import { callTool, connect } from "../mcp/client.ts";
import type { NavigatorReport } from "./navigator.ts";
import { CONDITIONS, type Subagent } from "./subagent.ts";

const SNIPPET = "Layout-Shift-Loading-and-Interaction";

export interface ClsJourney {
  name: string;
  url: string;
  // The median of the runs; agreement is null when every run gives 0
  cls: { value: number; rating: string; runs: { median: number; min: number; max: number; agreement: string | null } };
  // The shifts after an input do not count for CLS
  shifts: { counted: number; excluded: number };
  // The nodes that moved, the most moved first
  elements: Array<{ selector: string; shiftCount: number; totalImpact: number }>;
}

export interface ClsReport {
  conditions: typeof CONDITIONS;
  journeys: ClsJourney[];
}

// The CLS of one journey, from the answer of run_snippet
export function clsJourneyOf(name: string, answer: any): ClsJourney {
  // workshop: step 3, shape the answer of the layout shift snippet into the CLS of a journey (test/subagents/cls.test.ts)
  const result = answer.result;
  if (result?.status !== "ok") throw new Error(`${name}: ${SNIPPET}: ${result?.error ?? result?.message ?? result?.status}`);
  const runs = answer.runs.summary.CLS;
  return {
    name,
    url: answer.url,
    cls: {
      value: result.value,
      rating: result.rating,
      runs: { median: runs.median, min: runs.min, max: runs.max, agreement: runs.agreement ?? null },
    },
    shifts: { counted: result.details.countedShifts, excluded: result.details.excludedShifts },
    elements: result.details.topElements.map(({ selector, shiftCount, totalImpact }: ClsJourney["elements"][number]) => ({
      selector,
      shiftCount,
      totalImpact,
    })),
  };
  // workshop: end
}

async function measure(webperf: Client, origin: string, journey: NavigatorReport["journeys"][number]): Promise<ClsJourney> {
  // workshop: step 3, run the layout shift snippet with the steps of the journey (test/subagents/cls.test.ts)
  const answer = await callTool(webperf, "run_snippet", {
    url: `${origin}${journey.path}`,
    snippet: SNIPPET,
    interactions: journey.steps.map((s) => s.step),
    ...CONDITIONS,
    detail: "full",
  });
  return clsJourneyOf(journey.name, answer.structuredContent);
  // workshop: end
}

export const cls: Subagent<ClsReport> = {
  name: "cls",
  needs: ["navigator"],
  async run({ origin, earlier }) {
    const navigator = earlier.navigator as NavigatorReport | undefined;
    if (!navigator) throw new Error("The CLS subagent needs the journeys of the Navigator");
    const webperf = await connect("webperf");
    try {
      const journeys: ClsJourney[] = [];
      for (const journey of navigator.journeys) journeys.push(await measure(webperf, origin, journey));
      return { conditions: CONDITIONS, journeys };
    } finally {
      await webperf.close();
    }
  },
  summary({ journeys }) {
    // The nodes come from every shift, counted or not, so a node is named only when the CLS counts it
    const line = (j: ClsJourney) => {
      if (j.cls.value > 0 && j.elements.length) return `${j.name} ${j.cls.value} (${j.elements[0].selector})`;
      if (j.shifts.excluded) return `${j.name} ${j.cls.value} (${j.shifts.excluded} shift${j.shifts.excluded > 1 ? "s" : ""} after an input, not counted)`;
      return `${j.name} ${j.cls.value}`;
    };
    return journeys.map(line).join(", ");
  },
};
