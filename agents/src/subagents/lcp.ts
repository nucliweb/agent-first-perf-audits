// The LCP subagent: the LCP of a page, broken down into its four sub-parts, with how the LCP image
// loads (preload, fetchpriority, loading) and a trace for the Judge.
//   - WebPerf Snippets MCP, run_workflow core-web-vitals: the LCP element and, when it is an image,
//     the audit of its attributes, which the workflow adds by itself.
//   - WebPerf Snippets MCP, run_snippet LCP-Subparts: the breakdown, from the median run.
//   - Chrome DevTools MCP: a trace of the load of the page, with the same throttling.
// It measures, it does not decide: the gate compares the sides and the Judge explains.
import { chmod, copyFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callTool, connect } from "../mcp/client.ts";
import type { Subagent } from "./subagent.ts";

// The throttling of the gate, with the median of 3 runs: steady enough to explain, fast enough to
// run during the workshop
export const CONDITIONS = { cpu: 4, network: "fast-4g", runs: 3 };

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
  const lcp = ok(workflow.results.find((r: SnippetResult) => r.script === "LCP"), "LCP");
  const breakdown = ok(subparts.result, "LCP-Subparts");
  const audit = workflow.results.find((r: SnippetResult) => r.script === "Image-Element-Audit" && r.status === "ok");
  const item = audit?.items?.find((i: { isLCP: boolean }) => i.isLCP);
  const runs = subparts.runs.summary.LCP;
  return {
    url: subparts.url,
    conditions: { cpu: subparts.throttling.cpu, network: subparts.throttling.network, runs: subparts.runs.count },
    lcp: {
      value: breakdown.value,
      unit: breakdown.unit,
      rating: breakdown.rating,
      runs: { median: runs.median, min: runs.min, max: runs.max, agreement: runs.agreement },
    },
    element: { selector: lcp.details.element, type: lcp.details.elementType, url: lcp.details.url ?? null },
    subparts: Object.fromEntries(
      Object.entries(breakdown.details.subParts).map(([phase, part]) => [phase, (part as { value: number }).value]),
    ) as LcpReport["subparts"],
    slowestPhase: breakdown.details.slowestPhase,
    image: item
      ? {
          format: item.format,
          loading: item.loading,
          fetchpriority: item.fetchpriority,
          decoding: item.decoding,
          preloaded: audit.details.lcpCandidate.preloaded,
          issues: item.issues,
        }
      : null,
  };
}

// Chrome DevTools MCP writes files only under the temporary folder of its client, so the trace goes
// there first and is copied to file
async function recordTrace(url: string, file: string) {
  const devtools = await connect("devtools");
  try {
    const temporary = join(await mkdtemp(join(tmpdir(), "lcp-")), "trace.json");
    await callTool(devtools, "emulate", EMULATION);
    await callTool(devtools, "navigate_page", { type: "url", url });
    await callTool(devtools, "performance_start_trace", { reload: true, autoStop: true, filePath: temporary });
    await mkdir(join(file, ".."), { recursive: true });
    await copyFile(temporary, file);
    // The server writes it for its own user only
    await chmod(file, 0o644);
  } finally {
    await devtools.close();
  }
}

export const lcp: Subagent<LcpReport> = {
  name: "lcp",
  async run({ side, url, out }) {
    const webperf = await connect("webperf");
    let report: LcpReport;
    try {
      const options = { url, ...CONDITIONS, detail: "full" };
      const workflow = await callTool(webperf, "run_workflow", { ...options, workflow: "core-web-vitals" });
      const subparts = await callTool(webperf, "run_snippet", { ...options, snippet: "LCP-Subparts" });
      report = lcpReportOf(workflow.structuredContent, subparts.structuredContent);
    } finally {
      await webperf.close();
    }
    // Relative to out, so it reads the same inside and outside the container
    const trace = `traces/lcp-${side}.json`;
    await recordTrace(url, join(out, trace));
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
