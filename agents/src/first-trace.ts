// Step 1 of the workshop: the first call to an MCP server. Chrome DevTools MCP opens the home of the
// baseline shop and records a trace of its load to OUT/first-trace.json, without throttling:
//   docker compose run --rm agents node src/first-trace.ts
// Open the trace in the Performance panel of Chrome DevTools to see what an agent gets.
import { join } from "node:path";
import { recordTrace } from "./mcp/trace.ts";

const url = `${process.env.BASELINE_URL}/`;
const file = join(process.env.OUT || "/out", "first-trace.json");
try {
  if (!process.env.BASELINE_URL) throw new Error("BASELINE_URL is not set: run it inside Docker Compose");
  await recordTrace(url, file);
  console.error(`[first-trace] ${url} -> ${file}`);
} catch (error) {
  console.error(error);
  process.exitCode = 2;
}
