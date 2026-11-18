---
title: Presenter's guide
description: How to run the workshop. Which format to choose, what to prepare beforehand, what to say in each block and in each wait, and what to do when something goes wrong.
sidebar:
  order: 95
---

The step guides say what each attendee runs. This one says what you do in the meantime: what you explain before each command, what you ask during the waits and when you consider a step done.

## Choose the format with the room in front of you

[How to follow the workshop](../workshop/) describes three routes. The guided workshop only works if the room arrives with the lab downloaded: the images are several GB and the Wi-Fi at an event cannot handle everyone.

| What you have | Format |
|---|---|
| Two hours, and most people with a green preflight | Guided workshop |
| Less time, or a room that has not prepared its computers | Talk with a demo |
| A mixed room | Guided workshop. Whoever does not have the lab follows each regression in [The branches in the browser](../previews/), or sits with someone who does |

Decide at the start, by asking who has a green preflight. Starting with the talk is better than changing format halfway through the session.

If the room asks a lot about the metrics, give those questions the time: the [Concepts](../concepts/) are what clears up the most doubts, and cutting a step to explain them well is a good trade.

## A week before

- Send [Setup](../setup/) to whoever signs up and ask them to do it at home. The preflight has to finish with no `KO`.
- Ask them to also run the `git fetch` at the start of [step 1](../workshop/step-01/#before-you-start). It is the only command in the steps that needs the network.
- Tell them to bring their charger.

## The day before

On the computer you will present with:

- Update the repo and run the preflight: `scripts/preflight.sh`.
- Rehearse the whole of [step 5](../workshop/step-05/) once, with the machine to itself. It has to give three failures and a pass.
- Keep the CPU and the disk free. Close backups, video calls and other containers: `docker ps` should not list anything that is not the lab, and `docker system df` says how much Docker takes up.
- Open in tabs the slides, [The branches in the browser](../previews/) and the pull requests for [`pr/lcp-hero-lazy`](https://github.com/nucliweb/agent-first-perf-audits/pull/1) and [`pr/noop-refactor`](https://github.com/nucliweb/agent-first-perf-audits/pull/4). The slides already carry screenshots of the check and the comment of `pr/lcp-hero-lazy`; save the ones of `pr/noop-refactor` yourself, in case the room's network fails.
- Try the presenter view of the slides: the `n` key opens a second window with the notes of each slide, the next slide, the total time and the time of the block against its slot in the agenda. The `r` key resets the clock.
- Raise the font size of the terminal: the lines to read at each checkpoint are long.

On the day of the workshop, present with the laptop plugged in. The INP of `pr/loaf-cart-handler` depends on how fast the CPU goes, and the figures on screen change with it.

## Three rules for the whole session

- **One command, one wait, one question.** Each step has a long measurement. Run the command and use the wait for the questions in the "While you wait" section of its guide. It is the moment when people understand what they have just run.
- **The checkpoint belongs to the room, not to you.** Do not go on until the `step-0N is done.` line is on most screens. Whoever falls behind applies the solution of the current step and runs their measurement. The check of the step prints the command they are missing.
- **Measurements go one at a time, on your computer too.** While a measurement is on the projector, do not run anything else. A measurement with a busy machine can give another verdict, and explaining it live costs more than avoiding it.

The times of each block are in [the agenda](../workshop/#guided-workshop), with the machine time of each step. What is left of each slot is yours.

## Block by block

### Context

- **What you say.** Start with the problem, not the tools: four pull requests against a shop, the app tests pass on all four and three of them make worse what the person using the shop notices. Show one in the browser, the hero one, from [The branches in the browser](../previews/).
- **What you leave for later.** Of the concepts, only LCP and its phases, which step 2 needs. INP and CLS are better explained during the wait of step 3.

### Step 1: the first call to an MCP

- **What you say.** An MCP server publishes tools with names and arguments, and whoever calls them can be a program. Explain here, once, the rhythm of all the steps: red tests, solution with `git`, green tests, measurement and check.
- **The wait.** There is none: no command reaches a minute.
- **Checkpoint.** `step-01 is done.` on screen. Open your `out/first-trace.json` in the Performance panel of DevTools so people see that a trace is evidence for humans.
- **If it does not work.** When a lab does not start, the most common cause is the memory of the virtual machine. Let them go on with the `lite` profile or with whoever is next to them, and do not debug it in front of everyone.

### Step 2: the LCP subagent

- **What you say.** LCP is read by phases, and the subagent measures without deciding anything: it leaves a JSON.
- **The wait.** The measurement of the two shops. Ask them to open both in the browser and ask whether they notice the difference with the naked eye. Then, why the subagent keeps the median of three measurements.
- **Checkpoint.** The two `[orchestrator] lcp` lines, with a different slowest phase on each side: `resourceLoadTime` on the baseline and `resourceLoadDelay` on the branch.
- **If it does not work.** If the two lines say the same thing to someone, they are missing `CANDIDATE=pr-lcp-hero-lazy` before the commands.

### Step 3: Navigator, CLS and LoAF/INP

- **What you say.** A journey is a data file, the same for the Navigator, for the subagents and for the gate.
- **The wait.** It is the longest of the first four steps, and the place for the slides on INP and CLS: the three phases of an interaction, long animation frames and which shifts count. End with the question from the guide: why the Navigator goes before the other two.
- **Checkpoint.** The `loaf, candidate` line, with `add-to-cart` as the slowest journey and `DIV#root.onclick` as the script.
- **If it does not work.** An INP different from the guide's is normal: it depends on the machine. What has to match is which journey is slow and which script blocks it.
- **If you are running late.** Point 7, the CLS with the banner branch, is optional. Show it on your screen and move on.

### Step 4: the Judge

- **What you say.** The idea of the whole workshop: the rules decide and the LLM explains. With the report on screen, read in this order: the verdict, the cause and the findings that back it.
- **The wait.** The gate measurement. The three lines `judge: gate`, `judge: trace` and `judge: explanation` come out in order: ask in which one the verdict is decided, and what would show up in the report if the LLM said the opposite of the rules.
- **Checkpoint.** `[orchestrator] judge: gate: fail`, and a `report.md` in `out/agents/judge/`.
- **If it does not work.** With `lite` there is no model explanation and the report points to `handoff.md`: say so before they ask. If a report has the "Inconclusive" block at the top, the measurement is repeated, and it is a good chance to explain why a gate has to be able to say that it does not know.

### Step 5: the gate in ci

- **What you say.** Everything so far fits in one service and an exit code. The gate compares with `main`, not with Google's thresholds: the three regressions stay within "good".
- **The wait.** It is the longest of the workshop. Start the loop as soon as the block begins and explain the rest while it runs. When the first branch finishes, read its `report.md` on screen. Then show the same gate on GitHub: the check and the comment of the pull request for `pr/lcp-hero-lazy`, and the one for `pr/noop-refactor`, which passes without anyone asking the model.
- **Checkpoint.** The four exit codes, `1`, `1`, `1` and `0`.
- **If it does not work.** A branch with a regression that exits with 0 was left as inconclusive: run that branch again. If `pr-noop-refactor` exits with 1, the machine was busy.
- **If you are running late.** Show the branches that have not finished on the pull requests, and let the loop end while you close.

### Step 6 and closing

- **What you say.** What changes and what stays when you take it to another platform. Leave a few minutes for the "Your plan" table and ask two people to read a row of theirs.
- **How you close.** The five ideas of the last slide: the rules decide and the LLM explains; you compare with the base version, not with a threshold; you measure one at a time, alternating the two versions; a gate has to say when the data is not enough; and not everything has to be an MCP. For whoever wants to go on, the [Challenges](../challenges/) and the [Learnings](../learnings/).

## If something goes wrong

| What happens | What you do |
|---|---|
| The room's network does not work | The steps do not need it after the `git fetch` of step 1. The GitHub demo, with the screenshots of the slides and your own |
| Someone's lab does not start | `lite` profile if it is memory, or work in pairs. [Common problems](../troubleshooting/) for after the session |
| You are running late | Cut in this order: point 7 of step 3, the table of step 6 and the end of the loop of step 5. Step 4 is not cut |
| Your computer fails | Switch to the talk with a demo: slides, the branches in the browser and the pull requests |
| A verdict is not the one in the guide on your screen | It is material, not an accident. Show the "Inconclusive" block of the report and use [Concepts](../concepts/#why-it-matters-how-many-times-you-measure) to explain why the gate measures more times before deciding |

## The talk with a demo

The same thread in less time and with no terminal:

1. The problem, with the hero branch in the browser.
2. The concepts, with the slides: the metrics, their phases and how the gate decides.
3. The other two regressions in the browser, with DevTools open. [The branches in the browser](../previews/#how-to-see-each-regression) says what to look at in each one.
4. The gate on the pull requests: the one that fails, with its check and its comment, and the one that passes.
5. The close, with the same five ideas.
