// The contract of a subagent: it measures one shop, baseline or candidate, and returns what it found
// as JSON. It gets what the earlier subagents found on the same side, such as the journeys of the
// Navigator, and writes its files, such as traces, under out.
export type Side = "baseline" | "candidate";

// The throttling of the gate, with the median of 3 runs: steady enough to explain, fast enough to
// run during the workshop. The subagents measure, they do not decide: the gate compares the sides.
export const CONDITIONS = { cpu: 4, network: "fast-4g", runs: 3 };

export interface Page {
  side: Side;
  // The origin of the shop, without a trailing slash: http://shop-baseline:3000
  origin: string;
  out: string;
  // By subagent name
  earlier: Record<string, unknown>;
}

export interface Subagent<Result> {
  name: string;
  // The subagents whose results it reads from earlier, which the orchestrator runs before it
  needs?: string[];
  run(page: Page): Promise<Result>;
  // One line for the log of the orchestrator
  summary(result: Result): string;
}
