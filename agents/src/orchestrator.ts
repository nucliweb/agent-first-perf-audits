// The orchestrator: runs each subagent on the baseline shop and on the candidate shop and writes
// what each one finds to OUT/agents, as <subagent>-<side>.json. Each subagent gets what the earlier
// ones found on the same side, such as the journeys of the Navigator. One measurement at a time, so
// two Chromiums never share the CPU. Inside Docker Compose, every subagent, or some by name with
// the ones they need:
//   CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts
//   CANDIDATE=pr-cls-promo-banner docker compose run --rm agents node src/orchestrator.ts cls
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cls } from "./subagents/cls.ts";
import { lcp } from "./subagents/lcp.ts";
import { navigator } from "./subagents/navigator.ts";
import type { Side, Subagent } from "./subagents/subagent.ts";

// The subagents, in the order they run: the Navigator first, so the others measure journeys that complete
const SUBAGENTS: Subagent<any>[] = [navigator, lcp, cls];

const SIDES: Side[] = ["baseline", "candidate"];

// The subagents with these names and the ones they need, in the order of all; every one without names
export function pick(names: string[], all: Subagent<any>[]): Subagent<any>[] {
  if (!names.length) return all;
  const wanted = new Set<string>();
  const add = (name: string) => {
    const subagent = all.find((s) => s.name === name);
    if (!subagent) throw new Error(`No subagent ${name}: ${all.map((s) => s.name).join(", ")}`);
    for (const need of subagent.needs ?? []) add(need);
    wanted.add(name);
  };
  names.forEach(add);
  return all.filter((s) => wanted.has(s.name));
}

export async function orchestrate(
  subagents: Subagent<any>[],
  // The origin of each shop
  origins: Record<Side, string>,
  out: string,
  log: (line: string) => void,
): Promise<Record<string, Record<Side, unknown>>> {
  await mkdir(out, { recursive: true });
  const results: Record<string, Record<Side, unknown>> = {};
  const earlier: Record<Side, Record<string, unknown>> = { baseline: {}, candidate: {} };
  for (const subagent of subagents) {
    const found: Partial<Record<Side, unknown>> = {};
    for (const side of SIDES) {
      let result;
      try {
        result = await subagent.run({ side, origin: origins[side], out, earlier: { ...earlier[side] } });
      } catch (error) {
        throw new Error(`${subagent.name}, ${side}: ${(error as Error).message}`, { cause: error });
      }
      await writeFile(join(out, `${subagent.name}-${side}.json`), JSON.stringify(result, null, 2) + "\n");
      found[side] = result;
      earlier[side][subagent.name] = result;
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
    const origins = { baseline: env("BASELINE_URL"), candidate: env("CANDIDATE_URL") };
    const out = join(process.env.OUT || "/out", "agents");
    await orchestrate(pick(process.argv.slice(2), SUBAGENTS), origins, out, log);
    log(`done: ${out}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 2;
  }
}
