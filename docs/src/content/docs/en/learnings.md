---
title: Learnings
description: Design decisions we made while building the workshop, and why.
sidebar:
  order: 90
---

Decisions we made while building this flow. Each one includes the context, the decision and the data behind it, so you can apply it, or discard it, on your platform.

## Not everything has to be an MCP

### Context

To attribute a regression to a specific function, the Judge needs to analyze the Chromium trace of each run. We use [trace-engine-cli](https://github.com/ChromeDevTools/trace-engine-cli), a CLI from the Chrome DevTools team built on the Trace Engine of the Performance panel. It turns a trace into a compact summary in [TOON](https://github.com/toon-format/toon) format, designed for the context of an LLM.

trace-engine-cli has no MCP server. We had two options: wrap it in our own MCP server or call it directly as a CLI from the orchestrator.

### Decision

We call it directly as a CLI.

- **Not everything has to be solved with MCP.** MCP adds value when the model has to discover tools and decide which one to use. In this flow, the orchestrator already knows which command to run and when.
- **If a CLI is already optimal, we use the CLI.** trace-engine-cli already produces compact, stable output designed for LLMs. An MCP on top adds no information, only one more layer.
- **Trying something new does not require overengineering.** The tool is at version 0.2.0. Calling it as a CLI lets us try it and replace it without touching the rest of the system.

### Data

A 1.4 MB trace, recorded with Playwright and 4x CPU throttling, of a page with a banner that causes a layout shift and a click handler that blocks for 180 ms:

| Command | Output | What it found |
|---|---|---|
| `overview` | 566 bytes | CLS 0.148 and INP 199 ms |
| `interactions` | 191 bytes | INP: input delay 3 ms, processing 186 ms, presentation 9 ms |
| `tasks --tree bottom-up --top 5` | 428 bytes | `addToCart`, 182 ms of self time, line 21 |
| `shifts --events` | 829 bytes | Cluster of 0.148 with one culprit node |

The four summaries add up to 2,014 bytes, 99.85% less than the original trace: they fit easily in the context of a 1.7B model.

### What about the Chrome DevTools MCP insights?

Chrome DevTools MCP already provides the insights of the Performance panel. Before adding one more tool, we checked whether they were enough. We recorded the same journey with Chrome DevTools MCP and ran that same trace through trace-engine-cli:

| | Chrome DevTools MCP | trace-engine-cli |
|---|---|---|
| Text the agent receives | About 11,400 bytes: the `performance_stop_trace` summary and three insights | About 2,000 bytes: the four commands |
| LCP, CLS and INP | Yes | Yes |
| INP breakdown | Yes | Yes |
| Function that causes the INP | No | `addToCart`, with its URL and its line |

About 4,500 bytes of the `performance_stop_trace` summary are an explanation of its formats that repeats unchanged in every trace. And no insight names the handler function: the INP insight gives the breakdown, but not which code causes it. The Judge needs exactly that attribution to relate the regression to the branch diff.

That is why each tool does one thing: Chrome DevTools MCP captures the trace and trace-engine-cli summarizes it.

### Check it

The experiment is in [`experiments/trace-engine-cli`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/trace-engine-cli). Record a new trace on your machine and check each claim on this page:

```bash
cd experiments/trace-engine-cli
npm install
npm test            # records a trace and verifies the conclusions
npm run record      # records out/trace.json
npm run summarize   # shows the summaries and the size table
npm run compare     # compares Chrome DevTools MCP and trace-engine-cli on the same trace
```

Milliseconds change from one machine to another, so the test checks thresholds rather than exact values: each summary takes less than 2 KB, the four together reduce the trace by more than 99%, the CLS is at least 0.1, processing dominates the INP and `addToCart` appears with at least 150 ms of self time. In the comparison, Chrome DevTools MCP gives more than three times as much text and `addToCart` does not appear in any of its outputs.

### What it does not do

- **It does not compare two traces.** `diff` compares two time windows within the same trace. The comparison between baseline and candidate is done by the WebPerf Snippets CLI.
- **It does not give selectors for DOM nodes.** The CLS culprit nodes appear as `Node #9` and the INP target as `null`. The selectors come from WebPerf Snippets.
- **It returns absolute times.** Input ranges are relative to the start of the trace, but output times are not. The orchestrator normalizes them before passing them to the LLM.

### How to apply it to your platform

Before wrapping a tool in an MCP server, ask yourself:

1. Does the model have to decide when to use it, or does the code decide?
2. Is its output already compact and stable?
3. Is it a mature tool, or are you trying it out?

If the code decides, the output already works and the tool is new, a direct CLI call is enough.

## Chrome DevTools MCP outside the editor

### Context

[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) is designed for an agent in your editor: an interactive session, a browser that several agents can share and a client that tells the server which folders it can write to.

In the workshop, the subagents use it inside a container without network access. Each subagent starts its own server over stdio, with a single page, and the traces have to end up in a folder that the Judge reads later.

### What fails with the defaults

- **Every page tool requires `pageId`.** It lets several agents share a browser without stepping on each other. Without it, `navigate_page` returns a validation error.
- **Files can only be written to the server's temporary directory.** This is the restriction that applies when the client does not declare roots, a capability that the 2026-07-28 version of the protocol marks as deprecated. A trace saved to another folder returns `Access denied`.
- **That temporary directory may not be the client's.** The stdio client of the MCP SDK starts the server with only `HOME`, `LOGNAME`, `PATH`, `SHELL`, `TERM` and `USER`. On macOS, `TMPDIR` points to `/var/folders/...`; the server does not receive it and uses `/tmp`. A path that the orchestrator creates with `os.tmpdir()` is left outside. On Linux both use `/tmp` and you do not notice.
- **It does not receive `PLAYWRIGHT_BROWSERS_PATH` either.** The same happens to WebPerf Snippets MCP, which launches the Chromium of Playwright: if you install the browser in a custom path, the server looks for it in the default path and does not find it.
- **Chromium does not start in the container.** Without extra privileges it has no usable sandbox and aborts with `No usable sandbox!`.

### Decision

We start the server with these flags:

| Flag | What for |
|---|---|
| `--no-page-id-routing` | Each subagent has its own browser, so the tools work without `pageId` |
| `--chromeArg=--no-sandbox` | Only in the container, which already isolates the process |
| `--headless`, `--isolated` and `--executablePath` | No window, a temporary profile and the Playwright Chromium, the same one WebPerf Snippets uses |
| `--usageStatistics=false` and `--performanceCrux=false` | The gate runs without network access |

The traces need no other flag. The subagent records each one in the temporary directory, which in the container is `/tmp` for both the client and the server, and copies it to the output folder. `--workspace=<folder>` would allow saving it there directly, adding that folder to the server's temporary directory, and would save the copy. We discarded `--allow-unrestricted-paths`: it opens the whole file system and the server itself marks it as deprecated in favor of `--workspace=/`.

The Chromium of Playwright is installed in the default path, `~/.cache/ms-playwright`, the only one where both servers find it.

### Check it

The experiment is in [`experiments/chrome-devtools-mcp`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/chrome-devtools-mcp). Each test starts a server with different flags and checks one of these behaviors; another one starts Node with the environment that the stdio client passes to the server and checks where Playwright looks for the browser:

```bash
cd experiments/chrome-devtools-mcp
npm install
npm test
```

On macOS all eight tests run. On Linux the `TMPDIR` test is skipped, because the client and the server share the temporary directory.

### How to apply it to your platform

1. An MCP designed for the editor comes with defaults designed for the editor. Review its flags before putting it in a pipeline.
2. Do not assume the server sees your environment. With stdio, pass it what it needs as flags or as explicit variables.
3. Write a test for each default you change. If a new version changes it, you find out before your pipeline does.

## A single Chromium for both MCPs

### Context

The `agents` container has two MCP servers that open a browser: Chrome DevTools MCP, which records the traces of the LCP subagent, and WebPerf Snippets MCP, which measures for the gate and for the other subagents. By default each one looks for its own: Chrome DevTools MCP, the Google Chrome installed on the system; WebPerf Snippets, the Chromium of Playwright.

The image is published for amd64 and arm64, and arm64 is the one that runs on a Mac with Apple Silicon. When we designed it, Google did not publish Chrome for Linux ARM64, so the arm64 image could not have the browser that Chrome DevTools MCP expects.

### Decision

A single browser in the image: the full Chromium of Playwright, without the headless shell.

- **Chrome DevTools MCP starts it by its path**, with `--executablePath` and the path given by Playwright's `chromium.executablePath()`.
- **WebPerf Snippets launches it when it is installed** instead of the headless shell, and records in the conditions of the measurement which binary it used.
- **Both measure with the same binary**, on amd64 and on arm64, and its version is set by the Playwright version. A Chrome DevTools MCP trace and a WebPerf Snippets measurement come from the same browser.

Today Google does publish stable Chrome for Linux ARM64. Even so, the decision stands: with two browsers, each server would measure with a different one, and the image would be larger.

### Check it

Google's apt repository lists its packages by architecture, and Chrome for Testing lists its platforms:

```bash
curl -s https://dl.google.com/linux/chrome/deb/dists/stable/main/binary-arm64/Packages | grep -A1 "^Package: google-chrome-stable"
curl -s https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json | grep -o '"platform":"linux-arm64"' | head -1
```

The installation is in [`docker/agents/Dockerfile`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/docker/agents/Dockerfile) and the server flags, in [`agents/src/mcp/client.ts`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/agents/src/mcp/client.ts).

### How to apply it to your platform

1. If several tools open a browser, decide which one it is and pass it to all of them. What each one brings by default does not have to match.
2. Check on both architectures that the browser exists before choosing it: what you have on your machine is not what a Mac with Apple Silicon has inside a container.
3. Review the decision when its reason changes, but change it only if the new reason holds up too.

## The LLM explains, the rules decide

### Context

The Judge has to say why a branch fails, not only that it fails. For that it has a local model in Ollama, on CPU, which must fit on a 16 GB laptop alongside Chromium and the rest of the lab. We tried four candidates from 1 to 3B (`llama3.2:3b`, `qwen3:1.7b`, `qwen2.5-coder:1.5b` and `gemma3:1b`) with the real input of each regression branch: the gate verdict, the diff and the trace-engine-cli summaries of the baseline and the candidate.

The first version asked the model for everything: repeat the verdict, choose the metric that regresses the most and explain the cause. Each time something failed, we moved one more part of the work to the rules.

### What we tried

| Stage | What the rules do before the LLM | `llama3.2:3b` names the cause: first measurement | With the current fixtures, cold |
|---|---|---|---|
| `llm` | Decide the verdict and which metric to explain | 9 of 15 | 3 of 5 |
| `suspects` | Also compare the traces and give the model the suspects: new or growing functions and scripts | 9 of 15 | 3 of 5 |
| `rules` | Also do not ask the model if nothing regresses, and relate each suspect to the diff line that adds it | 14 of 15 | 5 of 5 |
| `quotes` | Also escape the double quotes of the diff and of the related line | 15 of 15, cold | 5 of 5 |

The first measurement was made warm, with three repetitions of each case, on the fixtures from November 10. The current fixtures have new traces and the gate from another run, and cold, one repetition is enough, because they all give the same answer.

Along the way:

- **The JSON is requested with the schema as structured output.** With the JSON described only in the prompt, `qwen2.5-coder:1.5b` always wrapped it in a code block and it could not be parsed. With the schema, all four models return valid JSON.
- **The rule decides the metric.** It is what the models got wrong most often. Also, `pr/loaf-cart-handler` regresses two metrics for two causes: the LCP because of a synchronous script, `ab.js`, and the INP because of a heavy handler, `recommendFor`. A single explanation cannot cover both, so the Judge asks for one per metric.
- **Metrics are sorted by how many times they exceed their threshold, not by percentage.** The CLS of the baseline is 0, so its percentage does not exist.
- **Small models ignore hints.** With `recommendFor` listed as a suspect (80 ms in the candidate, 0 in the baseline), `llama3.2:3b` kept blaming `ab.js` for the INP. And in the refactor, with the rule saying that nothing had regressed, it made up an LCP regression.
- **What worked was having the rule find the cause.** `recommendFor` and `ab.js` appear literally in the added lines of the diff. When the rule gives the model the suspect and its line, the model only has to write.

### Decision

- **The workshop model is `llama3.2:3b`.** Ollama allocates 3.3 GB to it with a context of 8,192 tokens.
- **The rules decide the verdict, the metric and, when they can, the cause.**
- **The LLM explains it with the verdict schema.** When nothing regresses, the Judge answers without asking it.

The last failure was not a reasoning failure. On the hero branch, the model copies `loading="lazy"` from the diff into its answer without escaping the quote, and in the JSON constrained by the schema that quote closes the string: the sentence stops at `loading=`. The rules cannot give it the cause, because removing the preload does not add any task to the trace, so the model looks for it in the diff and copies the code.

Also, the failure did not always show up. In the `rules` stage, only one of the three repetitions was cut off, with the same input, temperature at 0 and a fixed seed. The difference was the Ollama prompt cache: the first call arrives with the model freshly loaded, and the following ones reuse the system prompt of the previous one, which is the same. Unloading the model before each call makes the three repetitions of each case identical, and the hero sentence is cut off in all three: 12 of 15.

With the diff quotes escaped in the input (`loading=\"lazy\"`), the model copies a valid form inside a JSON string, and cold it names the cause in 15 of 15. Escaping in the input does not depend on the model following one more instruction in the prompt.

With the current fixtures the sentence is no longer cut off without escaping, but it is not good either: it says that "the `loading` attribute was added to the `fetchPriority` property", which would now be `'lazy'` instead of `'high'`. The scoring accepts it, because it names `lazy`. With the quotes escaped, the sentence names the `loading="lazy"` attribute of the `img`.

- **The Judge escapes the double quotes of the code it puts in the prompt.** The handoff carries the same input.
- **Model tests are run cold.** Warm, the same input can give different wording, and a failure can show up in one repetition and not in another. Cold, the workshop `ollama` image gives the same answers as the benchmark container.

### Check it

The experiment is in [`experiments/models`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/models). The answers are saved, the current ones in `results/` and those of the first measurement in `history/2026-11-10/` with their fixtures, so the test checks these figures without needing Ollama:

```bash
cd experiments/models
npm install
npm test                          # rules, scoring and the figures of each stage
STAGE=llm COLD=1 REPS=1 MODES=schema node bench.mjs   # one stage with the four models, cold
STAGE=quotes COLD=1 REPS=1 MODES=schema node bench.mjs llama3.2:3b   # the Judge stage
```

Latency depends heavily on the machine load. Warm, in the `quotes` stage and with the machine idle at the start, the 12 calls of `llama3.2:3b` took between 13.7 and 40.3 seconds, with a median of 23.2 s. In the `rules` stage of the first measurement, on a laptop in normal use, between 9 and 37 seconds, with a median of 15.8 s. Cold, each call includes loading the model and the median rises to 46-48 s. The host load average is no use for monitoring the measurement while it runs: during each call, Ollama uses almost every core of the Docker VM and the load spikes. You have to check it before starting.

### How to apply it to your platform

1. Before asking an LLM, ask yourself which part of the answer the code can compute. Do not ask the model for that part.
2. Request the JSON with the schema as structured output, not only in the prompt. If the model can copy code with quotes into its answer, escape them in the input.
3. If nothing has regressed, there is nothing to explain. Do not ask.
4. Measure accuracy with a strict criterion and with saved answers. A generous criterion hides what the model makes up.
5. Measure cold, unloading the model before each call. With the prompt cache, temperature 0 and a fixed seed are not enough to reproduce an answer.

## Fix the tool before patching the workshop

### Context

The CLS and LoAF/INP subagents and the gate measure with WebPerf Snippets, through MCP and through the CLI. While building them we found three gaps in the tool:

- **The MCP did not apply throttling or measure interactions in one call.** The CLI already had `--cpu`, `--network` and `--interact-script`, but the MCP tools did not. Measuring a click with several runs and against a baseline meant opening a page, interacting and computing the median by hand.
- **The median run of an interaction was picked by navigation time.** A measurement of interactions has no LCP, FCP or TTFB, so the INP of the answer was the one of the run with the median navigation, not the median INP.
- **Scroll-Performance counted the listeners of Playwright.** When it clicks, Playwright adds `touchstart`, `touchend` and `touchcancel` listeners to `window`, and the snippet counted them as non-passive listeners of the page.

Each gap had an easy patch in the workshop code: a loop of `open_page` and `interact` with its own median, recomputing the median run or filtering out the Playwright listeners in the subagent.

### Decision

We fixed them in the tool, in three WebPerf Snippets pull requests released in 1.14.0:

| PR | Change |
|---|---|
| [#404](https://github.com/nucliweb/webperf-snippets/pull/404) | `cpu` and `network` in the tools that measure a page load, and `interactions` with `runs` and `baseline` in `run_snippet` and `run_workflow` |
| [#405](https://github.com/nucliweb/webperf-snippets/pull/405) | Without LCP, FCP or TTFB, the median run is picked by INP |
| [#406](https://github.com/nucliweb/webperf-snippets/pull/406) | Scroll-Performance leaves out the listeners that Playwright adds |

- **The workshop stays small.** Each subagent is one call to a tool with its arguments, and that is what attendees write in step 3.
- **The fix has its test where the bug is.** Each PR adds a test that fails without the change and passes with it. If a future version breaks it, the tool's test fails, not the workshop.
- **Anyone who uses the tool benefits**, not only this workshop. A patch in the workshop would have left the tool unchanged for everyone else.
- **The version is pinned** in the images, with the version table of the plan as the reference.

### Check it

Each pull request describes the bug, the change and the tests that check it, in the [WebPerf Snippets](https://github.com/nucliweb/webperf-snippets) repository. In the workshop, the tools are called with these arguments in `agents/src/subagents/cls.ts` and `loaf.ts`, and the step 3 guide explains them.

### How to apply it to your platform

1. Before writing a patch in your code, ask yourself whether anyone who uses the tool would need it. If so, it belongs in the tool.
2. Ship the fix with a test that fails without it, in the tool's repository.
3. Pin the version that includes it, and do not change it without running your tests again.
4. If you cannot change the tool, keep the patch isolated and with a link to the issue, so you can remove it when the fix arrives.

## If you want an agent to attribute, keep the names

### Context

The Judge attributes an INP or LCP regression to a function. It compares the trace-engine-cli `tasks` summaries of the baseline and of the branch, keeps the functions that are new or that grow, and looks for their name in the lines the diff adds. If it finds it, the rule gives the cause and the LLM only has to write it up.

The production build of the shop is minified, and the default minification of Rolldown renames functions. trace-engine-cli does not read source maps: the name it gives is the one in the bundle.

### What we tried

We built `main` and `pr/loaf-cart-handler` with and without `keepNames`, recorded the trace of the click on "Add to cart" on each side and applied the same Judge rules:

| Build | INP suspect | Self time | Related line of the diff |
|---|---|---|---|
| With `keepNames` | `recommendFor` | 78 ms | `setRecommended(recommendFor(product.slug));` |
| Without `keepNames` | `Ae` | 80 ms | None |

Without `keepNames`, the rules still see that a new function takes about 80 ms on the click. What is lost is the name: `Ae` is not in the diff, so nothing relates it to the change that adds it, and the LLM would have to guess the cause.

### Decision

- **The shop build keeps function names**, with `keepNames: true` in the Rolldown output (`apps/shop/vite.config.ts`). The bundle is still minified.
- **A test checks it**: `apps/shop/build.test.mjs` builds the shop and looks for the names of several functions in the bundle.
- **We discarded source maps.** trace-engine-cli does not read them, and resolving them would be one more step between the trace and the Judge.

### Check it

The experiment is in [`experiments/discarded`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/discarded). It builds both versions of each side, records the traces and applies `suspectsFor` and `matchSuspects`, the Judge rules:

```bash
cd experiments/discarded
npm install
npm test            # checks the suspect and the related line with and without keepNames
npm run measure     # prints the suspects and the lines of the diff they relate to
```

The milliseconds change from one machine to another; the test checks that with `keepNames` the suspect is `recommendFor` and relates to the line that calls it, and that without `keepNames` it does not. The build test is in [`apps/shop/build.test.mjs`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/apps/shop/build.test.mjs).

### How to apply it to your platform

1. If an agent has to relate a profile to a diff, the profile has to use the names in the diff. Measure the build that the agent can read.
2. Keep the names in that build: `keepNames` in Rolldown and esbuild, `keep_fnames` in Terser.
3. If you cannot keep them, resolve the source maps before passing the trace to the agent, not after.
4. Check in a test that the bundle keeps the names. A bundler update can change the default without warning.
