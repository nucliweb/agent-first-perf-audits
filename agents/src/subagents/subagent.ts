// The contract of a subagent: it measures one shop, baseline or candidate, and returns what it found
// as JSON. It gets what the earlier subagents found on the same side, such as the journeys of the
// Navigator, and writes its files, such as traces, under out.
export type Side = "baseline" | "candidate";

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
  run(page: Page): Promise<Result>;
  // One line for the log of the orchestrator
  summary(result: Result): string;
}
