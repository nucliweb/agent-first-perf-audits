// The contract of a subagent: it measures one page of one side, baseline or candidate, and returns
// what it found as JSON. It writes its files, such as traces, under out.
export type Side = "baseline" | "candidate";

export interface Page {
  side: Side;
  url: string;
  out: string;
}

export interface Subagent<Result> {
  name: string;
  run(page: Page): Promise<Result>;
  // One line for the log of the orchestrator
  summary(result: Result): string;
}
