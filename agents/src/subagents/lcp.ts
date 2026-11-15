// The LCP subagent: the LCP of a page, broken down into its four sub-parts, with how the LCP image
// loads (preload, fetchpriority, loading) and a trace for the Judge.
//   - WebPerf Snippets MCP, run_workflow core-web-vitals: the LCP element and, when it is an image,
//     the audit of its attributes, which the workflow adds by itself.
//   - WebPerf Snippets MCP, run_snippet LCP-Subparts: the breakdown, from the median run.
//   - Chrome DevTools MCP: a trace of the load of the page, with the same throttling.
// It measures, it does not decide: the gate compares the sides and the Judge explains.
import { join } from "node:path";
import { callTool, connect } from "../mcp/client.ts";
import { recordTrace } from "../mcp/trace.ts";
import { CONDITIONS, type Subagent } from "./subagent.ts";

// The same throttling in the presets of Chrome DevTools, and the viewport of the traces of the Judge
const EMULATION = { cpuThrottlingRate: 4, networkConditions: "Fast 4G", viewport: "412x823x1,mobile,touch" };

export interface LcpImage {
  format: string;
  loading: string;
  fetchpriority: string;
  decoding: string;
  preloaded: boolean;
  issues: Array<{ code: string; severity: string; message: string }>;
}

export interface LcpReport {
  url: string;
  conditions: { cpu: number; network: string; runs: number };
  lcp: { value: number; unit: string; rating: string; runs: { median: number; min: number; max: number; agreement: string } };
  element: { selector: string; type: string; url: string | null };
  subparts: { ttfb: number; resourceLoadDelay: number; resourceLoadTime: number; elementRenderDelay: number };
  slowestPhase: string;
  image: LcpImage | null;
  trace?: string;
}

// What the MCP server answers, as far as this subagent reads it
interface SnippetResult {
  script: string;
  status: string;
  error?: string;
  message?: string;
  [field: string]: any;
}

const ok = (result: SnippetResult | undefined, name: string): SnippetResult => {
  if (!result) throw new Error(`${name}: no result`);
  if (result.status !== "ok") throw new Error(`${name}: ${result.error ?? result.message ?? result.status}`);
  return result;
};

// The report of one page, from the answers of run_workflow and of run_snippet LCP-Subparts
export function lcpReportOf(workflow: any, subparts: any): LcpReport {
  // workshop: step 2, shape the answers of WebPerf Snippets into the LCP report (test/subagents/lcp.test.ts)
  throw new Error("Step 2 of the workshop: shape the answers of WebPerf Snippets into the LCP report. Its tests: test/subagents/lcp.test.ts");
  // workshop: end
}

// The answers of WebPerf Snippets MCP for the LCP of url: the core-web-vitals workflow, with the
// audit of the LCP image, and the LCP-Subparts snippet, under the conditions of the gate
export async function askWebPerf(url: string): Promise<{ workflow: unknown; subparts: unknown }> {
  // workshop: step 2, call run_workflow and run_snippet of WebPerf Snippets MCP (test/subagents/lcp.test.ts)
  throw new Error("Step 2 of the workshop: call run_workflow and run_snippet of WebPerf Snippets MCP. Its tests: test/subagents/lcp.test.ts");
  // workshop: end
}

export const lcp: Subagent<LcpReport> = {
  name: "lcp",
  async run({ side, origin, out }) {
    // The home: the LCP of the workshop
    const url = `${origin}/`;
    const { workflow, subparts } = await askWebPerf(url);
    const report = lcpReportOf(workflow, subparts);
    // Relative to out, so it reads the same inside and outside the container
    const trace = `traces/lcp-${side}.json`;
    await recordTrace(url, join(out, trace), EMULATION);
    return { ...report, trace };
  },
  summary(report) {
    const slowest = report.subparts[report.slowestPhase as keyof LcpReport["subparts"]];
    const parts = [`LCP ${report.lcp.value} ms (${report.element.selector})`, `slowest phase ${report.slowestPhase}, ${slowest} ms`];
    if (report.image) {
      const { loading, fetchpriority, preloaded } = report.image;
      parts.push(`image loading=${loading}, fetchpriority=${fetchpriority}, ${preloaded ? "preloaded" : "not preloaded"}`);
    }
    return parts.join("; ");
  },
};
