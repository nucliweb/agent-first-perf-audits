---
title: How to follow the workshop
description: Three ways through the same material, depending on how much time you have and whether you will start the lab. A talk with a demo, the guided workshop or the workshop on your own.
sidebar:
  order: 1
---

The workshop builds a performance gate for pull requests: agents measure a shop before and after a change, rules decide whether it got worse and an LLM explains the cause. It is one set of material, with three ways through it.

## Three routes

| Route | Duration | What you need | What it includes |
|---|---|---|---|
| [Talk with a demo](#talk-with-a-demo) | 45 to 60 min | A browser | The concepts, the four branches in the browser and the gate on a GitHub pull request |
| [Guided workshop](#guided-workshop) | 2 h | The lab, downloaded at home | The six steps, with someone setting the pace |
| [On your own](#on-your-own) | 2 to 3 h | The lab | The same six steps at your own pace, and the challenges |

All three tell the same story: classic CI does not see performance regressions, the rules decide and the LLM explains. What changes is how much you run yourself.

With 8 GB of RAM, both routes that use the lab work with the `lite` profile, with no local model: [Setup](../setup/#with-8-gb-the-lite-profile) explains it.

## Talk with a demo

For an audience that will not open the terminal, or to decide whether the whole workshop is for you. No Docker needed.

1. **The concepts.** What LCP, CLS and INP measure, their phases and how the gate decides, in [Concepts](../concepts/) or in [the slides](/slides/en/).
2. **The four branches in the browser.** The shop of `main` and the one of each branch are deployed, and [The branches in the browser](../previews/) says what to look at in DevTools on each one.
3. **The gate on a pull request.** Each `pr/*` branch of the repo has its pull request, with the gate check and the report in a comment. Start with the one for [`pr/lcp-hero-lazy`](https://github.com/nucliweb/agent-first-perf-audits/pull/1), which fails, and compare it with the one for [`pr/noop-refactor`](https://github.com/nucliweb/agent-first-perf-audits/pull/4), which passes.

On GitHub Actions, Claude Sonnet 5.5 writes the explanation instead of the local model, and the verdict comes from the same rules. [Learnings](../learnings/#the-same-input-to-a-larger-model) compares the two explanations with the same input.

## Guided workshop

Two hours, with a presenter who sets the pace; for that person there is the [presenter's guide](../facilitator/). Attendees arrive with the lab downloaded and the preflight green: [Setup](../setup/) is done at home, because the images weigh several GB.

The agenda, with the machine time of each step. What is left of each slot is for explaining, looking at the results and waiting for whoever goes slower:

| Start | Block | In the agenda | Machine, `llm` | Machine, `lite` |
|---|---|---|---|---|
| 0:00 | Context: why classic CI does not see these regressions | 10 min | | |
| 0:10 | [1. The first call to an MCP](step-01/) | 15 min | 0.8 min | 0.8 min |
| 0:25 | [2. The LCP subagent](step-02/) | 20 min | 2.9 min | 2.9 min |
| 0:45 | [3. Navigator, CLS and LoAF/INP](step-03/) | 20 min | 6.9 min | 6.9 min |
| 1:05 | [4. The Judge](step-04/) | 20 min | 4.6 min | 4.0 min |
| 1:25 | [5. The gate in `ci` against the four branches](step-05/) | 20 min | 11.3 min | 9.5 min |
| 1:45 | [6. Take it to your platform](step-06/), learnings and questions | 15 min | | |
| | Total | 120 min | 26.5 min | 24.0 min |

The machine times are those of the reference Mac, measured with the [timed rehearsal](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.md), which runs the commands of the guides on a clean clone. On another computer they change. The total is added up before rounding.

## On your own

The same six steps, with nobody setting the pace. The guides of steps 1 to 5 are written to be followed alone:

- **What you will learn** and **The idea in a minute** put the concept before the commands.
- **Step by step** gives each command with the output it has to produce.
- **While you wait** says what to look at during the long measurements, from step 2 to 5.
- **Checkpoint** and **If something fails** say when to consider the step done and what to do when it does not work out.

The order:

1. [Setup](../setup/): check your computer and download the lab.
2. [Concepts](../concepts/): the metrics and how the gate decides. If a term is unfamiliar, it is in the [Glossary](../glossary/).
3. The steps, from [1](step-01/) to [6](step-06/). You do not need to write code: steps 1 to 4 apply their code with `git checkout`, and writing it yourself is optional.
4. The [Challenges](../challenges/), once the gate works for you: fix a regression and watch the gate pass, ask another model for the explanation, remove the throttling to see what stops showing and create your own regression.

You can split it over several days. `docker compose down` stops the lab and `docker compose up -d` starts it again; what you have done stays in your `taller` branch and in the `out/` folder. With `lite`, put `COMPOSE_PROFILES=lite` in front, as in the rest of the workshop.
