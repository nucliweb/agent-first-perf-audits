// A trace of the load of a page with Chrome DevTools MCP: the first call to an MCP server of the
// workshop, and the trace of the LCP subagent. Chrome DevTools MCP writes files only under the
// temporary folder of its client, so the trace goes there first and is copied to file.
import { chmod, copyFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { callTool, connect } from "./client.ts";

// The arguments of the emulate tool of Chrome DevTools MCP, such as its throttling and viewport
export type Emulation = Record<string, unknown>;

export async function recordTrace(url: string, file: string, emulation?: Emulation) {
  // workshop: step 1, record the load of url with Chrome DevTools MCP (test/mcp/trace.test.ts)
  throw new Error("Step 1 of the workshop: record the load of url with Chrome DevTools MCP. Its tests: test/mcp/trace.test.ts");
  // workshop: end
}
