---
title: Concepts
description: The metrics the workshop measures, how they break down and how the gate decides whether a branch got worse.
sidebar:
  order: 3
---

What is worth having clear before step 1: what the workshop measures, how each metric breaks down to see where the time goes, and how the gate decides whether a branch got worse. Each section links a reading to go further; the full list is in [References](../references/).

## Three questions, three metrics

Web Performance is what a person perceives, measured. Core Web Vitals sum it up in three questions:

| Question | Metric | "Good" up to |
|---|---|---|
| When do I see what I came to see? | LCP, Largest Contentful Paint: when the largest element on the screen is painted | 2.5 s |
| Does the page move while I use it? | CLS, Cumulative Layout Shift: how much the content moves without me causing it | 0.1 |
| Does it react as soon as I touch something? | INP, Interaction to Next Paint: how long the page takes to paint the response to an interaction | 200 ms |

The thresholds are Google's, for the 75th percentile of real visits, and they are the ones WebPerf Snippets returns with each measurement. None of the three says why: for that, each metric is broken down.

To read more: [Web Vitals](https://web.dev/articles/vitals), on web.dev.

## LCP: four phases

The LCP of an image is the sum of four times, one after another:

| Phase | What happens | When it grows |
|---|---|---|
| TTFB | Until the first byte of the HTML arrives | Slow server, redirects |
| Resource load delay | Until the browser starts requesting the image | The image is not in the HTML, has `loading="lazy"` or has no preload |
| Resource load time | How long it takes to download | Large image, low priority, slow network |
| Render delay | From when it arrives until it is painted | JavaScript or CSS that block the main thread |

Knowing which phase grows says where to look. On `pr/lcp-hero-lazy`, the load delay grows: the image loses the preload and the browser does not know it needs it until it runs the JavaScript of the page. On `pr/loaf-cart-handler`, the render delay grows: a synchronous script occupies the main thread. The same number, two causes and two different fixes.

To read more: [Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp).

## CLS: not every shift counts

A shift counts when the person did not cause it: a banner that comes in without reserved space, a font that changes size as it loads. A shift that arrives within 500 ms of an interaction does not count, such as a panel that opens on a click, because it is the response the person expects.

CLS does not add up all the shifts of the visit: it groups them in bursts and keeps the worst one. And the number is not enough to fix it: you need to know which nodes move, which is what the CLS subagent returns.

To read more: [Cumulative Layout Shift](https://web.dev/articles/cls).

## INP and long animation frames

An interaction has three phases:

| Phase | What happens |
|---|---|
| Input delay | The main thread is busy with something else and the event waits |
| Processing | The event handlers run |
| Presentation delay | The browser calculates styles and layout and paints the next frame |

The INP of a page is, roughly, its worst interaction. In the workshop there is only one, the click on "Add to cart", and on `pr/loaf-cart-handler` what grows is the processing: the handler calculates recommendations before letting the browser paint.

Long animation frames (LoAF) are the clue to attribute it: the browser records every frame that takes longer than 50 ms, with the scripts that occupy it and who invokes them. The trace of the click goes one level further down and names the function.

Since processing is pure JavaScript, INP depends on the speed of the CPU at that moment: the same branch gives more milliseconds on a slower or busier machine. That is why the guides give their figures as an example and the gate compares two shops on the same machine.

To read more: [Interaction to Next Paint](https://web.dev/articles/inp) and [Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames).

## Lab and field

| | Field | Lab |
|---|---|---|
| What it measures | Real people, with their devices and their networks | One load under fixed conditions |
| When it arrives | Days after publishing | Before the merge |
| What it is for | Knowing what really happens | Comparing two versions of the code |

A pull request gate needs the lab. The conditions of the workshop are always the same: CPU 4x (four times slower), the DevTools Fast 4G network (8.1 Mbps down, 1.35 Mbps up and 165 ms of latency) and several runs of each measurement: `--runs 5` per shop in the gate, alternating one of `main` and one of the branch.

Network throttling is not decoration: without it, the download priority of an image barely matters and the regression of `pr/lcp-hero-lazy` cannot be seen. The data is in [Why this stack](../stack/).

To read more: [Why lab and field data can be different](https://web.dev/articles/lab-and-field-data-differences).

## Compare with the baseline, not with the threshold

The three regressions of the workshop leave their metrics inside "good". A gate that only looked at Google's thresholds would let all three pass, and the page would get worse merge after merge until it crossed the threshold with no single change to blame.

That is why the gate compares each branch with its base version: the shop of `main` (the baseline) and the shop of the branch (the candidate), measured on the same machine in the same call, alternating one run of each. This way the difference between laptops does not count: a slow laptop measures both shops equally slow. Neither does whatever happens to the laptop halfway through the measurement, because it happens to both.

## How the gate decides

The gate looks at two things for each metric:

1. **Whether the change is big.** The median of the branch exceeds the median of the baseline by more than its threshold: the larger of 10% and 100 ms for LCP, the larger of 10% and 50 ms for INP, and 0.05 for CLS.
2. **Whether the change is not noise.** A statistical test, Mann-Whitney U, gives p < 0.05.

With those two answers, each metric ends up in one of three verdicts:

| Verdict | When | What the gate does |
|---|---|---|
| `regressed`, gets worse | The change beats its threshold and p < 0.05 | Fails: the CLI exits with 1 |
| `inconclusive` | The change beats its threshold, but p is not under 0.05 | Measures two more runs per shop and decides once more. If it is still the same, it does not fail, and the report says to run it again |
| `unchanged`, no change | The change does not beat its threshold | Passes |

No model takes part in that decision.

<img src="/diagrams/gate.svg" alt="The gate measures the baseline and the branch alternating their runs; if the change beats the threshold and p is under 0.05, it exits with 1, trace-engine-cli attributes the change and the LLM explains it; if it beats the threshold and p does not get there, it measures two more runs a side and decides once more; otherwise it exits with 0" width="1120" height="340" loading="lazy" decoding="async">

### What p is, without formulas

Two measurements of the same page never give the same result. Mann-Whitney U does not look at the milliseconds but at the order: it lines up all the runs of both sides, from the fastest to the slowest, and looks at how much they mix. If all the runs of the branch come after all the runs of the baseline, it is very hard for it to be chance. If they mix, it can be noise.

p is that probability: the chance of seeing an order this separated if the two shops were in fact equally fast. Below 0.05, the gate takes it as a real change.

### Why it matters how many times you measure

With few runs, the order has few possible combinations and a single run out of place changes the result. Picture a clear regression, where the branch is always slower than the baseline. This table is the p the gate gives depending on how many runs of the baseline come out, by bad luck, slower than every run of the branch, for example because the machine did something else at that moment:

| Runs a side | No slow baseline run | One slow | Two slow |
|---|---|---|---|
| 5 | 0.004 | 0.0754 | 0.3452 |
| 7 | 0.0003 | 0.0131 | 0.1043 |
| 9 | < 0.0001 | 0.002 | 0.0252 |

With 5 runs per side, a single slow run of the baseline leaves p at 0.0754, above 0.05. A gate that stopped there would pass the branch even though its LCP went up 50%. It is not a hypothesis: measuring with the laptop busy, it happened to `pr/lcp-hero-lazy` 3 times out of 20.

That is why the gate of the workshop does not stop there. When a change beats its threshold and p does not get there, it calls it inconclusive and measures up to 7 runs per shop (`--max-runs 7`), where that same slow run leaves p at 0.0131. It decides twice at most, with 5 and with 7 runs per shop, never after each added run: looking at p again and again until it drops below 0.05 would end up finding a change by chance.

### Why the order matters

Measuring all the runs of `main` first and then all those of the branch looks harmless. But about half a minute passes between one block and the other, and a laptop is not always equally fast: a backup starts, a video call comes in. If it slows down just during the block of the branch, all its runs come out slower and the test sees a regression where there is none. With the laptop busy, a branch that changes nothing failed the gate 3 times out of 40 when measured by blocks, and never when the runs of the two shops were alternated.

The lesson holds for any gate: the rules are deterministic, but the samples are not. Alternate the measurements of the two versions and, when the data is not enough to decide, let the gate say so instead of giving a pass. The figures come from the two nights of measurement of the [`gate-stability`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/gate-stability/README.md) experiment.

To read more: [Mann-Whitney U test](https://en.wikipedia.org/wiki/Mann%E2%80%93Whitney_U_test) and the [variability of lab measurements](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md), in the Lighthouse documentation.

## Who does what

| Step | Who | With what |
|---|---|---|
| Measure | The subagents and the gate | WebPerf Snippets, through MCP or its CLI |
| Decide | The rules | The threshold and the statistical test of the CLI, and its exit code |
| Attribute | The rules | trace-engine-cli names the function, the URL and the line |
| Explain | An LLM | It receives the verdict, the metrics, the trace summaries and the diff, and writes the cause in one sentence |

The subagents are not models: they are code that calls MCP tools with fixed arguments. The only model in the workshop explains, and when it contradicts the rules, the rules win. Why the work is split this way is told in [Learnings](../learnings/#the-llm-explains-the-rules-decide).
