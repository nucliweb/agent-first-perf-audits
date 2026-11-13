# Experiment: trace-engine-cli

English · [Castellano](README.es.md) · [Català](README.ca.md)

Reproduces the data of the "Not everything has to be an MCP" section of the Learnings page.

## What it does

1. Serves [`fixture/index.html`](fixture/index.html) locally. The page has two regressions:
   - a banner that arrives 600 ms after the load without reserved space (CLS),
   - a click handler, `addToCart`, that blocks the main thread for 180 ms (INP).
2. Records a Chromium trace with Playwright and 4x CPU throttling: load, 1.5 s wait, click and 800 ms wait.
3. Runs the four [trace-engine-cli](https://github.com/ChromeDevTools/trace-engine-cli) commands that the workshop Judge uses and measures the size of each summary.
4. Records another trace of the same journey with [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) and compares what an agent receives from each tool for that same file: the summary of `performance_stop_trace` and each insight of `performance_analyze_insight`, against the four trace-engine-cli summaries.

## Requirements

- Node 22 or later.
- The Chromium of Playwright 1.63.0. It is already installed inside the workshop container. Outside it: `npx playwright install chromium`.

## Usage

```bash
npm install
npm test            # records a trace and verifies the conclusions
npm run record      # records out/trace.json
npm run summarize   # shows the summaries and the size table
npm run compare     # compares Chrome DevTools MCP and trace-engine-cli on the same trace
```

The tests run one after the other (`--test-concurrency=1`): two Chromium instances at once share the CPU and contaminate the measurements.

`summarize` takes another trace as an argument, for example one exported from the Performance panel of DevTools:

```bash
npm run summarize -- ~/Downloads/Trace-20261109.json.gz
```

## What the test checks

The milliseconds change from one machine to another, so [`summary.test.mjs`](summary.test.mjs) uses thresholds:

| Claim | Threshold |
|---|---|
| Each summary is compact | Less than 2 KB |
| The four summaries shrink the trace | More than 99 % |
| `overview` detects the CLS | CLS of at least 0.1 |
| `interactions` attributes the INP to the handler | INP above 150 ms, with processing larger than the input delay and than the presentation delay |
| `tasks` names the function | `addToCart` with at least 150 ms of self time, its URL and its line |
| `shifts` gives no selectors | The culprit node shows up as `Node #<id>` |

The last assertion documents a limitation: the selectors come from WebPerf Snippets. If a future version of trace-engine-cli adds them, the test fails and the Learnings page needs an update.

## What the comparison checks

[`compare.test.mjs`](compare.test.mjs) also uses thresholds:

| Claim | Threshold |
|---|---|
| Chrome DevTools MCP gives the agent more text | More than three times the bytes of trace-engine-cli |
| Both detect the CLS | CLS of at least 0.1 in both |
| Both break down the INP | INP above 150 ms, with processing larger than the input delay and than the presentation delay |
| Only trace-engine-cli names the function | `addToCart` appears in `tasks` and in no output of Chrome DevTools MCP |

The last assertion documents another limitation, this time of Chrome DevTools MCP. If a future version attributes the INP to the function, the test fails and the decision to use trace-engine-cli needs a review.

## Versions

`trace-engine-cli` 0.2.0, `chrome-devtools-mcp` 1.12.0, `@modelcontextprotocol/client` 2.4.0 and `playwright` 1.63.0, pinned in [`package.json`](package.json).
