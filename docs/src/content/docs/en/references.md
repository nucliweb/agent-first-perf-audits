---
title: References
description: Readings to go further on each topic of the workshop, with what each one adds.
sidebar:
  order: 94
---

Selected readings, by topic. Almost all are primary sources: the official documentation, the specification or the repository of the tool.

## Core Web Vitals

- [Web Vitals](https://web.dev/articles/vitals): what Core Web Vitals are and where their thresholds come from.
- [Largest Contentful Paint](https://web.dev/articles/lcp) and [Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp): the metric, its four phases and the fix for each one. This is where "never lazy-load the LCP image" comes from.
- [Fetch Priority API](https://web.dev/articles/fetch-priority): what `fetchpriority` does and how it differs from a preload.
- [Cumulative Layout Shift](https://web.dev/articles/cls), [Optimize Cumulative Layout Shift](https://web.dev/articles/optimize-cls) and [Debug layout shifts](https://web.dev/articles/debug-layout-shifts): how it is calculated, which shifts count and how to find the node that moves.
- [Interaction to Next Paint](https://web.dev/articles/inp) and [Optimize Interaction to Next Paint](https://web.dev/articles/optimize-inp): the three phases of an interaction and what to do with each one.

## Attribute a slow interaction

- [Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames): the Chrome guide, with the fields that name the script and who invokes it.
- [Long animation frame timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing), on MDN, and the [specification](https://w3c.github.io/long-animation-frames/).
- [PerformanceEventTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming), on MDN, and the [Event Timing specification](https://w3c.github.io/event-timing/): where the INP times come from.

## Measure in the lab

- [Why lab and field data can be different](https://web.dev/articles/lab-and-field-data-differences): why the lab and the field do not match, metric by metric.
- [Score Variability](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md), from Lighthouse: where the noise of a lab measurement comes from and how to reduce it.
- [Network Throttling](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md), from Lighthouse: what network and CPU throttling simulate, and how it is calibrated with the speed of the machine.
- [Throttling](https://developer.chrome.com/docs/devtools/settings/throttling), in DevTools: how to calibrate CPU throttling on your machine.
- [Performance features reference](https://developer.chrome.com/docs/devtools/performance/reference): how to read a trace in the Performance panel, which is where the one from step 1 opens.

## A performance gate

- [Performance budgets 101](https://web.dev/articles/performance-budgets-101): the idea of a performance budget, the predecessor of the gate.
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci): another way to run a performance check on every commit, with absolute thresholds.
- [Performance Sheriffing](https://firefox-source-docs.mozilla.org/testing/perfdocs/perf-sheriffing.html), from Firefox: how a large project detects and handles performance regressions every day.
- [Exploring Statistical Change Point Detection Techniques for Performance Anomaly Detection at Mozilla](https://arxiv.org/abs/2606.18377): a study of the false positives of those alerts that compares 25 change point detection methods to reduce them.

## The statistics of the gate

- [Mann-Whitney U test](https://en.wikipedia.org/wiki/Mann%E2%80%93Whitney_U_test): the test the gate uses, and why it looks at the order and not the values.
- [Interpreting results: Mann-Whitney test](https://www.graphpad.com/guides/prism/8/statistics/how_the_mann-whitney_test_works.htm): a plain explanation, with the case of small samples.
- [scipy.stats.mannwhitneyu](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.mannwhitneyu.html): when the p-value is exact and when it is an approximation.
- [Hodges-Lehmann estimator](https://en.wikipedia.org/wiki/Hodges%E2%80%93Lehmann_estimator): how to estimate how much changed, which is the figure that goes with p in the reports.

## MCP and the workshop tools

- [Model Context Protocol](https://modelcontextprotocol.io/specification/2025-11-25): the specification. Its pages on [transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) and [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) explain stdio and the structured result the subagents read.
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk): the client `agents/src/mcp/client.ts` uses.
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp), with its [tool list](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md) and the [announcement](https://developer.chrome.com/blog/chrome-devtools-mcp) that tells what it was made for.
- [WebPerf Snippets](https://github.com/nucliweb/webperf-snippets): the measurements, the workflows and the gate with baseline, through MCP and through CLI.
- [trace-engine-cli](https://github.com/ChromeDevTools/trace-engine-cli): the trace summaries that name the function, and the [DevTools trace engine](https://github.com/ChromeDevTools/devtools-frontend/tree/main/front_end/models/trace) it builds on.
- [TOON](https://github.com/toon-format/toon): the compact format of those summaries.

## The model that explains

- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents): start with the simplest solution and put code checks between the steps of a model.
- [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents): how to design tools that return little text, and very useful text.
- [Structured outputs](https://docs.ollama.com/capabilities/structured-outputs), in Ollama: how the local model is forced to answer with the schema of the verdict.
- [JSON Schema](https://json-schema.org/understanding-json-schema/): the reference to read `agents/schemas/verdict.schema.json`.

## The lab

- [Profiles](https://docs.docker.com/compose/how-tos/profiles/), in Docker Compose: how the `llm` and `lite` profiles coexist.
- [Browsers](https://playwright.dev/docs/browsers), in Playwright: the difference between the full Chromium and the headless shell.
- [`keepNames`](https://rolldown.rs/reference/OutputOptions.keepNames), in Rolldown: the option that keeps function names in the shop build.
