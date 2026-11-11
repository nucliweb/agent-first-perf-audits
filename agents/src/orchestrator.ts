// The orchestrator: runs each subagent on the baseline shop and on the candidate shop and writes
// what each one finds to OUT/agents, as <subagent>-<side>.json. One measurement at a time, so two
// Chromiums never share the CPU. Inside Docker Compose:
//   CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { lcp } from "./subagents/lcp.ts";
import type { Side, Subagent } from "./subagents/subagent.ts";

// The subagents, in the order they run
const SUBAGENTS: Subagent<any>[] = [lcp];

const SIDES: Side[] = ["baseline", "candidate"];

export async function orchestrate(
  subagents: Subagent<any>[],
  pages: Record<Side, string>,
  out: string,
  log: (line: string) => void,
): Promise<Record<string, Record<Side, unknown>>> {
  await mkdir(out, { recursive: true });
  const results: Record<string, Record<Side, unknown>> = {};
  for (const subagent of subagents) {
    const found: Partial<Record<Side, unknown>> = {};
    for (const side of SIDES) {
      let result;
      try {
        result = await subagent.run({ side, url: pages[side], out });
      } catch (error) {
        throw new Error(`${subagent.name}, ${side}: ${(error as Error).message}`, { cause: error });
      }
      await writeFile(join(out, `${subagent.name}-${side}.json`), JSON.stringify(result, null, 2) + "\n");
      found[side] = result;
      log(`${subagent.name}, ${side}: ${subagent.summary(result)}`);
    }
    results[subagent.name] = found as Record<Side, unknown>;
  }
  return results;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run the orchestrator inside Docker Compose`);
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const log = (line: string) => console.error(`[orchestrator] ${line}`);
  try {
    // The home of each shop: the page of the LCP of the workshop
    const pages = { baseline: `${env("BASELINE_URL")}/`, candidate: `${env("CANDIDATE_URL")}/` };
    const out = join(process.env.OUT || "/out", "agents");
    await orchestrate(SUBAGENTS, pages, out, log);
    log(`done: ${out}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 2;
  }
}
